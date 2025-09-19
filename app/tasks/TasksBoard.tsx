'use client';

import { useState } from 'react';
import { DataTable } from '@/components/DataTable';

interface Task {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  due: string | null;
  createdAt: string;
  updatedAt: string;
  Project?: { id: string; name: string } | null;
}

interface Project {
  id: string;
  name: string;
}

interface TasksBoardProps {
  initialTasks: Task[];
  projects: Project[];
}

const STATUSES: Array<{ value: Task['status']; label: string }> = [
  { value: 'todo', label: 'To do' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' }
];

export function TasksBoard({ initialTasks, projects }: TasksBoardProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [form, setForm] = useState({ title: '', status: 'todo', projectId: '', due: '' });

  async function refreshTasks() {
    const response = await fetch('/api/tasks');
    const data = await response.json();
    setTasks(data);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        status: form.status,
        projectId: form.projectId || null,
        due: form.due || null
      })
    });
    setForm({ title: '', status: 'todo', projectId: '', due: '' });
    await refreshTasks();
  }

  async function updateTask(task: Task, updates: Partial<Task>) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: updates.title ?? task.title,
        status: updates.status ?? task.status,
        projectId: updates.projectId ?? task.projectId,
        due: updates.due ?? task.due
      })
    });
    await refreshTasks();
  }

  async function deleteTask(task: Task) {
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    await refreshTasks();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-4">
          {STATUSES.map((status) => (
            <div key={status.value} className="rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
              <h3 className="text-sm font-semibold text-foreground">{status.label}</h3>
              <ul className="mt-3 space-y-3 text-sm">
                {tasks
                  .filter((task) => task.status === status.value)
                  .map((task) => (
                    <li key={task.id} className="rounded-2xl border border-border/40 bg-black/20 p-3">
                      <p className="font-medium text-foreground">{task.title}</p>
                      {task.Project && <p className="text-xs text-muted-foreground">{task.Project.name}</p>}
                      {task.due && <p className="text-xs text-accent">Due {new Date(task.due).toLocaleDateString()}</p>}
                      <select
                        value={task.status}
                        onChange={(event) => void updateTask(task, { status: event.target.value })}
                        className="mt-2 w-full rounded-full border border-border/40 bg-black/30 px-2 py-1 text-xs uppercase"
                      >
                        {STATUSES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="mt-2 w-full rounded-full border border-destructive px-2 py-1 text-xs uppercase text-destructive"
                        onClick={() => void deleteTask(task)}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                {!tasks.some((task) => task.status === status.value) && (
                  <p className="text-xs text-muted-foreground">No tasks</p>
                )}
              </ul>
            </div>
          ))}
        </div>
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">All Tasks</h2>
          <DataTable
            data={tasks}
            columns={[
              { key: 'title', header: 'Title' },
              {
                key: 'status',
                header: 'Status',
                render: (task) => task.status.toUpperCase()
              },
              {
                key: 'projectId',
                header: 'Project',
                render: (task) => task.Project?.name ?? '—'
              },
              {
                key: 'due',
                header: 'Due',
                render: (task) => (task.due ? new Date(task.due).toLocaleString() : '—')
              }
            ]}
          />
        </div>
      </div>
      <form onSubmit={handleCreate} className="space-y-3 rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
        <h2 className="text-sm font-semibold text-foreground">Create Task</h2>
        <input
          value={form.title}
          onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          placeholder="Task title"
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <select
          value={form.status}
          onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm uppercase outline-none focus:border-primary"
        >
          {STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
        <select
          value={form.projectId}
          onChange={(event) => setForm((prev) => ({ ...prev, projectId: event.target.value }))}
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.due}
          onChange={(event) => setForm((prev) => ({ ...prev, due: event.target.value }))}
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button type="submit" className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black">
          Save Task
        </button>
      </form>
    </div>
  );
}
