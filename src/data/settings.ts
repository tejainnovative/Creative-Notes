import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';

export type ConnectivityMode = 'auto' | 'offline_only' | 'online_preferred';
export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  displayName: string;
  language: string; // 'auto' or BCP 47
  theme: ThemePref;
  connectivityMode: ConnectivityMode;
  onboarded: boolean;
  consentAcknowledged: boolean;
  installBannerDismissed: boolean;
  offlineModel: 'none' | 'downloading' | 'ready';
  /** Which on-device speech model: 'tiny' (fast) or 'base' (more accurate). */
  offlineModelId: 'tiny' | 'base';
  /** 'auto': browser/cloud speech online, on-device offline. 'device': on-device whenever the model is downloaded. */
  speechEngine: 'auto' | 'device';
  /** After a meeting, re-transcribe its audio on the device for a cleaner transcript, then delete the audio. */
  cleanupAfterRecording: boolean;
  /** Token from /api/pair. Empty when this device isn't connected to the server. */
  deviceToken: string;
  deviceId: string;
  /** Epoch ms of the last backup file made on this device; 0 = never. */
  lastBackupAt: number;
}

export const defaultSettings: Settings = {
  displayName: '',
  language: 'auto',
  theme: 'system',
  connectivityMode: 'auto',
  onboarded: false,
  consentAcknowledged: false,
  installBannerDismissed: false,
  offlineModel: 'none',
  offlineModelId: 'tiny',
  speechEngine: 'auto',
  cleanupAfterRecording: true,
  deviceToken: '',
  deviceId: '',
  lastBackupAt: 0,
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = { ...defaultSettings };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db.settings.put({ key, value });
}

/** Live settings for React. Undefined until the first read finishes. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(getSettings, []);
}
