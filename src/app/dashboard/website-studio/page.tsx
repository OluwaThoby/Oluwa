'use client';

import { useCallback, useEffect, useState } from 'react';

type Project = { id: string; name: string; client_name?: string | null; service_type: string; status: string };
type Build = { id: string; project_id: string; project_name: string; client_name?: string | null; build_number: number; complexity: string; status: string; created_at: string; preview_url?: string | null };

const levels = [
  { value: 'starter', label: 'Starter website', note: 'Focused landing pages and simple brochure sites' },
  { value: 'business', label: 'Business website', note: 'Multi-page company websites and service sites' },
  { value: 'commerce', label: 'E-commerce', note: 'Product catalogues, carts and checkout workflows' },
  { value: 'custom_app', label: 'Custom web application', note: 'Dashboards, portals and bespoke application workflows' },
];

const pretty = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function WebsiteStudioPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [projectId, setProjectId] = useState('');
  const [complexity, setComplexity] = useState('business');
  const [brief, setBrief] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState('');
  const [preview, setPreview] = useState<{ id: string; html: string } | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [projectResponse, buildResponse] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/website-builds'),
      ]);
      const projectData = await projectResponse.json();
      const buildData = await buildResponse.json();
      if (!projectResponse.ok) throw new Error(projectData.error || 'Could not load projects.');
      if (!buildResponse.ok) throw new Error(buildData.error || 'Could not load website builds.');
      setProjects(projectData.projects || []);
      setBuilds(buildData.builds || []);
      setProjectId((current) => current || projectData.projects?.[0]?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Website Studio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createIntake(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/website-builds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          complexity,
          brief: { owner_notes: brief.trim() },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create website intake.');
      setNotice(data.message || 'Website intake created.');
      setBrief('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create website intake.');
    } finally {
      setSaving(false);
    }
  }

  async function openPreview(buildId: string) {
    setPreviewLoadingId(buildId);
    setError('');
    try {
      const response = await fetch(`/api/website-builds/${buildId}/generate`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load generated source.');
      const files = data.build.generated_files as Record<string, string>;
      const css = (files['styles.css'] || '').replace(/<\/style/gi, '<\\/style');
      const js = (files['script.js'] || '').replace(/<\/script/gi, '<\\/script');
      let html = String(files['index.html'] || '');
      const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'">`;
      html = html.replace(/<link[^>]+href=["']\.\/styles\.css["'][^>]*>/i, '');
      html = html.replace(/<script[^>]+src=["']\.\/script\.js["'][^>]*><\/script>/i, '');
      html = html.replace('</head>', `${policy}<style>${css}</style></head>`);
      html = html.replace('</body>', `<script>${js}</script></body>`);
      setPreview({ id: buildId, html });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load preview.');
    } finally {
      setPreviewLoadingId('');
    }
  }

  async function generateWebsite(buildId: string) {
    setGeneratingId(buildId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/website-builds/${buildId}/generate`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Website generation failed.');
      setNotice(`Website source generated with ${data.model}. Basic QA: ${data.qa.status.replaceAll('_', ' ')}. ${data.qa.warnings.length} review warning(s). Nothing has been published.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Website generation failed.');
    } finally {
      setGeneratingId('');
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f5f7f6', color: '#17231d', padding: 'clamp(18px, 4vw, 42px)', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <a href="/dashboard" style={{ color: '#28734d', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>← AgencyOS workspace</a>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)', letterSpacing: '-1.4px', margin: '14px 0 8px' }}>Website Studio</h1>
            <p style={{ margin: 0, color: '#637169', maxWidth: 650, lineHeight: 1.6 }}>The production workspace for customer websites, redesigns and web applications. Start with a scoped build intake, then move through planning, staging, QA and approval.</p>
          </div>
          <span style={{ border: '1px solid #cfe0d5', background: '#edf6f0', color: '#28734d', borderRadius: 999, padding: '9px 13px', fontSize: 12, fontWeight: 800 }}>OWNER WORKSPACE</span>
        </div>

        {error && <div role="alert" style={{ background: '#fff0ef', color: '#9b3028', border: '1px solid #f0c6c2', borderRadius: 12, padding: 14, marginBottom: 16 }}>{error}</div>}
        {notice && <div role="status" style={{ background: '#edf7ef', color: '#23633e', border: '1px solid #c8e3d0', borderRadius: 12, padding: 14, marginBottom: 16 }}>{notice}</div>}

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 18, alignItems: 'start' }}>
          <form onSubmit={createIntake} style={{ background: '#fff', border: '1px solid #e2e9e4', borderRadius: 18, padding: 'clamp(18px, 3vw, 26px)', boxShadow: '0 8px 28px rgba(20,50,32,.04)' }}>
            <div style={{ color: '#28734d', fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>NEW DELIVERY INTAKE</div>
            <h2 style={{ fontSize: 22, margin: '9px 0 6px' }}>Start a website build</h2>
            <p style={{ color: '#6a776f', fontSize: 13, lineHeight: 1.55, marginTop: 0 }}>Create a tracked build, then generate private source files for review. Generation uses your configured AI provider and never publishes automatically.</p>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '18px 0 7px' }}>Project</label>
            <select required value={projectId} onChange={(event) => setProjectId(event.target.value)} style={fieldStyle}>
              <option value="">Choose a project</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.client_name ? ' · ' + project.client_name : ''}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '16px 0 7px' }}>Build complexity</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {levels.map((level) => (
                <label key={level.value} style={{ display: 'flex', gap: 10, padding: 11, border: complexity === level.value ? '1px solid #3a8a5d' : '1px solid #e5ebe7', borderRadius: 11, background: complexity === level.value ? '#f1f8f3' : '#fff', cursor: 'pointer' }}>
                  <input type="radio" name="complexity" value={level.value} checked={complexity === level.value} onChange={() => setComplexity(level.value)} />
                  <span><strong style={{ display: 'block', fontSize: 13 }}>{level.label}</strong><small style={{ color: '#758078' }}>{level.note}</small></span>
                </label>
              ))}
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, margin: '16px 0 7px' }}>Initial requirements / owner notes</label>
            <textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={5000} rows={5} placeholder="Describe the customer's goals, pages, features, references and constraints. Do not include passwords or secret keys." style={{ ...fieldStyle, resize: 'vertical' }} />
            <button disabled={saving || loading || !projectId} type="submit" style={{ width: '100%', border: 0, borderRadius: 11, background: saving ? '#7d9c88' : '#246b43', color: '#fff', fontWeight: 800, padding: 14, marginTop: 16, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Creating intake…' : 'Create build intake'}</button>
            {!projects.length && !loading && <p style={{ color: '#9b5a23', fontSize: 12 }}>Create a project first in <a href="/dashboard/projects">Projects &amp; Delivery</a>.</p>}
          </form>

          <section style={{ background: '#fff', border: '1px solid #e2e9e4', borderRadius: 18, padding: 'clamp(18px, 3vw, 26px)', boxShadow: '0 8px 28px rgba(20,50,32,.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div><div style={{ color: '#28734d', fontSize: 11, fontWeight: 800, letterSpacing: 1.2 }}>DELIVERY PIPELINE</div><h2 style={{ fontSize: 22, margin: '9px 0 0' }}>Website builds</h2></div>
              <button onClick={() => void load()} type="button" style={{ border: '1px solid #dce6df', background: '#fff', borderRadius: 9, padding: '8px 11px', color: '#405248', fontWeight: 700 }}>Refresh</button>
            </div>
            {loading ? <p style={{ color: '#748078', padding: '24px 0' }}>Loading delivery records…</p> : builds.length === 0 ? <div style={{ border: '1px dashed #d7e1da', borderRadius: 13, padding: 22, marginTop: 20, color: '#6b786f', lineHeight: 1.6 }}>No website build intakes yet. Once a project is selected on the left, its first build record will appear here.</div> : (
              <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                {builds.map((build) => (
                  <article key={build.id} style={{ border: '1px solid #e6ece8', borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
                      <div><strong>{build.project_name}</strong><div style={{ color: '#758078', fontSize: 12, marginTop: 4 }}>{build.client_name || 'Client not linked'} · Build #{build.build_number}</div></div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#286b45', background: '#edf6ef', borderRadius: 999, padding: '6px 8px' }}>{pretty(build.status)}</span>
                    </div>
                    <div style={{ color: '#58665d', fontSize: 12, marginTop: 12 }}>{pretty(build.complexity)} · Created {new Date(build.created_at).toLocaleDateString()}</div>
                    {build.preview_url && <a href={build.preview_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, color: '#28734d', fontWeight: 700, fontSize: 12 }}>Open preview ↗</a>}
                    <button type="button" disabled={Boolean(generatingId) || ['approved', 'deploying', 'live', 'cancelled'].includes(build.status)} onClick={() => void generateWebsite(build.id)} style={{ display: 'block', width: '100%', marginTop: 12, border: 0, borderRadius: 9, padding: 11, background: generatingId === build.id ? '#7d9c88' : '#246b43', color: '#fff', fontWeight: 800, cursor: generatingId ? 'wait' : 'pointer' }}>{generatingId === build.id ? 'Generating source…' : 'Generate website source'}</button>
                    {['qa'].includes(build.status) && <><button type="button" disabled={Boolean(previewLoadingId)} onClick={() => void openPreview(build.id)} style={{ width: '100%', marginTop: 8, border: '1px solid #dce6df', borderRadius: 9, padding: 10, background: '#fff', color: '#246b43', fontWeight: 800 }}>{previewLoadingId === build.id ? 'Loading preview…' : 'Open isolated preview'}</button><small style={{ display: 'block', marginTop: 8, color: '#8a6228' }}>Source generated. Automated checks are not a substitute for manual QA and approval.</small></>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>

        {preview && <section style={{ marginTop: 20, background: '#fff', border: '1px solid #dfe8e1', borderRadius: 16, padding: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><strong>Isolated website preview</strong><button type="button" onClick={() => setPreview(null)} style={{ border: '1px solid #dce6df', borderRadius: 8, background: '#fff', padding: '7px 10px' }}>Close</button></div><iframe title="Generated website preview" sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview.html} style={{ width: '100%', height: 620, border: '1px solid #e1e8e3', borderRadius: 10, marginTop: 12, background: '#fff' }} /></section>}

        <section style={{ marginTop: 20, background: '#eef3ef', border: '1px solid #dfe8e1', borderRadius: 16, padding: 18 }}>
          <strong style={{ fontSize: 13 }}>Production safety is intentional</strong>
          <p style={{ color: '#627067', fontSize: 12, lineHeight: 1.6, marginBottom: 0 }}>Build records are tracked separately from live websites. Generated source is stored privately with basic automated checks. Browser QA, customer preview, customer portal access and controlled deployment remain separate approval-gated steps. Nothing is published automatically.</p>
        </section>
      </div>
    </main>
  );
}

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #dce5de',
  borderRadius: 10,
  padding: '12px 13px',
  color: '#1b2a20',
  background: '#fff',
  fontSize: 14,
  outlineColor: '#3a8a5d',
};
