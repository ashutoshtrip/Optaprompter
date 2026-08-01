'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { generateRoomId } from '@optaprompter/shared';
import { createServerSupabase } from '@/lib/supabase/server';

export async function createScript(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim() || 'Untitled';
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const room_id = generateRoomId();
  const { data, error } = await supabase
    .from('scripts')
    .insert({ title, room_id, owner_id: user.id })
    .select('id')
    .single();

  if (error || !data) {
    revalidatePath('/dashboard');
    return;
  }
  redirect(`/scripts/${data.id}`);
}

export async function deleteScript(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const supabase = await createServerSupabase();
  await supabase.from('scripts').delete().eq('id', id);
  revalidatePath('/dashboard');
}
