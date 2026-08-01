/**
 * SupabaseYjsProvider — a minimal Yjs sync provider over Supabase Realtime.
 *
 * Two channels of communication:
 *  - **broadcast** (transient): every local Y.Doc update is broadcast to peers
 *    subscribed to `room:{roomId}`. Awareness updates ride the same channel.
 *  - **snapshot** (durable): on a debounced timer, the full `Y.encodeStateAsUpdate`
 *    is written to `scripts.y_state` so late joiners can bootstrap.
 *
 * On connect the provider fetches the row snapshot, applies it, then joins the
 * broadcast channel. From that point onward peers converge via CRDT merge.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import * as Y from 'yjs';

export interface AwarenessLike {
  clientID: number;
  getLocalState(): Record<string, unknown> | null;
  setLocalState(state: Record<string, unknown> | null): void;
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, fn: (...args: unknown[]) => void): void;
  off(event: string, fn: (...args: unknown[]) => void): void;
}

export interface SupabaseYjsOptions {
  supabase: SupabaseClient;
  doc: Y.Doc;
  roomId: string;
  scriptId: string;
  awareness?: AwarenessLike;
  /** ms between durable snapshot flushes (default 2000) */
  flushIntervalMs?: number;
  /** true for editor (writes back), false for read-only reader */
  writable?: boolean;
  onStatus?: (status: 'connecting' | 'synced' | 'disconnected' | 'error') => void;
}

type BroadcastPayload =
  | { kind: 'update'; origin: number; b64: string }
  | { kind: 'awareness'; origin: number; b64: string };

const toB64 = (u8: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(u8).toString('base64');
};

const fromB64 = (b64: string): Uint8Array => {
  const bin = typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export class SupabaseYjsProvider {
  private supabase: SupabaseClient;
  private doc: Y.Doc;
  private roomId: string;
  private scriptId: string;
  private awareness?: AwarenessLike;
  private channel: RealtimeChannel | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushIntervalMs: number;
  private writable: boolean;
  private onStatus?: SupabaseYjsOptions['onStatus'];
  private dirty = false;
  private disposed = false;

  constructor(opts: SupabaseYjsOptions) {
    this.supabase = opts.supabase;
    this.doc = opts.doc;
    this.roomId = opts.roomId;
    this.scriptId = opts.scriptId;
    this.awareness = opts.awareness;
    this.flushIntervalMs = opts.flushIntervalMs ?? 2000;
    this.writable = opts.writable ?? true;
    this.onStatus = opts.onStatus;

    this.doc.on('update', this.handleLocalUpdate);
    if (this.awareness) this.awareness.on('update', this.handleAwarenessUpdate);

    void this.start();
  }

  private setStatus(s: Parameters<NonNullable<SupabaseYjsOptions['onStatus']>>[0]) {
    this.onStatus?.(s);
  }

  private async start() {
    this.setStatus('connecting');

    // 1. Load existing snapshot from Postgres.
    try {
      const { data, error } = await this.supabase
        .from('scripts')
        .select('y_state')
        .eq('id', this.scriptId)
        .maybeSingle();
      if (error) throw error;
      if (data?.y_state) {
        const bytes =
          data.y_state instanceof Uint8Array
            ? data.y_state
            : fromB64(String(data.y_state).replace(/^\\x/, ''));
        try {
          Y.applyUpdate(this.doc, bytes, 'supabase-snapshot');
        } catch {
          // ignore malformed snapshots — CRDT will re-converge from peers
        }
      }
    } catch {
      // read failure is non-fatal; keep going with broadcast
    }

    // 2. Join broadcast channel.
    const channel = this.supabase.channel(`room:${this.roomId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on('broadcast', { event: 'yjs' }, ({ payload }) =>
      this.handleRemote(payload as BroadcastPayload),
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.setStatus('synced');
        // Broadcast our full state so peers who joined before us catch up.
        void this.broadcast({
          kind: 'update',
          origin: this.doc.clientID,
          b64: toB64(Y.encodeStateAsUpdate(this.doc)),
        });
        if (this.awareness) {
          const localState = this.awareness.getLocalState();
          if (localState) this.pushAwareness([this.awareness.clientID]);
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        this.setStatus('error');
      } else if (status === 'CLOSED') {
        this.setStatus('disconnected');
      }
    });

    this.channel = channel;
  }

  private handleLocalUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === 'supabase-remote' || origin === 'supabase-snapshot') return;
    this.dirty = true;
    void this.broadcast({
      kind: 'update',
      origin: this.doc.clientID,
      b64: toB64(update),
    });
    this.scheduleFlush();
  };

  private handleAwarenessUpdate = () => {
    if (!this.awareness) return;
    this.pushAwareness([this.awareness.clientID]);
  };

  private pushAwareness(clients: number[]) {
    if (!this.awareness) return;
    // Encode via y-protocols if available; otherwise send a lightweight
    // JSON snapshot (best-effort — the full awareness protocol is optional).
    const state = this.awareness.getLocalState();
    const payload = { clientId: this.awareness.clientID, state, clients };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    void this.broadcast({
      kind: 'awareness',
      origin: this.awareness.clientID,
      b64: toB64(bytes),
    });
  }

  private handleRemote(payload: BroadcastPayload) {
    if (payload.origin === this.doc.clientID) return;
    try {
      const bytes = fromB64(payload.b64);
      if (payload.kind === 'update') {
        Y.applyUpdate(this.doc, bytes, 'supabase-remote');
      } else if (payload.kind === 'awareness' && this.awareness) {
        const decoded = JSON.parse(new TextDecoder().decode(bytes));
        if (decoded && typeof decoded.clientId === 'number') {
          // We can't call setStates directly on the abstract awareness; expose
          // it via a custom event so the app can merge with y-protocols.
          const evt = new CustomEvent('optaprompter:awareness', { detail: decoded });
          if (typeof globalThis.dispatchEvent === 'function') {
            globalThis.dispatchEvent(evt);
          }
        }
      }
    } catch {
      /* swallow — remote frame malformed */
    }
  }

  private async broadcast(payload: BroadcastPayload) {
    if (!this.channel) return;
    try {
      await this.channel.send({ type: 'broadcast', event: 'yjs', payload });
    } catch {
      /* transient; state re-broadcasts on next update */
    }
  }

  private scheduleFlush() {
    if (!this.writable) return;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  async flush() {
    if (!this.writable || !this.dirty || this.disposed) return;
    this.dirty = false;
    const state = Y.encodeStateAsUpdate(this.doc);
    try {
      await this.supabase
        .from('scripts')
        .update({ y_state: state })
        .eq('id', this.scriptId);
    } catch {
      this.dirty = true; // retry on next update
    }
  }

  async destroy() {
    this.disposed = true;
    this.doc.off('update', this.handleLocalUpdate);
    if (this.awareness) this.awareness.off('update', this.handleAwarenessUpdate);
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush().catch(() => {});
    if (this.channel) {
      await this.supabase.removeChannel(this.channel).catch(() => {});
      this.channel = null;
    }
  }
}
