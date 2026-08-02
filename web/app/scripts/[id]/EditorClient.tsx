'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Placeholder from '@tiptap/extension-placeholder';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SupabaseYjsProvider, colorForUser } from '@optaprompter/shared';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import EditorToolbar from '@/components/EditorToolbar';
import RoomBadge from '@/components/RoomBadge';

interface Props {
  scriptId: string;
  roomId: string;
  title: string;
  user: { id: string; email: string; displayName: string };
}

export default function EditorClient({ scriptId, roomId, title, user }: Props) {
  const supabase = useMemo(createBrowserSupabase, []);
  const [status, setStatus] = useState<'connecting' | 'synced' | 'disconnected' | 'error'>('connecting');

  // A single Y.Doc and awareness for the lifetime of this component.
  const { doc, awareness } = useMemo(() => {
    const doc = new Y.Doc();
    const awareness = new Awareness(doc);
    return { doc, awareness };
  }, [scriptId]);

  useEffect(() => {
    awareness.setLocalStateField('user', {
      name: user.displayName,
      color: colorForUser(user.id),
      userId: user.id,
    });

    const provider = new SupabaseYjsProvider({
      supabase,
      doc,
      roomId,
      scriptId,
      awareness: awareness as unknown as ConstructorParameters<
        typeof SupabaseYjsProvider
      >[0]['awareness'],
      onStatus: setStatus,
      writable: true,
      debug: true,
    });

    // Merge remote awareness snapshots (broadcast via the provider) into
    // this Awareness instance so Tiptap's CollaborationCursor can render them.
    const onRemoteAwareness = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as { clientId: number; state: Record<string, unknown> | null };
      if (!detail || detail.clientId === awareness.clientID) return;
      // Directly mutate the internal states map — Awareness doesn't expose a
      // public setter for foreign clients, so we use its states + emit.
      const states = (awareness as unknown as { states: Map<number, unknown> }).states;
      if (detail.state === null) states.delete(detail.clientId);
      else states.set(detail.clientId, detail.state);
      // Trigger 'change' listeners (CollaborationCursor listens for this).
      (awareness as unknown as {
        emit: (name: string, args: unknown[]) => void;
      }).emit('change', [{ added: [], updated: [detail.clientId], removed: [] }, 'remote']);
    };
    globalThis.addEventListener('optaprompter:awareness', onRemoteAwareness);

    return () => {
      globalThis.removeEventListener('optaprompter:awareness', onRemoteAwareness);
      void provider.destroy();
    };
  }, [doc, awareness, supabase, roomId, scriptId, user.id, user.displayName]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Placeholder.configure({ placeholder: 'Start writing the script…' }),
      Collaboration.configure({ document: doc }),
      CollaborationCursor.configure({
        provider: {
          awareness,
        } as unknown as ConstructorParameters<typeof CollaborationCursor>[0]['provider'],
        user: {
          name: user.displayName,
          color: colorForUser(user.id),
        },
      }),
    ],
    immediatelyRender: false,
  }, [doc, awareness, user.id]);

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-6 py-6 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-medium">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <RoomBadge roomId={roomId} />
        </div>
      </header>

      <EditorToolbar editor={editor} />

      <div className="bg-panel border border-white/5 rounded-lg">
        <EditorContent editor={editor} />
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    connecting: 'bg-yellow-500/20 text-yellow-300',
    synced: 'bg-emerald-500/20 text-emerald-300',
    disconnected: 'bg-gray-500/20 text-gray-300',
    error: 'bg-red-500/20 text-red-300',
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full ${map[status] ?? ''}`}>
      {status}
    </span>
  );
}
