import { prisma } from '@/lib/prisma';
import { TasksBoard } from './TasksBoard';

export default async function TasksPage() {
  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({ include: { Project: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.project.findMany({ orderBy: { name: 'asc' } })
  ]);
  return <TasksBoard initialTasks={tasks} projects={projects} />;
}
