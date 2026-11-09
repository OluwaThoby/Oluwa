'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function Home(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[otp,setOtp]=useState(''),[step,setStep]=useState<'credentials'|'otp'>('credentials'),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const base=process.env.NEXT_PUBLIC_NEON_AUTH_BASE_URL;
  if(!base) throw new Error('Authentication is not configured yet.');
  const response=await fetch(base.replace(/\/$/,'')+'/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
  const data=await response.json(); if(!response.ok) throw new Error(data.message||data.error||'Unable to sign in. Check your details.');
  router.push('/dashboard');router.refresh();
 }catch(err){setError(err instanceof Error?err.message:'Sign in failed.');}finally{setBusy(false)}}
 return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">A</div><div className="eyebrow">PRIVATE WORKSPACE</div><h1>Welcome back.</h1><p className="muted">Your agency, research and client operations in one place.</p><form onSubmit={submit}><label>Email address</label><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/>{error&&<div className="error">{error}</div>}<button className="primary-btn" disabled={busy}>{busy?'Signing in…':'Sign in to AgencyOS'}</button></form><div className="auth-foot">Private access · Protected workspace</div></section></main>
}