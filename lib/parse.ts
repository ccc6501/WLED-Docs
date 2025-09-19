import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse';

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

export interface ParsedDocument {
  source: string;
  chunks: string[];
}

function chunkText(text: string): string[] {
  const tokens = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
    const slice = tokens.slice(i, i + CHUNK_SIZE).join(' ');
    if (slice.trim()) {
      chunks.push(slice.trim());
    }
  }
  return chunks;
}

async function parsePdf(filePath: string) {
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return chunkText(parsed.text);
}

async function parseSpreadsheet(filePath: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const chunks: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    rows.forEach((row, index) => {
      const rowText = Object.entries(row)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      chunks.push(`Sheet ${sheetName} row ${index + 1}\n${rowText}`);
    });
  }
  return chunks;
}

async function parsePlainText(filePath: string) {
  const text = await fs.readFile(filePath, 'utf-8');
  return chunkText(text);
}

export async function parseFileToChunks(filePath: string): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase();
  let chunks: string[] = [];

  if (['.xlsx', '.xls', '.csv'].includes(ext)) {
    chunks = await parseSpreadsheet(filePath);
  } else if (['.pdf'].includes(ext)) {
    chunks = await parsePdf(filePath);
  } else {
    chunks = await parsePlainText(filePath);
  }

  return { source: path.basename(filePath), chunks };
}
