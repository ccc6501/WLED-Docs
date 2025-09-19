'use client';

import { useState } from 'react';
import { DataTable } from '@/components/DataTable';

interface Project {
  id: string;
  name: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  progress?: number;
}

interface ProjectsBoardProps {
  initialProjects: Project[];
}

export function ProjectsBoard({ initialProjects }: ProjectsBoardProps) {
  const [projects, setProjects] = useState(initialProjects);
  const [form, setForm] = useState({ name: '', summary: '' });

  async function refreshProjects() {
    const response = await fetch('/api/projects');
    const data = await response.json();
    setProjects(data);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setForm({ name: '', summary: '' });
    await refreshProjects();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    await refreshProjects();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <div key={project.id} className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
              <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{project.summary || 'No summary yet.'}</p>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                  <span>Progress</span>
                  <span>{Math.round((project.progress ?? 0) * 100)}%</span>
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-black/30">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round((project.progress ?? 0) * 100)}%` }} />
                </div>
              </div>
              <button
                onClick={() => void handleDelete(project.id)}
                className="mt-4 w-full rounded-full border border-destructive px-4 py-2 text-xs font-semibold uppercase text-destructive"
              >
                Delete
              </button>
            </div>
          ))}
          {!projects.length && <p className="text-sm text-muted-foreground">Create your first project to get started.</p>}
        </div>
        <div>
          <DataTable
            data={projects}
            columns={[
              { key: 'name', header: 'Project' },
              {
                key: 'progress',
                header: 'Progress',
                render: (project) => `${Math.round((project.progress ?? 0) * 100)}%`
              },
              {
                key: 'updatedAt',
                header: 'Updated',
                render: (project) => new Date(project.updatedAt).toLocaleString()
              }
            ]}
          />
        </div>
      </div>
      <form onSubmit={handleCreate} className="space-y-3 rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
        <h2 className="text-sm font-semibold text-foreground">Create Project</h2>
        <input
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="Project name"
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <textarea
          value={form.summary}
          onChange={(event) => setForm((prev) => ({ ...prev, summary: event.target.value }))}
          rows={4}
          placeholder="Summary"
          className="w-full rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button type="submit" className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black">
          Save Project
        </button>
      </form>
    </div>
  );
}
