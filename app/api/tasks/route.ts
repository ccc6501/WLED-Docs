import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? undefined;
  const q = searchParams.get('q') ?? undefined;

  const tasks = await prisma.task.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            title: { contains: q, mode: 'insensitive' }
          }
        : {})
    },
    include: { Project: true },
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json(tasks);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const task = await prisma.task.create({
    data: {
      title: body.title ?? 'Untitled task',
      status: body.status ?? 'todo',
      projectId: body.projectId ?? null,
      due: body.due ? new Date(body.due) : null
    }
  });
  return NextResponse.json(task, { status: 201 });
}
