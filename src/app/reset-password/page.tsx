'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createAuthClient } from '@neon/auth/next';

const authClient = createAuthClient();

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (!token) { setError('This reset link is missing or invalid. Request a new one from the sign-in page.'); return; }
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token });
      if (result.error) throw new Error(result.error.message || 'The reset link may have expired. Request a new one.');
      setDone(true);
      setTimeout(() => router.push('/'), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally { setBusy(false); }
  }

  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-mark">A</div><div className="eyebrow">ACCOUNT RECOVERY</div>
    <h1>Choose a new password.</h1><p className="muted">Use at least 8 characters to secure your AgencyOS account.</p>
    {done ? <div className="success" role="status">Your password has been updated. Taking you back to sign in…</div> :
      <form onSubmit={submit}>
        <label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/>
        <label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Enter it again"/>
        {error && <div className="error" role="alert">{error}</div>}
        <button className="primary-btn" disabled={busy || !token}>{busy?'Updating…':'Update password'}</button>
      </form>}
    <div className="auth-links"><button type="button" onClick={()=>router.push('/')}>Back to sign in</button></div>
    <div className="auth-foot">Private access · Protected workspace</div>
  </section></main>;
}


export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-shell"><section className="auth-card"><p className="muted">Loading password recovery…</p></section></main>}><ResetPasswordForm /></Suspense>;
}
