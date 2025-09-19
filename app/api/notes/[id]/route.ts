import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  const note = await prisma.note.update({
    where: { id: params.id },
    data: {
      title: body.title,
      body: body.body,
      tags: body.tags
    }
  });
  return NextResponse.json(note);
}

export async function DELETE(_: Request, { params }: Params) {
  await prisma.note.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
