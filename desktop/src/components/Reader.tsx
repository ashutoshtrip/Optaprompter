import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SupabaseYjsProvider } from '@optaprompter/shared';
import type { PickedScript } from './RoomPicker';
import OverlayControls from './OverlayControls';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface Props {
  supabase: SupabaseClient;
  script: PickedScript;
  onLeave: () => void;
}

export default function Reader({ supabase, script, onLeave }: Props) {
  const [status, setStatus] = useState<'connecting' | 'synced' | 'disconnected' | 'error'>('connecting');
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);        // px/sec
  const [fontSize, setFontSize] = useState(32);
  const [opacity, setOpacity] = useState(0.35);
  const [timerSec, setTimerSec] = useState(0);
  const [clickThrough, setClickThrough] = useState(false);
  const [protectedFromCapture, setProtectedFromCapture] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // One Y.Doc per script mount.
  const doc = useMemo(() => new Y.Doc(), [script.id]);

  useEffect(() => {
    const provider = new SupabaseYjsProvider({
      supabase,
      doc,
      roomId: script.roomId,
      scriptId: script.id,
      writable: false, // reader never writes back
      onStatus: setStatus,
    });
    return () => { void provider.destroy(); };
  }, [doc, supabase, script.id, script.roomId]);

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: doc }),
    ],
    immediatelyRender: false,
  }, [doc]);

  // Sync overlay state from Rust (hotkey may change click-through).
  useEffect(() => {
    invoke<boolean>('get_click_through').then(setClickThrough).catch(() => {});
    invoke<boolean>('get_content_protected').then(setProtectedFromCapture).catch(() => {});
    const un = listen<boolean>('click-through-changed', (e) => setClickThrough(e.payload));
    return () => { un.then((f) => f()); };
  }, []);

  // Timer.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [playing]);

  // Auto-scroll via rAF for smooth sub-pixel motion at low speeds.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = scrollRef.current;
      if (el) {
        el.scrollTop += speed * dt;
        // stop at end
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) setPlaying(false);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  // In-window hotkeys (Space / arrows / R).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.code === 'ArrowUp')   setSpeed((s) => Math.max(20, s - 10));
      else if (e.code === 'ArrowDown') setSpeed((s) => Math.min(300, s + 10));
      else if (e.key === '+' || e.key === '=') setFontSize((f) => Math.min(72, f + 2));
      else if (e.key === '-' || e.key === '_') setFontSize((f) => Math.max(18, f - 2));
      else if (e.key.toLowerCase() === 'r') setTimerSec(0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const readerStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    background: `rgba(0,0,0,${opacity})`,
  };

  return (
    <div className="reader-shell">
      <OverlayControls
        clickThrough={clickThrough}
        protectedFromCapture={protectedFromCapture}
        playing={playing}
        speed={speed}
        fontSize={fontSize}
        opacity={opacity}
        timerSec={timerSec}
        scriptTitle={script.title}
        roomId={script.roomId}
        onSpeed={setSpeed}
        onFontSize={setFontSize}
        onOpacity={setOpacity}
        onTogglePlay={() => setPlaying((p) => !p)}
        onResetTimer={() => setTimerSec(0)}
        onLeave={onLeave}
        onProtectedChanged={setProtectedFromCapture}
      />

      <div className="reader-body" ref={scrollRef} style={readerStyle}>
        <div className={`status-pill ${status}`}>{status}</div>
        <EditorContent editor={editor} />
        <div className="reader-tail" />
      </div>
    </div>
  );
}
