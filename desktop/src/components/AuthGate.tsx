import { useState } from 'react';
import type { SupabaseClient, Session } from '@supabase/supabase-js';

interface Props {
  supabase: SupabaseClient;
  onSignedIn: (session: Session) => void;
}

export default function AuthGate({ supabase, onSignedIn }: Props) {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpSent(true);
      setInfo('Check your email for a 6-digit code.');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[OptaPrompter auth]', e);
      const msg =
        (e as { message?: string; error_description?: string; status?: number; code?: string })?.message
        || (e as { error_description?: string })?.error_description
        || JSON.stringify(e);
      const status = (e as { status?: number })?.status;
      const code = (e as { code?: string })?.code;
      setErr([msg, status && `HTTP ${status}`, code].filter(Boolean).join(' · '));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
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

  return (
    <div className="auth">
      <form onSubmit={otpSent ? verify : sendCode} className="auth-card">
        <h2>OptaPrompter</h2>
        <p className="muted">
          {otpSent
            ? 'Enter the 6-digit code we emailed you.'
            : "Enter your email — we'll send you a sign-in code."}
        </p>

        <input
          type="email"
          placeholder="you@team.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus={!otpSent}
          disabled={otpSent}
        />

        {otpSent && (
          <input
            type="text"
            inputMode="numeric"
            placeholder="123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            minLength={6}
            maxLength={8}
            autoFocus
          />
        )}

        {info && <p className="muted" style={{ fontSize: 13 }}>{info}</p>}
        {err && <p className="err">{err}</p>}

        <button disabled={busy}>
          {busy ? '…' : otpSent ? 'Verify code' : 'Send code'}
        </button>

        {otpSent && (
          <button
            type="button"
            className="link"
            onClick={() => {
              setOtpSent(false);
              setOtp('');
              setErr(null);
              setInfo(null);
            }}
          >
            Use a different email
          </button>
        )}
      </form>
    </div>
  );
}
