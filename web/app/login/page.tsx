import { signInWithMagicLink } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
}) {
  return <LoginForm searchParams={searchParams} />;
}

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sent?: string }>;
}) {
  const { next, error, sent } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form
        action={signInWithMagicLink}
        className="w-full max-w-sm space-y-4 bg-panel p-8 rounded-xl border border-white/5"
      >
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-gray-400">
          We'll email you a magic link. No password needed.
        </p>
        <input type="hidden" name="next" value={next ?? '/dashboard'} />
        <label className="block text-sm">
          <span className="text-gray-300">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md bg-black/40 border border-white/10 px-3 py-2 text-gray-100"
            placeholder="you@team.com"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {sent && (
          <p className="text-sm text-emerald-400">Check your inbox for the link.</p>
        )}
        <button
          type="submit"
          className="w-full bg-white text-black rounded-md py-2 font-medium hover:bg-gray-200"
        >
          Send magic link
        </button>
      </form>
    </main>
  );
}
