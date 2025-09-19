import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

export const runtime = 'nodejs';

async function saveFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = path.basename(file.name);
  const filePath = path.join(UPLOAD_DIR, safeName);
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(filePath, buffer);
  return { name: safeName, size: buffer.byteLength };
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const entries = formData.getAll('files');
  if (!entries.length) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const files: Array<{ name: string; size: number }> = [];
  for (const entry of entries) {
    if (entry instanceof File) {
      files.push(await saveFile(entry));
    }
  }

  return NextResponse.json({ files });
}
