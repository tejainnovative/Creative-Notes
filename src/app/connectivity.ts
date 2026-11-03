import { useSyncExternalStore } from 'react';

/**
 * navigator.onLine is only a hint; when paired, net/api.ts also pings /api/health.
 */
function subscribe(fn: () => void) {
  window.addEventListener('online', fn);
  window.addEventListener('offline', fn);
  return () => {
    window.removeEventListener('online', fn);
    window.removeEventListener('offline', fn);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

export function isOnline(): boolean {
  return navigator.onLine;
}
