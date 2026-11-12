'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@neon/auth/next';

const authClient = createAuthClient();
type Mode = 'signin' | 'signup' | 'forgot';

export default function Home() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const router = useRouter();

  function switchMode(next: Mode) {
    setMode(next); setError(''); setNotice('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (password !== confirmPassword) throw new Error('The passwords do not match.');
        const result = await authClient.signUp.email({ name, email, password });
        if (result.error) throw new Error(result.error.message || 'Unable to create your account.');
        setNotice('Account created. Check your email for a verification code or link before signing in.');
        setMode('signin');
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) throw new Error(result.error.message || 'Unable to send the password reset email.');
        setNotice('If an account exists for this email, password reset instructions have been sent.');
      } else {
        const result = await authClient.signIn.email({ email, password });
        if (result.error) throw new Error(result.error.message || 'Invalid email or password.');
        router.push('/dashboard'); router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  const title = mode === 'signup' ? 'Create your account.' : mode === 'forgot' ? 'Reset your password.' : 'Welcome back.';
  const subtitle = mode === 'signup' ? 'Set up your private AgencyOS workspace.' : mode === 'forgot' ? 'We’ll send instructions to your email address.' : 'Your agency, research and client operations in one place.';

  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-mark">A</div><div className="eyebrow">PRIVATE WORKSPACE</div>
    <h1>{title}</h1><p className="muted">{subtitle}</p>
    <form onSubmit={submit}>
      {mode === 'signup' && <><label htmlFor="name">Full name</label><input id="name" autoComplete="name" required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></>}
      <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/>
      {mode !== 'forgot' && <><label htmlFor="password">Password</label><div className="password-field"><input id="password" type={showPassword?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'At least 8 characters':'Enter your password'}/><button type="button" className="password-visibility" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'} title={showPassword?'Hide password':'Show password'}><svg viewBox="0 0 24 24" aria-hidden="true">{showPassword?<><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 9 4.7 10 7-.4.9-1.4 2.4-3 3.8M6.2 6.2C3.9 7.7 2.5 10 2 12c1 2.3 4.8 7 10 7 1.2 0 2.3-.2 3.3-.6"/></>:<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}</svg></button></div></>}
      {mode === 'signup' && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type={showPassword?'text':'password'} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter password again"/></>}
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success" role="status">{notice}</div>}
      <button className="primary-btn" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='forgot'?'Send reset instructions':'Sign in to AgencyOS'}</button>
    </form>
    {mode === 'signin' && <div className="auth-links"><button type="button" onClick={()=>switchMode('forgot')}>Forgot password?</button><span>New to AgencyOS? <button type="button" onClick={()=>switchMode('signup')}>Create an account</button></span></div>}
    {mode === 'signup' && <div className="auth-links"><span>Already have an account? <button type="button" onClick={()=>switchMode('signin')}>Sign in</button></span></div>}
    {mode === 'forgot' && <div className="auth-links"><button type="button" onClick={()=>switchMode('signin')}>Back to sign in</button></div>}
    <div className="auth-foot">Private access · Protected workspace</div>
  </section></main>;
}
