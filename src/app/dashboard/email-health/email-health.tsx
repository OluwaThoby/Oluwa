'use client';

import { useCallback, useEffect, useState } from 'react';

type Domain = {
  id: string;
  domain: string;
  from_address: string;
  status: string;
  spf_status: string;
  dkim_status: string;
  dmarc_status: string;
  alignment_status: string;
  last_checked_at: string | null;
  verified_at: string | null;
};
type Payload = {
  domains: Domain[];
  suppressionCount: number;
  events: Record<string, number>;
  messageStates: Array<{ status: string; total: number }>;
  metrics: {
    providerAcceptanceRate: number | null;
    hardBounceRate: number | null;
    complaintCount: number;
    inboxPlacementRate: number | null;
    inboxPlacementNote: string;
  };
  sendingEnabled: boolean;
};

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function EmailHealth() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [domain, setDomain] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('manual');
  const [savingDomain, setSavingDomain] = useState(false);
  const [savingSuppression, setSavingSuppression] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/email-deliverability', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load email health.');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load email health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function registerDomain(event: React.FormEvent) {
    event.preventDefault();
    setSavingDomain(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/email-deliverability', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain, from_address: fromAddress }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not register domain.');
      setNotice(result.message);
      setDomain('');
      setFromAddress('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register domain.');
    } finally {
      setSavingDomain(false);
    }
  }

  async function suppressAddress(event: React.FormEvent) {
    event.preventDefault();
    setSavingSuppression(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/email-deliverability/suppressions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: address, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not suppress address.');
      setNotice(result.message);
      setAddress('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suppress address.');
    } finally {
      setSavingSuppression(false);
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand"><span className="brand-mark">A</span>AgencyOS</div>
        <div className="side-label">WORKSPACE</div>
        <nav className="nav">
          <a href="/dashboard">⌕ Research &amp; Leads</a>
          <a href="/dashboard/projects">▣ Projects &amp; Delivery</a>
          <a href="/dashboard/clients">♙ Clients &amp; Retention</a>
          <a href="/dashboard/revenue">₦ Revenue &amp; Finance</a>
          <a href="/dashboard/seo">◉ SEO Intelligence</a>
          <a href="/dashboard/outreach">↗ Outreach</a>
          <a className="active" href="/dashboard/email-health">✉ Email Reputation</a>
        </nav>
        <div className="side-bottom">Private agency command centre<br/>Owner workspace</div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div><h1>Email reputation</h1><div className="sub">Protect sender identity, keep suppressed contacts out of campaigns and monitor delivery signals.</div></div>
          <span className="owner-pill">● PRIVATE WORKSPACE</span>
        </div>
        <nav className="mobile-menu">
          <a href="/dashboard">Leads</a><a href="/dashboard/projects">Projects</a><a href="/dashboard/clients">Clients</a><a href="/dashboard/revenue">Revenue</a><a href="/dashboard/outreach">Outreach</a><a className="active" href="/dashboard/email-health">Email health</a>
        </nav>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        {loading && !data ? <section className="panel"><div className="empty">Loading email reputation data…</div></section> : data ? <>
          <section className="metric-grid">
            <div className="metric"><div className="metric-label">Provider acceptance</div><div className="metric-value">{data.metrics.providerAcceptanceRate === null ? '—' : data.metrics.providerAcceptanceRate + '%'}</div><div className="metric-note">Last 30 days · not inbox placement</div></div>
            <div className="metric"><div className="metric-label">Hard-bounce rate</div><div className="metric-value">{data.metrics.hardBounceRate === null ? '—' : data.metrics.hardBounceRate + '%'}</div><div className="metric-note">Lower is better</div></div>
            <div className="metric"><div className="metric-label">Spam complaints</div><div className="metric-value">{data.metrics.complaintCount}</div><div className="metric-note">Recorded provider events</div></div>
            <div className="metric"><div className="metric-label">Suppressed addresses</div><div className="metric-value">{data.suppressionCount}</div><div className="metric-note">Blocked from outreach</div></div>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>Inbox placement</h2><div className="sub">We do not confuse provider acceptance with inbox delivery.</div></div><span className="badge">Not measured</span></div>
            <p className="notice">Inbox placement is currently unmeasured. A provider can accept a message that later lands in Spam, Promotions or quarantine. We will only show an inbox-placement percentage when supported by a documented seed-test sample.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>Sending domains</h2><div className="sub">Register the exact domain that will appear in your From address.</div></div><span className="badge">{data.domains.length} registered</span></div>
            <form onSubmit={registerDomain} className="form-grid">
              <label>Sending domain<input className="field" value={domain} onChange={e => setDomain(e.target.value)} placeholder="mail.yourdomain.com" required /></label>
              <label>From address<input className="field" type="email" value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder="hello@mail.yourdomain.com" required /></label>
              <div className="actions"><button className="btn green" disabled={savingDomain}>{savingDomain ? 'Saving…' : 'Register domain'}</button></div>
            </form>
            {!data.domains.length ? <div className="empty">No sender domain registered. Email sending remains disabled.</div> : <div className="table-wrap"><table><thead><tr><th>DOMAIN / FROM</th><th>STATUS</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>ALIGNMENT</th></tr></thead><tbody>{data.domains.map(item => <tr key={item.id}><td><b>{item.domain}</b><span className="secondary">{item.from_address}</span></td><td><span className="badge">{label(item.status)}</span></td><td>{label(item.spf_status)}</td><td>{label(item.dkim_status)}</td><td>{label(item.dmarc_status)}</td><td>{label(item.alignment_status)}</td></tr>)}</tbody></table></div>}
            <p className="notice">Registration does not verify DNS. SPF, DKIM, DMARC and alignment remain unknown until independently checked. No message can be sent from this screen.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>Suppression list</h2><div className="sub">Opt-outs, complaints and hard bounces must never be re-contacted.</div></div></div>
            <form onSubmit={suppressAddress} className="form-grid">
              <label>Email address<input className="field" type="email" value={address} onChange={e => setAddress(e.target.value)} placeholder="person@example.com" required /></label>
              <label>Reason<select className="field" value={reason} onChange={e => setReason(e.target.value)}><option value="manual">Manual suppression</option><option value="unsubscribe">Unsubscribe request</option><option value="legal_request">Legal / privacy request</option></select></label>
              <div className="actions"><button className="btn" disabled={savingSuppression}>{savingSuppression ? 'Blocking…' : 'Block address'}</button></div>
            </form>
            <p className="notice">Suppression is one-way in this interface. Reinstating an address requires a separate review and evidence of a valid new basis.</p>
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>Delivery events</h2><div className="sub">Normalised provider events over the last 30 days.</div></div></div>
            <div className="metric-grid">{Object.entries(data.events).length ? Object.entries(data.events).map(([key, value]) => <div className="metric" key={key}><div className="metric-label">{label(key)}</div><div className="metric-value">{value}</div></div>) : <div className="empty">No provider events recorded yet.</div>}</div>
          </section>
        </> : null}
        <p className="notice">Sending is disabled. This workspace currently records configuration and reputation data only; it does not send email or claim a guaranteed inbox rate.</p>
      </main>
    </div>
  );
}
