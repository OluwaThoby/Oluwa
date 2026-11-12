'use client';

import { useEffect, useMemo, useState } from 'react';
import { createAuthClient } from '@neon/auth/next';

const authClient = createAuthClient();

type Snapshot = {
  prospects: any[];
  clients: any[];
  projects: any[];
  tasks: any[];
  finance: any[];
};
type LoadState = 'loading' | 'ready' | 'partial' | 'error';

const sections = [
  ['Overview', '/dashboard'],
  ['Research & leads', '/dashboard/leads'],
  ['Projects & delivery', '/dashboard/projects'],
  ['Clients & retention', '/dashboard/clients'],
  ['Revenue & finance', '/dashboard/revenue'],
  ['SEO intelligence', '/dashboard/seo'],
  ['Outreach', '/dashboard/outreach'],
  ['Workflows', '/dashboard/workflows'],
  ['Reports', '/dashboard/reports'],
  ['System health', '/dashboard/system'],
];

async function readApi(path: string) {
  const response = await fetch(path, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || path + ' unavailable');
  return data;
}

function count(items: any[], predicate: (item: any) => boolean) {
  return items.filter(predicate).length;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return currency + ' ' + Math.round(value).toLocaleString();
  }
}

export default function AgencyOverview() {
  const [data, setData] = useState<Snapshot>({ prospects: [], clients: [], projects: [], tasks: [], finance: [] });
  const [state, setState] = useState<LoadState>('loading');
  const [issues, setIssues] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [authActionError, setAuthActionError] = useState('');

  async function signOut() {
    setSigningOut(true);
    setAuthActionError('');
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message || 'Unable to sign out.');
      window.location.assign('/');
    } catch (error) {
      setAuthActionError(error instanceof Error ? error.message : 'Unable to sign out. Please try again.');
      setSigningOut(false);
    }
  }

  async function load() {
    setState('loading');
    const requests = await Promise.allSettled([
      readApi('/api/prospects'),
      readApi('/api/clients'),
      readApi('/api/projects'),
      readApi('/api/agent-tasks'),
      readApi('/api/revenue'),
    ]);
    const keys = ['prospects', 'clients', 'projects', 'tasks', 'finance'] as const;
    const next: Snapshot = { prospects: [], clients: [], projects: [], tasks: [], finance: [] };
    const failed: string[] = [];
    requests.forEach((result, index) => {
      const key = keys[index];
      if (result.status === 'fulfilled') {
        const payload = result.value;
        const field = key === 'finance' ? 'summary' : key;
        next[key] = Array.isArray(payload[field]) ? payload[field] : [];
      } else {
        failed.push(key);
      }
    });
    setData(next);
    setIssues(failed);
    setState(failed.length === keys.length ? 'error' : failed.length ? 'partial' : 'ready');
    setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }

  useEffect(() => { void load(); }, []);

  const metrics = useMemo(() => ({
    leads: data.prospects.length,
    priority: count(data.prospects, p => Number(p.opportunity_score || 0) >= 65),
    clients: data.clients.length,
    activeProjects: count(data.projects, p => !['completed', 'live'].includes(String(p.status))),
    blocked: count(data.projects, p => p.status === 'blocked'),
    waiting: count(data.tasks, t => ['waiting_approval', 'pending_approval'].includes(String(t.status))),
    queued: count(data.tasks, t => ['queued', 'running'].includes(String(t.status))),
  }), [data]);

  const mrr = data.finance.filter(row => Number(row.mrr) > 0);
  const nav = (mobile = false) => sections.map(([label, href]) => (
    <a key={href} href={href} className={href === '/dashboard' ? 'active' : ''}>{label}</a>
  ));

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="side-brand" href="/dashboard"><span className="brand-mark">A</span>AgencyOS</a>
        <div className="side-label">YOUR WORKSPACE</div>
        <nav className="nav">{nav()}</nav>
        <div className="side-bottom">Private agency command centre<br/>Owner workspace</div>
      </aside>
      <main className="main overview-main">
        <div className="overview-top">
          <div>
            <div className="eyebrow">AGENCY OVERVIEW</div>
            <h1>Good to have you back.</h1>
            <p className="sub">A live snapshot of your agency's pipeline, delivery and operations.</p>
          </div>
          <div className="overview-actions">
            <span className="owner-pill">● PRIVATE WORKSPACE</span>
            <button className="btn" onClick={() => void load()} disabled={state === 'loading'}>{state === 'loading' ? 'Refreshing…' : '↻ Refresh data'}</button>
            <button className="btn" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </div>
        </div>
        {authActionError && <div className="overview-warning" role="alert">{authActionError}</div>}
        <nav className="mobile-menu overview-mobile">{nav(true)}</nav>

        <div className={'system-strip ' + (state === 'ready' ? 'system-ok' : state === 'loading' ? '' : 'system-warn')}>
          <span className="system-dot" />
          <span>{state === 'loading' ? 'Connecting to your workspace data…' : state === 'ready' ? 'Workspace data is up to date' : state === 'partial' ? 'Some workspace data could not be loaded' : 'Workspace data is currently unavailable'}</span>
          {updatedAt && <small>Updated {updatedAt}</small>}
        </div>

        {issues.length > 0 && <div className="overview-warning">Unavailable right now: {issues.join(', ')}. Other figures are shown from the sources that responded.</div>}

        <section className="overview-section">
          <div className="section-title"><div><h2>Business at a glance</h2><p>Core numbers from your connected workspace records.</p></div><span className="section-kicker">LIVE SNAPSHOT</span></div>
          <div className="overview-metrics">
            <article className="overview-card"><div className="overview-card-head"><span>Prospects</span><span className="metric-icon">↗</span></div><strong>{metrics.leads}</strong><small>{metrics.priority} high-priority opportunities</small><a href="/dashboard/leads">Open lead pipeline →</a></article>
            <article className="overview-card"><div className="overview-card-head"><span>Clients</span><span className="metric-icon">◎</span></div><strong>{metrics.clients}</strong><small>Active client records</small><a href="/dashboard/clients">Manage relationships →</a></article>
            <article className="overview-card"><div className="overview-card-head"><span>Active projects</span><span className="metric-icon">▦</span></div><strong>{metrics.activeProjects}</strong><small>{metrics.blocked} currently blocked</small><a href="/dashboard/projects">Review delivery →</a></article>
            <article className="overview-card"><div className="overview-card-head"><span>Agent tasks</span><span className="metric-icon">✳</span></div><strong>{metrics.queued + metrics.waiting}</strong><small>{metrics.waiting} awaiting your approval</small><a href="/dashboard/workflows">Open operations →</a></article>
          </div>
        </section>

        <section className="overview-grid">
          <article className="panel overview-panel">
            <div className="panel-head"><div><h2>Recurring revenue</h2><p className="sub">Monthly equivalent of active retainers, grouped by currency.</p></div><a className="text-link" href="/dashboard/revenue">View finance →</a></div>
            {mrr.length ? <div className="mrr-list">{mrr.map(row => <div className="mrr-row" key={row.currency}><span>{row.currency}</span><strong>{money(Number(row.mrr), String(row.currency))}</strong></div>)}</div> : <div className="overview-empty">{state === 'loading' ? 'Loading revenue records…' : 'No active recurring retainers recorded yet.'}</div>}
          </article>
          <article className="panel overview-panel">
            <div className="panel-head"><div><h2>Needs your attention</h2><p className="sub">Items that may need a decision or follow-up.</p></div></div>
            <a className="attention-row" href="/dashboard/projects"><span className="attention-number">{metrics.blocked}</span><span><b>Blocked projects</b><small>Review delivery blockers</small></span><i>→</i></a>
            <a className="attention-row" href="/dashboard/workflows"><span className="attention-number">{metrics.waiting}</span><span><b>Tasks awaiting approval</b><small>Review before sensitive actions</small></span><i>→</i></a>
            <a className="attention-row" href="/dashboard/leads"><span className="attention-number">{metrics.priority}</span><span><b>High-priority prospects</b><small>Review website needs and evidence</small></span><i>→</i></a>
          </article>
        </section>

        <section className="overview-bottom">
          <div><span className="eyebrow">NEXT STEP</span><h2>Keep the agency moving.</h2><p>Choose a workspace to continue. Actions that affect clients, send messages, spend money or change production remain subject to the appropriate checks and approvals.</p></div>
          <a className="btn green" href="/dashboard/leads">Review prospects →</a>
        </section>
        <p className="overview-foot">Figures reflect records currently stored in AgencyOS. They are not estimates of profit or guaranteed revenue.</p>
      </main>
    </div>
  );
}
