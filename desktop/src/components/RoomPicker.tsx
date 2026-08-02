import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PickedScript {
  id: string;
  title: string;
  roomId: string;
}

interface Props {
  supabase: SupabaseClient;
  onPick: (s: PickedScript) => void;
  onSignOut: () => void;
}

export default function RoomPicker({ supabase, onPick, onSignOut }: Props) {
  const [scripts, setScripts] = useState<
    Array<{ id: string; title: string; room_id: string; updated_at: string }>
  >([]);
  const [manual, setManual] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data, error } = await supabase
        .from('scripts')
        .select('id, title, room_id, updated_at')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false });
      if (error) setErr(error.message);
      else setScripts(data ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const joinManual = async () => {
    const code = manual.trim().toUpperCase();
    if (!code) return;
    setErr(null);
    const { data, error } = await supabase
      .from('scripts')
      .select('id, title, room_id')
      .eq('room_id', code)
      .maybeSingle();
    if (error) { setErr(error.message); return; }
    if (!data) { setErr('No script for that room code (or you lack access).'); return; }
    onPick({ id: data.id, title: data.title, roomId: data.room_id });
  };

  return (
    <div className="picker">
      <div className="picker-head">
        <h2>Pick a script</h2>
        <button className="link" onClick={onSignOut}>Sign out</button>
      </div>

      <div className="manual">
        <input
          placeholder="Enter room code from a shared script (e.g. K7XM-P29A)"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void joinManual(); }}
        />
        <button onClick={joinManual}>Join</button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
        Anyone with the room code can join and sync live — no invite needed.
      </p>

      {err && <p className="err">{err}</p>}
      {loading && <p className="muted">Loading…</p>}

      <ul className="script-list">
        {scripts.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onPick({ id: s.id, title: s.title, roomId: s.room_id })}
            >
              <div className="title">{s.title}</div>
              <div className="sub">
                <span className="mono">{s.room_id}</span> · {new Date(s.updated_at).toLocaleString()}
              </div>
            </button>
          </li>
        ))}
        {!loading && scripts.length === 0 && (
          <li className="muted">No scripts yet — create one in the web app.</li>
        )}
      </ul>
    </div>
  );
}
