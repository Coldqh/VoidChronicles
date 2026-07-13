import { APP_VERSION } from '../version';

export interface DiagnosticEntry {
  time: string;
  kind: 'error' | 'unhandledrejection' | 'react' | 'save';
  message: string;
  stack?: string;
}

const STORAGE_KEY = 'void-chronicles:diagnostics';
const MAX_ENTRIES = 50;

function readEntries(): DiagnosticEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) as DiagnosticEntry[] : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(kind: DiagnosticEntry['kind'], error: unknown, extra?: string): void {
  const value = error instanceof Error ? error : new Error(String(error));
  const entries = readEntries();
  entries.push({
    time: new Date().toISOString(),
    kind,
    message: extra ? `${extra}: ${value.message}` : value.message,
    stack: value.stack
  });
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics must never crash the game.
  }
}

let installed = false;
export function installGlobalDiagnostics(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    recordDiagnostic('error', event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordDiagnostic('unhandledrejection', event.reason);
  });
}

export function downloadDiagnostics(currentError?: Error): void {
  if (currentError) recordDiagnostic('react', currentError);
  const payload = {
    generatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    location: window.location.href,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    entries: readEntries()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `void-chronicles-diagnostics-${Date.now()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
