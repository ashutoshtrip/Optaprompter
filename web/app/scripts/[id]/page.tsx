import { notFound, redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import EditorClient from './EditorClient';

export const dynamic = 'force-dynamic';

export default async function ScriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: script } = await supabase
    .from('scripts')
    .select('id, title, room_id, owner_id')
    .eq('id', id)
    .maybeSingle();

  if (!script) notFound();

  return (
    <EditorClient
      scriptId={script.id}
      roomId={script.room_id}
      title={script.title}
      user={{
        id: user.id,
        email: user.email ?? '',
        displayName: (user.user_metadata?.display_name as string | undefined) ?? user.email ?? 'Anon',
      }}
    />
  );
}
