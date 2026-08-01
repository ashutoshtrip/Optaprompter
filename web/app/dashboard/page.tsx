import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { createScript, deleteScript } from './actions';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: scripts } = await supabase
    .from('scripts')
    .select('id, title, room_id, updated_at')
    .order('updated_at', { ascending: false });

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-6 py-10 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your scripts</h1>
          <p className="text-sm text-gray-400">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="text-sm text-gray-400 hover:text-white">Sign out</button>
        </form>
      </header>

      <form
        action={createScript}
        className="flex gap-2 bg-panel border border-white/5 rounded-lg p-3"
      >
        <input
          name="title"
          placeholder="New script title…"
          className="flex-1 rounded-md bg-black/40 border border-white/10 px-3 py-2 text-gray-100"
        />
        <button className="bg-white text-black rounded-md px-4 font-medium hover:bg-gray-200">
          Create
        </button>
      </form>

      <ul className="space-y-2">
        {(scripts ?? []).map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between bg-panel border border-white/5 rounded-lg px-4 py-3"
          >
            <Link href={`/scripts/${s.id}`} className="flex-1 group">
              <div className="font-medium group-hover:text-white">{s.title}</div>
              <div className="text-xs text-gray-500">
                Room <span className="font-mono">{s.room_id}</span> · updated{' '}
                {new Date(s.updated_at).toLocaleString()}
              </div>
            </Link>
            <form action={deleteScript}>
              <input type="hidden" name="id" value={s.id} />
              <button className="text-xs text-gray-500 hover:text-red-400">Delete</button>
            </form>
          </li>
        ))}
        {(!scripts || scripts.length === 0) && (
          <li className="text-sm text-gray-500 italic">No scripts yet — create one above.</li>
        )}
      </ul>
    </main>
  );
}
