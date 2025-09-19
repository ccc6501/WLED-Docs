import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DB_PATH = path.resolve('dev.db');
const VECTOR_PATH = path.resolve(process.env.VECTOR_STORE_DIR || '.vectorstore/faiss/vectors.json');

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (!body.db && !body.vectors) {
    return NextResponse.json({ error: 'No payload supplied' }, { status: 400 });
  }

  if (body.db) {
    const buffer = Buffer.from(body.db, 'base64');
    await fs.writeFile(DB_PATH, buffer);
  }

  if (body.vectors) {
    const buffer = Buffer.from(body.vectors, 'base64');
    await fs.mkdir(path.dirname(VECTOR_PATH), { recursive: true });
    await fs.writeFile(VECTOR_PATH, buffer);
  }

  return NextResponse.json({ ok: true });
}
