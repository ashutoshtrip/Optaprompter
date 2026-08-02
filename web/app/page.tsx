import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DownloadDesktopButton from '@/components/DownloadDesktopButton';

export default async function Landing() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl text-center space-y-6">
        <h1 className="text-4xl font-bold tracking-tight">OptaPrompter</h1>
        <p className="text-gray-400">
          A collaborative teleprompter. Your team edits the script live in the
          browser; the presenter reads it from an overlay that&apos;s invisible to
          Zoom, Meet, and Teams.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/login"
            className="inline-block bg-white text-black rounded-lg px-6 py-3 font-medium hover:bg-gray-200 transition"
          >
            Sign in to continue
          </Link>
          <DownloadDesktopButton variant="ghost" />
        </div>
      </div>
    </main>
  );
}
