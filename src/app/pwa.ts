import { registerSW } from 'virtual:pwa-register';

/**
 * Registers the service worker that caches the app for offline use.
 * Updates apply on the next launch, never mid-recording.
 */
export function registerServiceWorker() {
  if (import.meta.env.DEV) return;
  registerSW({ immediate: true });
}
