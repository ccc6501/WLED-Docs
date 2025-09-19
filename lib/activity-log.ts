import crypto from 'node:crypto';

interface LogEntry {
  id: string;
  type: 'chat' | 'rag' | 'api';
  detail: string;
  durationMs?: number;
  status?: number;
  createdAt: string;
}

const MAX_LOGS = 200;
const globalRef = globalThis as unknown as { __activityLog?: LogEntry[] };

if (!globalRef.__activityLog) {
  globalRef.__activityLog = [];
}

export function addLog(entry: Omit<LogEntry, 'id' | 'createdAt'>) {
  const logEntry: LogEntry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry
  };
  globalRef.__activityLog!.unshift(logEntry);
  if (globalRef.__activityLog!.length > MAX_LOGS) {
    globalRef.__activityLog!.length = MAX_LOGS;
  }
  return logEntry;
}

export function getLogs(limit = 25) {
  return globalRef.__activityLog!.slice(0, limit);
}
