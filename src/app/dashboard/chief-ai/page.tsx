'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Task = {
  id: string;
  agent_key: string;
  task_type: string;
  title: string;
  instructions: string;
  status: string;
  priority: number;
  requires_approval: boolean;
  output: any;
  error_message: string | null;
  created_at: string;
  input: any;
};

const agentNames: Record<string, string> = {
  research: 'Research specialist',
  seo: 'SEO specialist',
  sales: 'Sales specialist',
  development: 'Website development specialist',
  client_ops: 'Client support specialist',
  finance: 'Finance specialist',
};

const pretty = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
};

export default function ChiefAIPage() {
  const [goal, setGoal] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/chief-ai', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Chief AI activity.');
      const rows = Array.isArray(data.tasks) ? data.tasks : [];
      setTasks(rows);
      const latestParent = rows.find((task: Task) => task.agent_key === 'orchestrator' && task.task_type === 'chief_ai_plan');
      setSelectedParentId((current) => current || latestParent?.id || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load Chief AI activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const parents = useMemo(
    () => tasks.filter((task) => task.agent_key === 'orchestrator' && task.task_type === 'chief_ai_plan'),
    [tasks],
  );
  const activeParent = parents.find((task) => task.id === selectedParentId) || parents[0];
  const plan = activeParent?.output?.plan;
  const children = tasks.filter((task) => task.input?.parent_task_id === activeParent?.id);

  async function planWork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('plan');
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/chief-ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chief AI could not create this plan.');
      setSelectedParentId(data.parent_task_id || '');
      setGoal('');
      setNotice('Your new plan is ready. The task list below now shows only work belonging to this plan.');
      await load();
      if (data.parent_task_id) setSelectedParentId(data.parent_task_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Planning failed.');
    } finally {
      setBusy('');
    }
  }

  async function execute(id: string) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/agent-tasks/' + id + '/execute', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Specialist execution failed.');
      setNotice('The specialist has finished its draft. Review the result below before using it.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Execution failed.');
    } finally {
      setBusy('');
    }
  }

  async function taskAction(id: string, action: 'approve' | 'retry') {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/agent-tasks/' + id + '/' + action, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The task could not be updated.');
      setNotice(data.message || 'Task updated.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Task update failed.');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="side-brand" href="/dashboard"><span className="brand-mark">A</span>AgencyOS</a>
        <div className="side-label">WORKSPACE</div>
        <nav className="nav">
          <a href="/dashboard">Overview</a>
          <a className="active" href="/dashboard/chief-ai">Chief AI &amp; Agents</a>
          <a href="/dashboard/operating-plans">Operating plans</a>
          <a href="/dashboard/projects">Projects &amp; delivery</a>
          <a href="/dashboard/clients">Clients &amp; retention</a>
        </nav>
        <div className="side-bottom">Owner-controlled coordination<br />Specialist draft execution</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="eyebrow">YOUR AGENCY ASSISTANT</div>
            <h1>Chief AI &amp; Specialist Agents</h1>
            <p className="sub">Tell Chief AI what outcome you want. It breaks the work into clear steps and assigns the right specialists.</p>
          </div>
          <span className="owner-pill">● OWNER CONTROLLED</span>
        </div>

        <section className="panel">
          <h2>What should the agency work on?</h2>
          <form onSubmit={planWork} style={{ display: 'grid', gap: 12 }}>
            <textarea
              className="field"
              rows={4}
              minLength={5}
              maxLength={4000}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Example: Help me prepare a clear plan to find and win our next website design client."
              required
            />
            <button className="primary-btn" disabled={busy === 'plan' || goal.trim().length < 5}>
              {busy === 'plan' ? 'Preparing your plan…' : 'Create my plan'}
            </button>
          </form>
          <p className="notice">Chief AI plans and prepares draft work. It does not contact customers, spend money, publish websites or change live systems without your approval.</p>
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="success" role="status">{notice}</p>}
        </section>

        {parents.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Your plans</h2>
                <p className="sub">Choose a plan to see only the tasks created for that request. Older tasks from other requests are kept in their own history.</p>
              </div>
              <button className="btn" onClick={() => void load()} disabled={loading}>Refresh</button>
            </div>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13 }}>
              Plan history
              <select className="field" style={{ marginTop: 7 }} value={activeParent?.id || ''} onChange={(event) => setSelectedParentId(event.target.value)}>
                {parents.map((item) => <option key={item.id} value={item.id}>{dateLabel(item.created_at)} · {item.title}</option>)}
              </select>
            </label>
            {plan && (
              <div style={{ marginTop: 20 }}>
                <div className="eyebrow">PLAN SUMMARY</div>
                <h2 style={{ marginTop: 7 }}>{plan.objective || activeParent?.title}</h2>
                <p style={{ lineHeight: 1.7 }}>{plan.summary || 'No summary was provided.'}</p>
                <h3>What happens next</h3>
                <ol style={{ lineHeight: 1.8, paddingLeft: 22 }}>
                  {(plan.ordered_actions || []).map((item: string, index: number) => <li key={index}>{item}</li>)}
                </ol>
                {(plan.assumptions || []).length > 0 && <>
                  <h3>Things we still need to confirm</h3>
                  <ul style={{ lineHeight: 1.8, paddingLeft: 22 }}>{plan.assumptions.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>
                </>}
                {(plan.risks || []).length > 0 && <>
                  <h3>Things to watch out for</h3>
                  <ul style={{ lineHeight: 1.8, paddingLeft: 22 }}>{plan.risks.map((item: string, index: number) => <li key={index}>{item}</li>)}</ul>
                </>}
                <p className="notice">This is a proposed plan, not proof that the work has been completed. Any missing business information must be checked before acting on it.</p>
              </div>
            )}
          </section>
        )}

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Work for this plan</h2>
              <p className="sub">These are the specialist tasks connected to the plan currently selected above.</p>
            </div>
            <span className="badge">{children.length} task(s)</span>
          </div>
          {loading ? <p>Loading your agency work…</p> : !activeParent ? (
            <p className="notice">No plans yet. Describe a goal above and Chief AI will prepare the first one.</p>
          ) : children.length === 0 ? (
            <p className="notice">No specialist tasks were attached to this plan.</p>
          ) : children.map((task) => (
            <article key={task.id} style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <b>{task.title}</b>
                <span className="badge">{pretty(task.status)}</span>
              </div>
              <p className="secondary">{agentNames[task.agent_key] || pretty(task.agent_key)} · {pretty(task.task_type)}</p>
              {task.requires_approval && <p className="notice">Waiting for your approval. This task has not been carried out.</p>}
              {task.output?.deliverable && (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, background: '#f6f9f7', padding: 12, borderRadius: 8, fontSize: 13 }}>
                  {typeof task.output.deliverable === 'string' ? task.output.deliverable : JSON.stringify(task.output.deliverable, null, 2)}
                </div>
              )}
              {task.error_message && <p className="error">{task.error_message}</p>}
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', color: '#52645a', fontSize: 12 }}>Show task instructions</summary>
                <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, fontSize: 13 }}>{task.instructions}</p>
              </details>
              {task.status === 'waiting_approval' && task.requires_approval && (
                <>
                  <p className="notice">Approval here only releases the specialist to prepare a draft. It does not authorise sending messages, publishing, spending money or changing live systems.</p>
                  <button className="btn green" disabled={!!busy} onClick={() => void taskAction(task.id, 'approve')} style={{ marginTop: 10 }}>
                    {busy === task.id ? 'Approving…' : 'Approve draft preparation'}
                  </button>
                </>
              )}
              {task.status === 'queued' && !task.requires_approval && (
                <button className="btn green" disabled={!!busy} onClick={() => void execute(task.id)} style={{ marginTop: 10 }}>
                  {busy === task.id ? 'Working…' : 'Prepare this task'}
                </button>
              )}
              {task.status === 'failed' && !task.requires_approval && (
                <button className="btn green" disabled={!!busy} onClick={() => void taskAction(task.id, 'retry')} style={{ marginTop: 10 }}>
                  {busy === task.id ? 'Retrying…' : 'Retry task'}
                </button>
              )}
            </article>
          ))}
        </section>

        {parents.length === 0 && !loading && <section className="panel"><p className="notice">No saved plans yet. Start by describing the result you want Chief AI to help you achieve.</p></section>}
      </main>
    </div>
  );
}
