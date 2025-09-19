import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DB_PATH = path.resolve('dev.db');
const VECTOR_PATH = path.resolve(process.env.VECTOR_STORE_DIR || '.vectorstore/faiss/vectors.json');

export const runtime = 'nodejs';

export async function GET() {
  const payload: Record<string, string | null> = { db: null, vectors: null };
  try {
    const db = await fs.readFile(DB_PATH);
    payload.db = Buffer.from(db).toString('base64');
  } catch {
    payload.db = null;
  }
  try {
    const vectors = await fs.readFile(VECTOR_PATH);
    payload.vectors = Buffer.from(vectors).toString('base64');
  } catch {
    payload.vectors = null;
  }

  return NextResponse.json(payload);
}
