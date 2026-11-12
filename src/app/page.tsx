'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@neon/auth/next';
const authClient=createAuthClient();
export default function Home(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const result=await authClient.signIn.email({email,password});
  if(result.error) throw new Error(result.error.message||'Unable to sign in. Check your details.');
  router.push('/dashboard');router.refresh();
 }catch(err){setError(err instanceof Error?err.message:'Sign in failed.');}finally{setBusy(false)}}
 return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">A</div><div className="eyebrow">PRIVATE WORKSPACE</div><h1>Welcome back.</h1><p className="muted">Your agency, research and client operations in one place.</p><form onSubmit={submit}><label>Email address</label><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/><label htmlFor="password">Password</label><div className="password-field"><input id="password" type={showPassword?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/><button type="button" className="password-visibility" onClick={()=>setShowPassword(v=>!v)} aria-label={showPassword?'Hide password':'Show password'} aria-pressed={showPassword} title={showPassword?'Hide password':'Show password'}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{showPassword?<><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 9 4.7 10 7-.4.9-1.4 2.4-3 3.8M6.2 6.2C3.9 7.7 2.5 10 2 12c1 2.3 4.8 7 10 7 1.2 0 2.3-.2 3.3-.6"/></>:<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>}</svg></button></div>{error&&<div className="error" role="alert">{error}</div>}<button className="primary-btn" disabled={busy}>{busy?'Signing in…':'Sign in to AgencyOS'}</button></form><div className="auth-foot">Private access · Protected workspace</div></section></main>
}