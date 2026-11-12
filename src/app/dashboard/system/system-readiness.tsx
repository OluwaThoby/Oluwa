'use client';

import { useCallback, useEffect, useState } from 'react';

type Check = {
  key: string;
  name: string;
  category: string;
  configured: boolean;
  required: boolean;
  detail: string;
  model?: string | null;
};

type Readiness = {
  generated_at: string;
  checks: Check[];
  note: string;
};

const nav = [
  ['Research & Leads', '/dashboard'],
  ['Projects & Delivery', '/dashboard/projects'],
  ['Clients & Retention', '/dashboard/clients'],
  ['Revenue & Finance', '/dashboard/revenue'],
  ['SEO Intelligence', '/dashboard/seo'],
  ['Outreach', '/dashboard/outreach'],
  ['Workflows', '/dashboard/workflows'],
  ['Reports', '/dashboard/reports'],
  ['System health', '/dashboard/system'],
];

export default function SystemReadiness() {
  const [data, setData] = useState<Readiness | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTest, setAiTest] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/system/readiness', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not check system readiness.');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Readiness check failed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function testAi() {
    setAiTesting(true); setAiTest('');
    try {
      const response = await fetch('/api/system/ai-test', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'The AI provider did not return a usable response.');
      setAiTest('Connected successfully · ' + result.model + ' · ' + result.response);
    } catch (err) {
      setAiTest(err instanceof Error ? 'Test failed: ' + err.message : 'AI connection test failed.');
    } finally { setAiTesting(false); }
  }

  const ready = data?.checks.filter((item) => item.configured).length ?? 0;
  const total = data?.checks.length ?? 0;

  return <div className="app">
    <aside className="sidebar">
      <div className="side-brand"><span className="brand-mark">A</span>AgencyOS</div>
      <div className="side-label">WORKSPACE</div>
      <nav className="nav">{nav.map(([label, href]) =>
        <a key={href} className={href === '/dashboard/system' ? 'active' : ''} href={href}>{label}</a>
      )}</nav>
      <div className="side-bottom">Private agency command centre<br/>Owner workspace · v0.5</div>
    </aside>
    <main className="main">
      <div className="topbar">
        <div><h1>System health</h1><div className="sub">See which parts of AgencyOS are configured and what is still waiting on integration.</div></div>
        <span className="owner-pill">● PRIVATE WORKSPACE</span>
      </div>
      <nav className="mobile-menu">{nav.map(([label, href]) =>
        <a key={href} className={href === '/dashboard/system' ? 'active' : ''} href={href}>{label}</a>
      )}</nav>
      <section className="metric-grid">
        <div className="metric"><span className="muted">Configured integrations</span><strong>{loading ? '—' : `${ready}/${total}`}</strong><span className="secondary">Server-side presence checks</span></div>
        <div className="metric"><span className="muted">Required services</span><strong>{loading ? '—' : data?.checks.filter(x => x.required && x.configured).length + '/' + data?.checks.filter(x => x.required).length}</strong><span className="secondary">Core infrastructure and AI runtime</span></div>
        <div className="metric"><span className="muted">Execution safety</span><strong>Guarded</strong><span className="secondary">Approvals remain in place</span></div>
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Integration readiness</h2><div className="sub">Missing integrations are shown plainly. Nothing is enabled or purchased from this screen.</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn" onClick={testAi} disabled={aiTesting}>{aiTesting ? "Testing AI…" : "Test AI connection"}</button><button className="btn" onClick={load} disabled={loading}>↻ Refresh</button></div></div>
        {error && <p className="error">{error}</p>}
        {aiTest && <p className={aiTest.startsWith("Connected") ? "notice" : "error"} role="status">{aiTest}</p>}
        {loading ? <p className="empty">Checking server configuration…</p> : <div className="table-wrap"><table>
          <thead><tr><th>SERVICE</th><th>AREA</th><th>STATUS</th><th>DETAIL</th></tr></thead>
          <tbody>{data?.checks.map(item => <tr key={item.key}>
            <td><span className="business">{item.name}</span>{item.required && <span className="secondary">Required</span>}</td>
            <td>{item.category}</td>
            <td><span className={item.configured ? 'badge' : 'badge'}>{item.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}</span></td>
            <td>{item.detail}{item.model && <div className="secondary">Selected model: {item.model}</div>}</td>
          </tr>)}</tbody>
        </table></div>}
        {data && <p className="notice">{data.note} Last checked: {new Date(data.generated_at).toLocaleString()}.</p>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><h2>Execution safeguards</h2><div className="sub">The system should not take consequential actions just because an integration becomes available.</div></div></div>
        <div className="form-grid">
          {[
            'Owner-only access to operational controls',
            'Outbound email requires a configured sender',
            'New scheduled workflows are saved paused',
            'Spending and financial commitments require approval',
            'Production changes require owner approval',
          ].map(item => <div className="notice" key={item}>✓ {item}</div>)}
        </div>
      </section>
    </main>
  </div>;
}
