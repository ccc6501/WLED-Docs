import { prisma } from '@/lib/prisma';
import { StatCard } from '@/components/StatCard';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

export default async function OverviewPage() {
  const [threadCount, noteCount, taskCount, projectCount] = await Promise.all([
    prisma.thread.count(),
    prisma.note.count(),
    prisma.task.count(),
    prisma.project.count()
  ]);

  const recentThreads = await prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5,
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });

  const tasks = await prisma.task.findMany({
    take: 6,
    orderBy: { updatedAt: 'desc' },
    include: { Project: true }
  });

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Threads" value={String(threadCount)} trend="Live conversations with your agents" />
        <StatCard label="Notes" value={String(noteCount)} trend="Persistent annotations" />
        <StatCard label="Tasks" value={String(taskCount)} trend="Kanban-ready" />
        <StatCard label="Projects" value={String(projectCount)} trend="Progress tracked automatically" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Threads</h2>
            <Link href="/chat" className="text-xs uppercase text-accent">
              Open chat
            </Link>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {recentThreads.map((thread) => (
              <li key={thread.id} className="rounded-2xl bg-black/40 p-4">
                <p className="font-medium text-foreground">{thread.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">Last activity {formatDate(thread.updatedAt)}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {thread.messages[0]?.content.slice(0, 160) ?? 'No messages yet.'}
                </p>
              </li>
            ))}
            {!recentThreads.length && <p className="text-xs text-muted-foreground">Start a new conversation to see it here.</p>}
          </ul>
        </div>

        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Task Snapshot</h2>
            <Link href="/tasks" className="text-xs uppercase text-accent">
              Manage tasks
            </Link>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {tasks.map((task) => (
              <li key={task.id} className="rounded-2xl bg-black/40 p-4">
                <p className="font-medium text-foreground">{task.title}</p>
                <p className="text-xs uppercase text-muted-foreground">{task.status}</p>
                {task.Project && <p className="mt-1 text-xs text-muted-foreground">Project: {task.Project.name}</p>}
                {task.due && <p className="mt-1 text-xs text-accent">Due {formatDate(task.due)}</p>}
              </li>
            ))}
            {!tasks.length && <p className="text-xs text-muted-foreground">Create tasks to track your operations.</p>}
          </ul>
        </div>
      </section>
    </div>
  );
}
