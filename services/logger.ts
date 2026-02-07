import { useSettingsStore } from '@/stores/settings-store';

export type LogCategory = 'discovery' | 'connection' | 'api' | 'upload' | 'queue' | 'store';

export interface LogEntry {
  id: string;
  timestamp: number;
  category: LogCategory;
  message: string;
}

const MAX_ENTRIES = 1000;
let logs: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function log(category: LogCategory, message: string): void {
  if (!useSettingsStore.getState().debugLogsEnabled) return;

  const entry: LogEntry = {
    id: String(nextId++),
    timestamp: Date.now(),
    category,
    message,
  };

  logs.push(entry);
  if (logs.length > MAX_ENTRIES) {
    logs = logs.slice(logs.length - MAX_ENTRIES);
  }

  notifyListeners();
}

export function getLogs(): LogEntry[] {
  return [...logs];
}

export function clearLogs(): void {
  logs = [];
  notifyListeners();
}

export function subscribeToLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
