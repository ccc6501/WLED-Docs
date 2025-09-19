import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? undefined;

  const notes = await prisma.note.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { body: { contains: q, mode: 'insensitive' } },
            { tags: { contains: q, mode: 'insensitive' } }
          ]
        }
      : undefined,
    orderBy: { updatedAt: 'desc' }
  });

  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const note = await prisma.note.create({
    data: {
      title: body.title ?? 'Untitled note',
      body: body.body ?? '',
      tags: body.tags ?? ''
    }
  });
  return NextResponse.json(note, { status: 201 });
}
