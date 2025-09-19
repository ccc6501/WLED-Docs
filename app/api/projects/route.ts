import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const projects = await prisma.project.findMany({
    include: {
      tasks: true
    },
    orderBy: { updatedAt: 'desc' }
  });
  return NextResponse.json(
    projects.map((project) => ({
      ...project,
      progress:
        project.tasks.length === 0
          ? 0
          : project.tasks.filter((task) => task.status === 'done').length / project.tasks.length
    }))
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const project = await prisma.project.create({
    data: {
      name: body.name ?? 'Untitled project',
      summary: body.summary ?? ''
    }
  });
  return NextResponse.json(project, { status: 201 });
}
