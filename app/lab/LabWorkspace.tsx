'use client';

import { useState } from 'react';
import { UploadDropzone } from '@/components/UploadDropzone';

interface RagMatch {
  source: string;
  chunkId: number;
  text: string;
  score: number;
}

export function LabWorkspace() {
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: number }>>([]);
  const [matches, setMatches] = useState<RagMatch[]>([]);
  const [query, setQuery] = useState('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  async function indexAll() {
    if (!uploadedFiles.length) return;
    setIsIndexing(true);
    try {
      const response = await fetch('/api/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: uploadedFiles.map((file) => file.name) })
      });
      if (!response.ok) {
        console.error('Indexing failed');
        return;
      }
      await response.json();
    } finally {
      setIsIndexing(false);
    }
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch('/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, k: 8 })
      });
      if (!response.ok) {
        console.error('Query failed');
        return;
      }
      const data = await response.json();
      setMatches(data.matches ?? []);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-4">
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h2 className="text-lg font-semibold text-foreground">Ingest Ops Knowledge</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Drop xlsx/csv/pdf files. They are stored locally for FAISS-style indexing. Chrome drag-and-drop optimized.
          </p>
          <UploadDropzone
            onUploadComplete={(files) =>
              setUploadedFiles((prev) => {
                const merged = new Map<string, { name: string; size: number }>();
                [...prev, ...files].forEach((file) => merged.set(file.name, file));
                return Array.from(merged.values());
              })
            }
          />
          <button
            onClick={() => void indexAll()}
            disabled={!uploadedFiles.length || isIndexing}
            className="mt-4 w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:bg-primary/30"
          >
            {isIndexing ? 'Indexing…' : 'Index Uploaded Files'}
          </button>
          <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
            {uploadedFiles.map((file) => (
              <li key={file.name} className="flex items-center justify-between rounded-2xl bg-black/30 px-3 py-2">
                <span>{file.name}</span>
                <span>{(file.size / 1024).toFixed(1)} KB</span>
              </li>
            ))}
            {!uploadedFiles.length && <li>No files uploaded yet.</li>}
          </ul>
        </div>
      </div>
      <div className="space-y-4">
        <form onSubmit={handleSearch} className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h2 className="text-lg font-semibold text-foreground">Search Knowledge Base</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hybrid keyword + embedding search returns highest ranking chunks with similarity scores.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search query"
              className="flex-1 rounded-2xl border border-border/40 bg-black/30 px-4 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black"
              disabled={isSearching}
            >
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </div>
        </form>
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h3 className="text-sm font-semibold text-foreground">Matches</h3>
          <ul className="mt-3 space-y-3 text-sm">
            {matches.map((match) => (
              <li key={`${match.source}-${match.chunkId}`} className="rounded-2xl bg-black/30 p-3">
                <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                  <span>{match.source}</span>
                  <span>{Math.round(match.score * 100) / 100}</span>
                </div>
                <p className="mt-2 text-sm text-foreground/90 whitespace-pre-line">{match.text}</p>
              </li>
            ))}
            {!matches.length && <li className="text-xs text-muted-foreground">No matches yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
