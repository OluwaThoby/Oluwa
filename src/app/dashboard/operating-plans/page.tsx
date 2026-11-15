'use client';

import { useCallback, useEffect, useState } from 'react';

type Plan = {
  id: string; title: string; instructions: string; output: any;
  planStatus: 'draft' | 'under_review' | 'approved' | 'archived';
  created_at: string; finished_at: string | null;
};

const label = (value: string) => value.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function OperatingPlansPage() {
  const [plans,setPlans]=useState<Plan[]>([]);
  const [profileVersion,setProfileVersion]=useState<number|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [selected,setSelected]=useState('');
  const refresh=useCallback(async()=>{setLoading(true);setError('');try{const r=await fetch('/api/operating-plans',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load plans');setPlans(d.plans||[]);setProfileVersion(d.currentProfileVersion??null);if(!selected&&d.plans?.[0])setSelected(d.plans[0].id)}catch(e){setError(e instanceof Error?e.message:'Could not load plans')}finally{setLoading(false)}},[selected]);
  useEffect(()=>{void refresh()},[refresh]);
  async function changeStatus(id:string,status:Plan['planStatus']){setBusy(id);setError('');setMessage('');try{const r=await fetch('/api/operating-plans',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id,status})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not update plan');setMessage(d.message);await refresh()}catch(e){setError(e instanceof Error?e.message:'Could not update plan')}finally{setBusy('')}}
  const active=plans.find(p=>p.id===selected)||plans.find(p=>p.planStatus!=='archived')||plans[0];
  return <div className="app"><aside className="sidebar"><a className="side-brand" href="/dashboard"><span className="brand-mark">A</span>AgencyOS</a><div className="side-label">WORKSPACE</div><nav className="nav"><a href="/dashboard">Overview</a><a href="/dashboard/leads">Research & leads</a><a href="/dashboard/projects">Projects & delivery</a><a href="/dashboard/clients">Clients & retention</a><a href="/dashboard/workflows">Workflows</a><a className="active" href="/dashboard/operating-plans">Operating plans</a><a href="/dashboard/business-profile">Business profile</a></nav><div className="side-bottom">Private agency command centre<br/>Owner workspace</div></aside>
  <main className="main"><div className="topbar"><div><div className="eyebrow">STRATEGY CONTROL</div><h1>Operating plans</h1><p className="sub">Review plans in plain language. Each one is an AI-generated draft until you verify its facts and assumptions.</p></div><span className="owner-pill">● OWNER CONTROLLED</span></div>
  <section className="panel"><div className="panel-head"><div><h2>Plan register</h2><p className="sub">Older plans are kept as history. Their original wording is preserved, but formatting is cleaned up here so they are easier to read.</p></div><button className="btn" onClick={()=>void refresh()} disabled={loading}>↻ Refresh</button></div>
  <div className="overview-metrics" style={{marginBottom:16}}><article className="overview-card"><small>Total saved plans</small><strong>{plans.length}</strong></article><article className="overview-card"><small>Awaiting review</small><strong>{plans.filter(p=>p.planStatus==='under_review').length}</strong></article><article className="overview-card"><small>Approved plans</small><strong>{plans.filter(p=>p.planStatus==='approved').length}</strong></article></div>
  {loading?<p>Loading operating plans…</p>:plans.length===0?<div className="overview-empty">No saved operating plans yet. Generate one from the Agency intelligence panel in Workflows; it will appear here automatically.</div>:<div className="form-grid"><label className="wide">Plan history<select className="field" value={active?.id||''} onChange={e=>setSelected(e.target.value)}>{plans.map(p=><option key={p.id} value={p.id}>{new Date(p.created_at).toLocaleString()} · {planTitle(p)} · {label(p.planStatus)}</option>)}</select></label>
  {active&&<><div className="wide" style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span className="badge">{label(active.planStatus)}</span><span className="secondary">Created {new Date(active.created_at).toLocaleString()}</span><span className="secondary">Profile v{active.output?.businessProfileVersion??'unknown'} · current v{profileVersion??'not configured'}</span>{active.output?.businessProfileVersion!==profileVersion&&<span className="badge">PROFILE CHANGED — REVIEW</span>}</div><div className="wide" style={{whiteSpace:'pre-wrap',lineHeight:1.75,fontSize:14,padding:16,border:'1px solid var(--line)',borderRadius:10,background:'#f8fbf9'}}>{cleanPlanText(active.output?.plan)}</div><div className="wide" style={{display:'flex',gap:8,flexWrap:'wrap'}}>{(['draft','under_review','approved','archived'] as const).map(s=><button key={s} className={s==='approved'?'btn green':'btn'} disabled={!!busy||active.planStatus===s} onClick={()=>void changeStatus(active.id,s)}>{busy===active.id?'Saving…':label(s)}</button>)}</div></>}</div>}
  {error&&<p className="error">{error}</p>}{message&&<p className="notice">{message}</p>}<p className="notice">AI-generated plans can contain incorrect assumptions. Confirm every business fact, price, service, customer detail and capability before using a recommendation. A plan marked Approved means you have approved the strategy document only. It does not approve spending, outreach, publishing, deployments, client commitments or production changes.</p></section></main></div>;
}
