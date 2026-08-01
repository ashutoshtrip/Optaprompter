import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './lib/supabase';
import AuthGate from './components/AuthGate';
import RoomPicker, { PickedScript } from './components/RoomPicker';
import Reader from './components/Reader';

type View =
  | { kind: 'loading' }
  | { kind: 'auth' }
  | { kind: 'picker' }
  | { kind: 'reader'; script: PickedScript };

export default function App() {
  const supabase = useMemo(getSupabase, []);
  const [view, setView] = useState<View>({ kind: 'loading' });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setView(data.session ? { kind: 'picker' } : { kind: 'auth' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      if (!s) setView({ kind: 'auth' });
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setView({ kind: 'auth' });
  };

  if (view.kind === 'loading') return <div className="center-fill muted">Loading…</div>;

  if (view.kind === 'auth')
    return <AuthGate supabase={supabase} onSignedIn={(_s: Session) => setView({ kind: 'picker' })} />;

  if (view.kind === 'picker')
    return (
      <RoomPicker
        supabase={supabase}
        onPick={(script) => setView({ kind: 'reader', script })}
        onSignOut={signOut}
      />
    );

  return (
    <Reader
      supabase={supabase}
      script={view.script}
      onLeave={() => setView({ kind: 'picker' })}
    />
  );
}
