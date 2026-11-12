'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@neon/auth/next';

const authClient = createAuthClient();
type Mode = 'signin' | 'signup' | 'verify' | 'forgot';

export default function Home() {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
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
        setNotice('Your account has been created. Enter the verification code sent to your email.');
        setMode('verify');
      } else if (mode === 'verify') {
        const result = await authClient.emailOtp.verifyEmail({ email, otp: verificationCode.trim() });
        if (result.error) throw new Error(result.error.message || 'That verification code is invalid or has expired.');
        const session = await authClient.getSession();
        if (session.data?.session) {
          router.push('/dashboard'); router.refresh();
        } else if (password.length >= 8) {
          // Some managed-auth configurations verify the address without
          // creating a browser session. Re-authenticate only with the password
          // already entered in this form; never persist it outside component state.
          const signedIn = await authClient.signIn.email({ email, password });
          if (signedIn.error) throw new Error(signedIn.error.message || 'Email verified. Please sign in again.');
          router.push('/dashboard'); router.refresh();
        } else {
          setNotice('Email verified. You can now sign in with your email and password.');
          setMode('signin');
        }
      } else if (mode === 'forgot') {
        const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) throw new Error(result.error.message || 'Unable to send the password reset email.');
        setNotice('If an account exists for this email, password reset instructions have been sent.');
      } else {
        try {
          const result = await authClient.signIn.email({ email, password });
          if (result.error) throw new Error(result.error.message || 'Invalid email or password.');
          router.push('/dashboard'); router.refresh();
        } catch (signInError) {
          const message = signInError instanceof Error ? signInError.message : '';
          if (/email.*not verified|email.*unverified|verification required/i.test(message)) {
            const sent = await authClient.emailOtp.sendVerificationOtp({
              email,
              type: 'email-verification',
            });
            if (sent.error) throw new Error(sent.error.message || 'Your email needs verification, but a new code could not be sent.');
            setVerificationCode('');
            setMode('verify');
            setNotice('Your email address is not verified yet. We’ve sent you a fresh verification code.');
            return;
          }
          throw signInError;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally { setBusy(false); }
  }

  const title = mode === 'signup' ? 'Create your account.' : mode === 'verify' ? 'Verify your email.' : mode === 'forgot' ? 'Reset your password.' : 'Welcome back.';
  const subtitle = mode === 'signup' ? 'Set up your private AgencyOS workspace.' : mode === 'verify' ? `Enter the verification code sent to ${email}.` : mode === 'forgot' ? 'We’ll send instructions to your email address.' : 'Your agency, research and client operations in one place.';

  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-mark">A</div><div className="eyebrow">PRIVATE WORKSPACE</div>
    <h1>{title}</h1><p className="muted">{subtitle}</p>
    <form onSubmit={submit}>
      {mode === 'signup' && <><label htmlFor="name">Full name</label><input id="name" autoComplete="name" required value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"/></>}
      <label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/>
      {mode === 'verify' && <><label htmlFor="verification-code">Verification code</label><input id="verification-code" inputMode="numeric" autoComplete="one-time-code" required value={verificationCode} onChange={e=>setVerificationCode(e.target.value)} placeholder="Enter the code from your email"/></>}
      {mode !== 'forgot' && mode !== 'verify' && <><label htmlFor="password">Password</label><div className="password-field"><input id="password" type={showPassword?'text':'password'} autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'At least 8 characters':'Enter your password'}/><button type="button" className="password-visibility" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'} title={showPassword?'Hide password':'Show password'}><svg viewBox="0 0 24 24" aria-hidden="true">{showPassword?<><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 9 4.7 10 7-.4.9-1.4 2.4-3 3.8M6.2 6.2C3.9 7.7 2.5 10 2 12c1 2.3 4.8 7 10 7 1.2 0 2.3-.2 3.3-.6"/></>:<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}</svg></button></div></>}
      {mode === 'signup' && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type={showPassword?'text':'password'} autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter password again"/></>}
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success" role="status">{notice}</div>}
      <button className="primary-btn" disabled={busy}>{busy?'Please wait…':mode==='signup'?'Create account':mode==='verify'?'Verify email':mode==='forgot'?'Send reset instructions':'Sign in to AgencyOS'}</button>
    </form>
    {mode === 'signin' && <div className="auth-links"><button type="button" onClick={()=>switchMode('forgot')}>Forgot password?</button><span>New to AgencyOS? <button type="button" onClick={()=>switchMode('signup')}>Create an account</button></span></div>}
    {mode === 'signup' && <div className="auth-links"><span>Already have an account? <button type="button" onClick={()=>switchMode('signin')}>Sign in</button></span></div>}
    {mode === 'verify' && <div className="auth-links"><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await authClient.emailOtp.sendVerificationOtp({email,type:'email-verification'});if(result.error)throw new Error(result.error.message||'Unable to resend the code.');setNotice('A new verification code has been sent.');}catch(err){setError(err instanceof Error?err.message:'Unable to resend the code.');}finally{setBusy(false);}}}>Resend verification code</button><span>Wrong email? <button type="button" onClick={()=>switchMode('signup')}>Go back</button></span></div>}
    {mode === 'forgot' && <div className="auth-links"><button type="button" onClick={()=>switchMode('signin')}>Back to sign in</button></div>}
    <div className="auth-foot">Private access · Protected workspace</div>
  </section></main>;
}
