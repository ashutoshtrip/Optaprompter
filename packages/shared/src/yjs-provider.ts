/**
 * SupabaseYjsProvider — a minimal Yjs sync provider over Supabase Realtime.
 *
 *  - **broadcast** (transient): local Y.Doc updates go out on the
 *    `room:{roomId}` channel. Awareness updates ride the same channel.
 *  - **snapshot** (durable): every 2s (debounced) the full
 *    `Y.encodeStateAsUpdate(doc)` is base64-encoded and stored in
 *    `scripts.y_state` (a `text` column). Late joiners fetch this to
 *    bootstrap.
 *  - **handshake** (live catch-up): whenever a peer subscribes, it sends a
 *    `sync-request`. Any peer that receives one replies with a
 *    `sync-response` containing its full state. This is the belt-and-
 *    suspenders path so the desktop reader converges even if the snapshot
 *    hasn't been flushed yet.
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
  flushIntervalMs?: number;
  writable?: boolean;
  onStatus?: (status: 'connecting' | 'synced' | 'disconnected' | 'error') => void;
  debug?: boolean;
}

type BroadcastPayload =
  | { kind: 'update'; origin: number; b64: string }
  | { kind: 'sync-request'; origin: number }
  | { kind: 'sync-response'; origin: number; b64: string }
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
  private debug: boolean;
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
    this.debug = opts.debug ?? false;

    this.doc.on('update', this.handleLocalUpdate);
    if (this.awareness) this.awareness.on('update', this.handleAwarenessUpdate);

    void this.start();
  }

  private log(...args: unknown[]) {
    if (this.debug) {
      // eslint-disable-next-line no-console
      console.log('[SupabaseYjsProvider]', `room:${this.roomId}`, ...args);
    }
  }

  private setStatus(s: Parameters<NonNullable<SupabaseYjsOptions['onStatus']>>[0]) {
    this.onStatus?.(s);
  }

  private async start() {
    this.setStatus('connecting');

    // 1. Load durable snapshot (base64-encoded text in the DB).
    try {
      const { data, error } = await this.supabase
        .from('scripts')
        .select('y_state')
        .eq('id', this.scriptId)
        .maybeSingle();
      if (error) throw error;
      const b64 = data?.y_state;
      if (typeof b64 === 'string' && b64.length > 0) {
        try {
          Y.applyUpdate(this.doc, fromB64(b64), 'supabase-snapshot');
          this.log('applied snapshot bytes:', b64.length);
        } catch (e) {
          this.log('snapshot apply failed (ignored):', e);
        }
      }
    } catch (e) {
      this.log('snapshot fetch failed (ignored):', e);
    }

    // 2. Join broadcast channel.
    const channel = this.supabase.channel(`room:${this.roomId}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    channel.on('broadcast', { event: 'yjs' }, ({ payload }) =>
      this.handleRemote(payload as BroadcastPayload),
    );

    channel.subscribe((status) => {
      this.log('subscribe status:', status);
      if (status === 'SUBSCRIBED') {
        this.setStatus('synced');
        // Ask any existing peers for their state...
        void this.broadcast({ kind: 'sync-request', origin: this.doc.clientID });
        // ...and offer ours in case we're the one with content.
        void this.broadcast({
          kind: 'sync-response',
          origin: this.doc.clientID,
          b64: toB64(Y.encodeStateAsUpdate(this.doc)),
        });
        if (this.awareness?.getLocalState()) this.pushAwareness();
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
    this.pushAwareness();
  };

  private pushAwareness() {
    if (!this.awareness) return;
    const state = this.awareness.getLocalState();
    const payload = { clientId: this.awareness.clientID, state };
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
      if (payload.kind === 'update' || payload.kind === 'sync-response') {
        Y.applyUpdate(this.doc, fromB64(payload.b64), 'supabase-remote');
        this.log('applied remote', payload.kind, 'from', payload.origin);
      } else if (payload.kind === 'sync-request') {
        // A new peer joined — send them our full state.
        void this.broadcast({
          kind: 'sync-response',
          origin: this.doc.clientID,
          b64: toB64(Y.encodeStateAsUpdate(this.doc)),
        });
        this.log('replied to sync-request from', payload.origin);
      } else if (payload.kind === 'awareness' && this.awareness) {
        const bytes = fromB64(payload.b64);
        const decoded = JSON.parse(new TextDecoder().decode(bytes));
        if (decoded && typeof decoded.clientId === 'number') {
          const evt = new CustomEvent('optaprompter:awareness', { detail: decoded });
          if (typeof globalThis.dispatchEvent === 'function') {
            globalThis.dispatchEvent(evt);
          }
        }
      }
    } catch (e) {
      this.log('remote frame parse/apply failed (ignored):', e);
    }
  }

  private async broadcast(payload: BroadcastPayload) {
    if (!this.channel) return;
    try {
      await this.channel.send({ type: 'broadcast', event: 'yjs', payload });
    } catch (e) {
      this.log('broadcast failed:', e);
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
    const b64 = toB64(Y.encodeStateAsUpdate(this.doc));
    try {
      const { error } = await this.supabase
        .from('scripts')
        .update({ y_state: b64 })
        .eq('id', this.scriptId);
      if (error) {
        this.dirty = true;
        this.log('flush failed:', error);
      } else {
        this.log('flushed snapshot bytes:', b64.length);
      }
    } catch (e) {
      this.dirty = true;
      this.log('flush threw:', e);
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
