'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Project = {
  id: string; name: string; service_type: string; status: string;
  client_name: string | null; agreed_value: string | null; currency: string;
  task_total: number; task_done: number; next_due: string | null;
};
type Task = {
  id: string; title: string; description: string; status: string;
  priority: string; due_at: string | null;
};
const stages = ['brief_needed','planning','building','qa','awaiting_approval','deploying','live','blocked','completed'];
const pretty = (value: string) => value.replaceAll('_',' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function Projects() {
  const [projects,setProjects] = useState<Project[]>([]);
  const [selected,setSelected] = useState('');
  const [tasks,setTasks] = useState<Task[]>([]);
  const [activity,setActivity] = useState<any[]>([]);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [title,setTitle] = useState('');
  const [description,setDescription] = useState('');
  const [priority,setPriority] = useState('normal');
  const [due,setDue] = useState('');
  const current = projects.find((p) => p.id === selected);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load projects');
      setProjects(data.projects || []);
      setSelected((value) => value || data.projects?.[0]?.id || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load projects');
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const [taskResponse,detailResponse] = await Promise.all([
        fetch('/api/projects/' + id + '/tasks'),
        fetch('/api/projects/' + id)
      ]);
      const taskData = await taskResponse.json();
      const detailData = await detailResponse.json();
      if (!taskResponse.ok || !detailResponse.ok) throw new Error(taskData.error || detailData.error || 'Could not load project');
      setTasks(taskData.tasks || []);
      setActivity(detailData.activity || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load project details');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selected) loadDetail(selected); }, [selected,loadDetail]);

  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((p) => !['completed','live'].includes(p.status)).length,
    blocked: projects.filter((p) => p.status === 'blocked').length,
    done: projects.filter((p) => p.status === 'completed').length
  }), [projects]);

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/projects/' + selected + '/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title,description,priority,due_at:due })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not add task');
      setTitle('');
      setDescription('');
      setDue('');
      await Promise.all([loadDetail(selected),load()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task');
    } finally {
      setBusy(false);
    }
  }

  async function updateTask(task: Task, changes: Record<string,unknown>) {
    setError('');
    try {
      const response = await fetch('/api/projects/' + selected + '/tasks', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task_id: task.id,...changes })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update task');
      await Promise.all([loadDetail(selected),load()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update task');
    }
  }

  async function updateStage(status: string) {
    setError('');
    try {
      const response = await fetch('/api/projects/' + selected, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update project stage');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update project stage');
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="side-brand"><span className="brand-mark">A</span>AgencyOS</div>
        <div className="side-label">WORKSPACE</div>
        <nav className="nav">
          <a href="/dashboard">⌕ Research &amp; Leads</a>
          <a className="active" href="/dashboard/projects">▣ Projects &amp; Delivery</a>
        </nav>
        <div className="side-bottom">Private agency command centre<br />Owner workspace</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div><h1>Projects &amp; Delivery</h1><div className="sub">Track client work from accepted scope through delivery and handover.</div></div>
          <span className="owner-pill">● PRIVATE WORKSPACE</span>
        </div>
        <nav className="mobile-menu">
          <a href="/dashboard">Research &amp; Leads</a>
          <a className="active" href="/dashboard/projects">Projects &amp; Delivery</a>
        </nav>

        <section className="metric-grid">
          <div className="metric"><div className="metric-label">Total projects</div><div className="metric-value">{stats.total}</div></div>
          <div className="metric"><div className="metric-label">In progress</div><div className="metric-value">{stats.active}</div></div>
          <div className="metric"><div className="metric-label">Blocked</div><div className="metric-value">{stats.blocked}</div></div>
          <div className="metric"><div className="metric-label">Completed</div><div className="metric-value">{stats.done}</div></div>
        </section>

        <div className="project-layout">
          <section className="panel">
            <div className="panel-head">
              <div><h2>Project portfolio</h2><div className="sub">Accepted proposals converted to projects appear here.</div></div>
              <button className="btn" type="button" onClick={load}>Refresh</button>
            </div>
            {projects.length === 0 ? (
              <div className="empty">No client projects yet. Convert a formally accepted proposal from the prospect workspace.</div>
            ) : projects.map((project) => (
              <button key={project.id} type="button" className={'project-row ' + (selected === project.id ? 'selected' : '')} onClick={() => setSelected(project.id)}>
                <span>
                  <b>{project.name}</b>
                  <small>{project.client_name || 'Client not linked'} · {project.service_type}</small>
                  <small>{project.task_done}/{project.task_total} tasks complete{project.next_due ? ' · Next due ' + new Date(project.next_due + 'T00:00:00').toLocaleDateString() : ''}</small>
                </span>
                <span className="badge">{pretty(project.status)}</span>
              </button>
            ))}
          </section>

          <section className="panel">
            {!current ? (
              <div className="empty">Select a project to manage delivery.</div>
            ) : (
              <div>
                <div className="panel-head">
                  <div>
                    <h2>{current.name}</h2>
                    <div className="sub">{current.client_name || 'Client'} · {current.agreed_value ? current.currency + ' ' + Number(current.agreed_value).toLocaleString() : 'Commercial value not recorded'}</div>
                  </div>
                  <span className="badge">{current.task_done}/{current.task_total} done</span>
                </div>

                <label className="project-stage">Delivery stage
                  <select className="field" value={current.status} onChange={(event) => updateStage(event.target.value)}>
                    {stages.map((stage) => <option key={stage} value={stage}>{pretty(stage)}</option>)}
                  </select>
                </label>

                <div className="task-section">
                  <div className="panel-head"><div><h2>Delivery checklist</h2><div className="sub">Add work items, priorities and due dates.</div></div></div>
                  <form onSubmit={addTask} className="task-form">
                    <label>Task title
                      <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={180} placeholder="e.g. Approve homepage structure" />
                    </label>
                    <label>Description
                      <textarea className="field" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What needs to be done?" />
                    </label>
                    <div className="form-grid">
                      <label>Priority
                        <select className="field" value={priority} onChange={(event) => setPriority(event.target.value)}>
                          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                        </select>
                      </label>
                      <label>Due date<input className="field" type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
                    </div>
                    <button className="primary-btn" disabled={busy || !title.trim()}>{busy ? 'Adding…' : '＋ Add delivery task'}</button>
                  </form>

                  <div className="task-list">
                    {tasks.length === 0 ? <div className="empty">No delivery tasks yet. Add the first item above.</div> : tasks.map((task) => (
                      <article className="task-item" key={task.id}>
                        <div className="task-main">
                          <label className="task-check">
                            <input type="checkbox" checked={task.status === 'done'} onChange={(event) => updateTask(task,{status:event.target.checked ? 'done' : 'todo'})} />
                            <span><b>{task.title}</b><small>{task.description || 'No extra notes'}{task.due_at ? ' · Due ' + new Date(task.due_at + 'T00:00:00').toLocaleDateString() : ''}</small></span>
                          </label>
                          <div className="task-controls">
                            <select className="field" value={task.status} onChange={(event) => updateTask(task,{status:event.target.value})}>
                              <option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
                            </select>
                            <select className="field" value={task.priority} onChange={(event) => updateTask(task,{priority:event.target.value})}>
                              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
                            </select>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="activity-box">
                  <h2>Project activity</h2>
                  {activity.length > 0 ? activity.map((item) => (
                    <div className="activity-row" key={item.id}><b>{item.summary}</b><small>{new Date(item.created_at).toLocaleString()}</small></div>
                  )) : <p className="notice">Project updates will appear here as tasks and delivery stages change.</p>}
                </div>
              </div>
            )}
          </section>
        </div>
        {error && <p className="error">{error}</p>}
        <p className="notice">AgencyOS records project progress; it does not claim work is completed unless you mark it done. Client approvals, payments, publishing and deployment remain separate approval-gated actions.</p>
      </main>
    </div>
  );
}
