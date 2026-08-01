import { useState } from 'react';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

interface Props {
  supabase: SupabaseClient;
  onSignedIn: (session: Session) => void;
}

type Mode = 'magic' | 'password' | 'signup';

export default function AuthGate({ supabase, onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reset = () => { setErr(null); setInfo(null); };

  const sendMagic = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      // shouldCreateUser: false → don't silently create a new account if
      // the email is unknown. Flip to true if you want desktop-only signup.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpSent(true);
      setInfo('Check your email for a 6-digit code and paste it below.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp.trim(),
        type: 'email',
      });
      if (error) throw error;
      if (data.session) onSignedIn(data.session);
      else setErr('No session returned — try again.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Invalid or expired code');
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setBusy(true);
    try {
      const req =
        mode === 'signup'
          ? supabase.auth.signUp({ email, password })
          : supabase.auth.signInWithPassword({ email, password });
      const { data, error } = await req;
      if (error) throw error;
      if (data.session) onSignedIn(data.session);
      else setInfo('Check your email to confirm the account, then sign in.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form
        onSubmit={
          mode === 'magic'
            ? otpSent
              ? verifyOtp
              : sendMagic
            : submitPassword
        }
        className="auth-card"
      >
        <h2>OptaPrompter</h2>
        <p className="muted">
          {mode === 'magic'
            ? otpSent
              ? 'Enter the 6-digit code we emailed you.'
              : "We'll email you a 6-digit sign-in code."
            : mode === 'signup'
            ? 'Create an account with email + password.'
            : 'Sign in with email + password.'}
        </p>

        <input
          type="email"
          placeholder="you@team.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={mode === 'magic' && otpSent}
        />

        {mode === 'magic' && otpSent && (
          <input
            type="text"
            inputMode="numeric"
            autoFocus
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            minLength={6}
            maxLength={8}
          />
        )}

        {mode !== 'magic' && (
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        )}

        {info && <p className="muted" style={{ fontSize: 13 }}>{info}</p>}
        {err && <p className="err">{err}</p>}

        <button disabled={busy}>
          {busy
            ? '…'
            : mode === 'magic'
            ? otpSent
              ? 'Verify code'
              : 'Send code'
            : mode === 'signup'
            ? 'Create account'
            : 'Sign in'}
        </button>

        {mode === 'magic' && otpSent && (
          <button
            type="button"
            className="link"
            onClick={() => { setOtpSent(false); setOtp(''); reset(); }}
          >
            Use a different email
          </button>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <button
            type="button"
            className="link"
            onClick={() => { setMode('magic'); setOtpSent(false); reset(); }}
            disabled={mode === 'magic'}
          >
            Email code
          </button>
          <button
            type="button"
            className="link"
            onClick={() => { setMode('password'); reset(); }}
            disabled={mode === 'password'}
          >
            Password
          </button>
          <button
            type="button"
            className="link"
            onClick={() => { setMode('signup'); reset(); }}
            disabled={mode === 'signup'}
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  );
}
