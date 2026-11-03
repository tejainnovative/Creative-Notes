import { useSyncExternalStore } from 'react';
import { getSettings, setSetting } from '../data/settings';

/**
 * Talks to this app's own server (same origin, /api). The device token lives in on-device
 * settings and is sent as a Bearer header; it never goes in a URL.
 */

/** Same origin, under the app's base path (e.g. /creative-notes/api on a sub-path host). */
export const API = `${import.meta.env.BASE_URL}api`;

export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
    this.name = 'ApiError';
  }
}

export async function apiFetch(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal; auth?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.auth !== false) {
    const { deviceToken } = await getSettings();
    if (!deviceToken) throw new ApiError(401, 'not_paired');
    headers.authorization = `Bearer ${deviceToken}`;
  }
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    credentials: 'omit',
  });
  if (!res.ok) {
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `http_${res.status}`;
    if (res.status === 401 && init.auth !== false) {
      // Revoked or unknown: forget it so the app falls back cleanly and Settings shows "not connected".
      await setSetting('deviceToken', '');
      void refreshServer();
    }
    throw new ApiError(res.status, code);
  }
  return res;
}

// ---- server status: reachable, and which upstreams are configured ----

export interface ServerStatus {
  reachable: boolean;
  paired: boolean;
  ai: boolean;
  stt: boolean;
  inbox: boolean;
  checkedAt: number;
}

let status: ServerStatus = { reachable: false, paired: false, ai: false, stt: false, inbox: false, checkedAt: 0 };
const listeners = new Set<() => void>();

export async function refreshServer(): Promise<ServerStatus> {
  const { deviceToken } = await getSettings();
  let next: ServerStatus = { reachable: false, paired: !!deviceToken, ai: false, stt: false, inbox: false, checkedAt: Date.now() };
  // An unpaired device never contacts the server: nothing to ask it, and nothing should leave the device.
  if (deviceToken && navigator.onLine) {
    try {
      const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000), credentials: 'omit' });
      const h = (await res.json()) as { ok?: boolean; ai?: boolean; stt?: boolean; inbox?: boolean };
      if (res.ok && h.ok) next = { ...next, reachable: true, ai: !!h.ai, stt: !!h.stt, inbox: !!h.inbox };
    } catch {
      // offline, server down, or the static build is served without the API: all mean "not reachable"
    }
  }
  status = next;
  for (const fn of listeners) fn();
  return status;
}

export const serverStatus = {
  get: () => status,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useServer(): ServerStatus {
  return useSyncExternalStore(serverStatus.subscribe, serverStatus.get);
}

/** Cloud AI is usable right now: paired, reachable, and the server has a Claude key. */
export const cloudAiReady = () => status.paired && status.reachable && status.ai;
/** Cloud speech is usable right now. */
export const cloudSpeechReady = () => status.paired && status.reachable && status.stt;
