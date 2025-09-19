import { prisma } from '@/lib/prisma';
import { ProjectsBoard } from './ProjectsBoard';

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({ include: { tasks: true } });
  const augmented = projects.map((project) => ({
    ...project,
    progress: project.tasks.length
      ? project.tasks.filter((task) => task.status === 'done').length / project.tasks.length
      : 0
  }));
  return <ProjectsBoard initialProjects={augmented} />;
}
