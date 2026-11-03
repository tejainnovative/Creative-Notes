import { getSettings } from '../data/settings';
import { cloudAiReady, refreshServer, serverStatus } from '../net/api';
import { fakeAi } from './fakeAi';
import { httpAi } from './httpAi';
import { AiUnavailableError, type AiClient } from './types';

/**
 * The one place that decides which AI runs:
 *  - offline, or offline-only mode: nothing is sent; the call fails with AiUnavailableError and the job waits
 *  - paired with a server that has a Claude key: Claude through /api/ai/*
 *  - otherwise: the on-device preview summariser
 */
async function pick(): Promise<AiClient> {
  if (!navigator.onLine) throw new AiUnavailableError('offline');
  const s = await getSettings();
  if (s.connectivityMode === 'offline_only') throw new AiUnavailableError('offline-only');
  if (s.deviceToken && Date.now() - serverStatus.get().checkedAt > 60_000) await refreshServer();
  return cloudAiReady() ? httpAi : fakeAi;
}

export function getAi(): AiClient {
  return {
    get name() {
      return cloudAiReady() ? httpAi.name : fakeAi.name;
    },
    async summarize(input, onDelta, signal) {
      return (await pick()).summarize(input, onDelta, signal);
    },
    async answer(input, onDelta, signal) {
      return (await pick()).answer(input, onDelta, signal);
    },
  };
}
