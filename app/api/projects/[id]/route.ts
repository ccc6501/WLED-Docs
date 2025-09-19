import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  const project = await prisma.project.update({
    where: { id: params.id },
    data: {
      name: body.name,
      summary: body.summary
    }
  });
  return NextResponse.json(project);
}

export async function DELETE(_: Request, { params }: Params) {
  await prisma.task.updateMany({ where: { projectId: params.id }, data: { projectId: null } });
  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
