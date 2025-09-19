'use client';

import { useEffect, useMemo, useState } from 'react';
import { DataTable } from '@/components/DataTable';

interface LogEntry {
  id: string;
  type: string;
  detail: string;
  durationMs?: number;
  status?: number;
  createdAt: string;
}

const ESTIMATED_TOKEN_PER_CHAR = 0.25;
const OPENROUTER_PRICE_PER_1K = 0.0005;

export function DevWorkbench() {
  const [prompt, setPrompt] = useState('');
  const [playgroundPrompt, setPlaygroundPrompt] = useState('');
  const [playgroundResponse, setPlaygroundResponse] = useState('');
  const [temperature, setTemperature] = useState(0.3);
  const [embeddingText, setEmbeddingText] = useState('');
  const [embeddingVector, setEmbeddingVector] = useState<number[]>([]);
  const [embeddingMode, setEmbeddingMode] = useState('');
  const [embeddingProvider, setEmbeddingProvider] = useState('');
  const [embeddingDimension, setEmbeddingDimension] = useState<number | null>(null);
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [backupPayload, setBackupPayload] = useState<string>('');

  const estimatedTokens = useMemo(() => Math.max(1, Math.round(prompt.length * ESTIMATED_TOKEN_PER_CHAR)), [prompt]);
  const estimatedCost = useMemo(() => ((estimatedTokens / 1000) * OPENROUTER_PRICE_PER_1K).toFixed(4), [estimatedTokens]);

  useEffect(() => {
    void refreshLogs();
  }, []);

  async function refreshLogs() {
    const response = await fetch('/api/logs?limit=50');
    const data = await response.json();
    setLogs(data.logs ?? []);
  }

  async function runPlayground() {
    if (!playgroundPrompt.trim()) return;
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: `Respond with temperature ${temperature.toFixed(1)} intent.` },
          { role: 'user', content: playgroundPrompt }
        ],
        stream: false
      })
    });
    if (!response.ok) {
      const error = await response.json();
      setPlaygroundResponse(JSON.stringify(error));
      return;
    }
    const data = await response.json();
    setPlaygroundResponse(data.content ?? JSON.stringify(data));
  }

  async function computeEmbedding() {
    if (!embeddingText.trim()) return;
    setEmbeddingError(null);
    try {
      const response = await fetch('/api/dev/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: embeddingText })
      });
      const data = await response.json();
      if (!response.ok) {
        setEmbeddingError(data.error ?? 'Embedding request failed');
        setEmbeddingVector([]);
        setEmbeddingMode('');
        setEmbeddingProvider('');
        setEmbeddingDimension(null);
        return;
      }
      setEmbeddingVector((data.vector as number[] | undefined)?.slice(0, 32) ?? []);
      setEmbeddingMode(typeof data.mode === 'string' ? data.mode : '');
      setEmbeddingProvider(typeof data.provider === 'string' ? data.provider : '');
      setEmbeddingDimension(typeof data.dimension === 'number' ? data.dimension : null);
    } catch (error) {
      setEmbeddingError(error instanceof Error ? error.message : 'Embedding request failed');
      setEmbeddingVector([]);
      setEmbeddingMode('');
      setEmbeddingProvider('');
      setEmbeddingDimension(null);
    }
  }

  async function fetchBackup() {
    const response = await fetch('/api/dev/backup');
    const data = await response.json();
    setBackupPayload(JSON.stringify(data, null, 2));
  }

  async function restoreFromBackup() {
    if (!backupPayload.trim()) return;
    await fetch('/api/dev/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: backupPayload
    });
    await refreshLogs();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h2 className="text-lg font-semibold text-foreground">Prompt Scratchpad</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Quick drafts with live token + cost estimates (Chrome copy & paste ready).
          </p>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={8}
            className="mt-4 w-full rounded-2xl border border-border/40 bg-black/30 p-4 text-sm outline-none focus:border-primary"
            placeholder="Type your multi-shot prompt"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>{prompt.length} chars · ~{estimatedTokens} tokens</span>
            <span>≈ ${estimatedCost}/call (OpenRouter est.)</span>
          </div>
        </div>
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h2 className="text-lg font-semibold text-foreground">Model Playground</h2>
          <textarea
            value={playgroundPrompt}
            onChange={(event) => setPlaygroundPrompt(event.target.value)}
            rows={6}
            className="mt-4 w-full rounded-2xl border border-border/40 bg-black/30 p-4 text-sm outline-none focus:border-primary"
            placeholder="Send a quick prompt to the active provider"
          />
          <label className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            Temperature
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
            <span>{temperature.toFixed(1)}</span>
          </label>
          <button
            onClick={() => void runPlayground()}
            className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black"
          >
            Run Prompt
          </button>
          {playgroundResponse && (
            <pre className="mt-3 max-h-48 overflow-y-auto rounded-2xl bg-black/50 p-3 text-xs text-foreground/80">
              {playgroundResponse}
            </pre>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h2 className="text-lg font-semibold text-foreground">Embeddings Tester</h2>
          <textarea
            value={embeddingText}
            onChange={(event) => setEmbeddingText(event.target.value)}
            rows={6}
            className="mt-4 w-full rounded-2xl border border-border/40 bg-black/30 p-4 text-sm outline-none focus:border-primary"
            placeholder="Paste text to embed with the configured provider"
          />
          <button
            onClick={() => void computeEmbedding()}
            className="mt-3 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black"
          >
            Compute Vector
          </button>
          {embeddingError && <p className="mt-2 text-xs text-destructive">{embeddingError}</p>}
          {!embeddingError && (embeddingMode || embeddingProvider || embeddingDimension) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {embeddingMode ? `Mode: ${embeddingMode}` : ''}
              {embeddingProvider ? `${embeddingMode ? ' • ' : ''}Provider: ${embeddingProvider}` : ''}
              {typeof embeddingDimension === 'number' ? `${embeddingMode || embeddingProvider ? ' • ' : ''}Dim: ${embeddingDimension}` : ''}
            </p>
          )}
          {embeddingVector.length > 0 && (
            <pre className="mt-3 max-h-40 overflow-y-auto rounded-2xl bg-black/50 p-3 text-xs text-foreground/80">
              {embeddingVector.join(', ')}
            </pre>
          )}
        </div>
        <div className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
          <h2 className="text-lg font-semibold text-foreground">Activity Log</h2>
          <p className="mt-2 text-sm text-muted-foreground">Last 50 chat/RAG/API events.</p>
          <button onClick={() => void refreshLogs()} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-black">
            Refresh
          </button>
          <div className="mt-4 max-h-64 overflow-y-auto">
            <DataTable
              data={logs}
              columns={[
                { key: 'type', header: 'Type' },
                { key: 'detail', header: 'Detail' },
                { key: 'durationMs', header: 'ms' },
                { key: 'status', header: 'Status' }
              ]}
            />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border/60 bg-black/40 p-6 shadow-glass">
        <h2 className="text-lg font-semibold text-foreground">Backup & Restore</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Download the SQLite + vector store snapshot. Chrome will prompt a JSON file download you can store securely.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button onClick={() => void fetchBackup()} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-black">
            Fetch backup payload
          </button>
          <button onClick={() => void restoreFromBackup()} className="rounded-full border border-accent px-4 py-2 text-sm font-semibold text-accent">
            Restore from payload
          </button>
        </div>
        <textarea
          value={backupPayload}
          onChange={(event) => setBackupPayload(event.target.value)}
          rows={6}
          className="mt-4 w-full rounded-2xl border border-border/40 bg-black/30 p-4 text-xs font-mono text-foreground outline-none focus:border-primary"
        />
      </section>
    </div>
  );
}
