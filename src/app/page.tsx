'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAuthClient } from '@neon/auth/next';
const authClient=createAuthClient();
export default function Home(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const router=useRouter();
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const result=await authClient.signIn.email({email,password});
  if(result.error) throw new Error(result.error.message||'Unable to sign in. Check your details.');
  router.push('/dashboard');router.refresh();
 }catch(err){setError(err instanceof Error?err.message:'Sign in failed.');}finally{setBusy(false)}}
 return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">A</div><div className="eyebrow">PRIVATE WORKSPACE</div><h1>Welcome back.</h1><p className="muted">Your agency, research and client operations in one place.</p><form onSubmit={submit}><label>Email address</label><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/><label>Password</label><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password"/>{error&&<div className="error" role="alert">{error}</div>}<button className="primary-btn" disabled={busy}>{busy?'Signing in…':'Sign in to AgencyOS'}</button></form><div className="auth-foot">Private access · Protected workspace</div></section></main>
}