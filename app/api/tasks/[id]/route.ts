import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  const task = await prisma.task.update({
    where: { id: params.id },
    data: {
      title: body.title,
      status: body.status,
      projectId: body.projectId,
      due: body.due ? new Date(body.due) : null
    }
  });
  return NextResponse.json(task);
}

export async function DELETE(_: Request, { params }: Params) {
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
