'use client';

import { useEffect, useState } from 'react';

const fields = [
  ['agency_name','Agency name'],['base_location','Base location'],
  ['target_markets','Target markets'],['core_services','Core services'],
  ['project_price_range','Website project price range'],['maintenance_price','Maintenance pricing'],
  ['seo_price','SEO pricing'],['team_capacity','Team and delivery capacity'],
  ['current_pipeline','Current leads and sales pipeline'],['marketing_budget','Marketing budget'],
  ['sales_channels','Sales channels and audience'],['delivery_stack','Technology and delivery stack'],
  ['business_constraints','Constraints and operating preferences'],
] as const;
type Key = typeof fields[number][0];

export default function BusinessProfilePage() {
  const [profile,setProfile]=useState<Partial<Record<Key,string>>>({});
  const [verified,setVerified]=useState<string[]>([]);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{(async()=>{try{const r=await fetch('/api/business-profile',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load profile');setProfile(d.profile||{});setVerified(d.verifiedFields||[])}catch(e){setError(e instanceof Error?e.message:'Could not load profile')}finally{setLoading(false)}})()},[]);
  async function save(){setSaving(true);setError('');setMessage('');try{const r=await fetch('/api/business-profile',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({profile,verifiedFields:verified})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Save failed');setVerified(d.verifiedFields||[]);setMessage(d.message||'Saved.')}catch(e){setError(e instanceof Error?e.message:'Save failed')}finally{setSaving(false)}}
  return <div className="app"><aside className="sidebar"><a className="side-brand" href="/dashboard"><span className="brand-mark">A</span>AgencyOS</a><div className="side-label">WORKSPACE</div><nav className="nav"><a href="/dashboard">Overview</a><a href="/dashboard/leads">Research & leads</a><a href="/dashboard/projects">Projects & delivery</a><a href="/dashboard/clients">Clients & retention</a><a href="/dashboard/reports">Reports</a><a className="active" href="/dashboard/business-profile">Business profile</a></nav><div className="side-bottom">Private agency command centre<br/>Owner workspace</div></aside><main className="main"><div className="topbar"><div><div className="eyebrow">SHARED AGENT CONTEXT</div><h1>Agency business profile</h1><p className="sub">One source of truth for every AgencyOS agent. Empty fields stay unknown.</p></div><span className="owner-pill">● OWNER CONTROLLED</span></div>
    <section className="panel"><div className="panel-head"><div><h2>Business facts and operating context</h2><p className="sub">Enter what is actually true. Tick verification only when you can stand behind the detail.</p></div><span className="badge">CENTRAL PROFILE</span></div>
    {loading?<p>Loading profile…</p>:<><div className="form-grid">{fields.map(([key,label])=><label className="wide" key={key}>{label}<textarea className="field" rows={2} value={profile[key]||''} onChange={e=>setProfile(p=>({...p,[key]:e.target.value}))} placeholder="Leave blank if unknown or not applicable."/><span style={{display:'flex',gap:8,alignItems:'center',fontSize:12,marginTop:5}}><input type="checkbox" checked={verified.includes(key)} disabled={!profile[key]?.trim()} onChange={e=>setVerified(v=>e.target.checked?[...v,key]:v.filter(x=>x!==key))}/> I confirm this information is accurate</span></label>)}</div><div className="actions" style={{marginTop:18}}><button className="primary-btn" disabled={saving} onClick={save}>{saving?'Saving…':'Save business profile'}</button></div></>}
    {error&&<p className="error">{error}</p>}{message&&<p className="notice">{message}</p>}<p className="notice">AgencyOS will separate verified fields from unverified notes. AI-generated recommendations never become verified business facts automatically. Updating this profile increments its version for auditability.</p></section></main></div>;
}
