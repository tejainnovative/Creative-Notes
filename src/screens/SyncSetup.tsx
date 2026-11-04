import { useState } from 'react';
import { CheckCircle2, RefreshCw, Smartphone } from 'lucide-react';
import { setSetting, useSettings } from '../data';
import { MIN_PASSPHRASE } from '../data/backup';
import { useOnline } from '../app/connectivity';
import { ApiError, refreshServer } from '../net/api';
import { SyncSetupError, disableSync, enableSync, resetSyncSpace, syncNow, useSync } from '../sync/engine';
import { Banner, Button, ConfirmDialog, SettingsGroup, SettingsRow, Skeleton, TopBar, useToast } from '../ui';
import { Field } from './parts/BackupSettings';
import { defaultLabel, pair } from './parts/ServerSettings';

const ERRORS: Record<string, string> = {
  wrong_passphrase: "That passphrase doesn't match the one your other devices use.",
  not_paired: 'This device is no longer connected to your server. Turn sync on again to reconnect it.',
  server: "Your server couldn't be reached. Check your connection and try again.",
  reset: 'Sync was reset from another device. Turn it on again with the new passphrase.',
  wrong_code: "That setup code isn't right.",
  too_many_attempts: 'Too many tries from this network. Wait an hour and try again.',
  not_configured: 'The server has no setup code yet.',
};

function ago(t: number) {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** S17 Sync: keep this device and your others in step, encrypted end to end. */
export function SyncSetup() {
  const s = useSettings();
  const sync = useSync();
  const online = useOnline();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'off' | 'reset' | null>(null);

  if (!s) return (<><TopBar title="Sync" back="/settings" /><div className="p-4"><Skeleton lines={5} /></div></>);
  const on = !!s.syncKey;
  const paired = !!s.deviceToken;
  const tooShort = pass.length > 0 && pass.length < MIN_PASSPHRASE;

  async function turnOn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!paired) {
        const r = await pair(code, defaultLabel(), 'full');
        await setSetting('deviceToken', r.token);
        await setSetting('deviceId', r.device_id);
        await refreshServer();
      }
      const how = await enableSync(pass);
      setPass('');
      setPass2('');
      await syncNow();
      toast({ tone: 'success', text: how === 'created' ? 'Sync is on. Use the same passphrase on your other devices.' : 'Sync is on. Your devices are in step.' });
    } catch (err) {
      const code = err instanceof SyncSetupError || err instanceof ApiError ? err.code : 'server';
      setError(ERRORS[code] ?? ERRORS.server!);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar title="Sync" back="/settings" />
      <div className="mx-auto max-w-(--cn-content-max) space-y-6 px-4 py-4 pb-10">
        <section aria-labelledby="sync-h" className="space-y-3 rounded-lg bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-pill bg-accent-soft text-accent"><Smartphone aria-hidden className="size-5" /></span>
            <div>
              <h2 id="sync-h" className="text-lg">Sync between your devices</h2>
              <p className="text-sm text-muted">Tasks, notes and meetings, on your phone and computer</p>
            </div>
          </div>

          {on ? (
            <>
              {sync.state === 'error' && sync.error && <Banner tone="danger">{ERRORS[sync.error]}</Banner>}
              {sync.state === 'offline' && <Banner tone="warning">You're offline. Changes sync when you're back online.</Banner>}
              <p className="flex items-center gap-2 text-sm text-success">
                {sync.state === 'syncing'
                  ? <><RefreshCw aria-hidden className="size-5 animate-spin" /> Syncing…</>
                  : <><CheckCircle2 aria-hidden className="size-5" /> Sync is on. Last synced {ago(sync.lastSyncAt || s.lastSyncAt)}.</>}
              </p>
              <Button variant="secondary" icon={<RefreshCw aria-hidden className="size-4" />} disabled={!online || sync.state === 'syncing'} onClick={() => void syncNow()}>Sync now</Button>
            </>
          ) : (
            <form onSubmit={(e) => void turnOn(e)}>
              <p className="text-sm">
                Changes on one device appear on the others within seconds. Everything is locked with your sync
                passphrase before it leaves the device, so your server only stores scrambled data it can't read.
              </p>
              {!online && <div className="mt-3"><Banner tone="warning">Connect to the internet to turn sync on.</Banner></div>}
              {sync.error === 'reset' && <div className="mt-3"><Banner tone="warning">{ERRORS.reset}</Banner></div>}
              {!paired && (
                <Field label="Setup code" hint="From your server's settings. Only needed once on each device." autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />
              )}
              <Field
                label="Sync passphrase"
                type="password"
                autoComplete="new-password"
                hint={`At least ${MIN_PASSPHRASE} characters. Use the same one on every device. Nobody can recover it, but you can reset sync if you forget it.`}
                value={pass}
                onChange={(e) => { setPass(e.target.value); setError(''); }}
              />
              <Field label="Passphrase again" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
              {tooShort && <p className="mt-2 text-sm text-danger">The passphrase needs at least {MIN_PASSPHRASE} characters.</p>}
              {pass2.length > 0 && pass !== pass2 && <p className="mt-2 text-sm text-danger">The passphrases don't match.</p>}
              {error && <div className="mt-3"><Banner tone="danger">{error}</Banner></div>}
              <div className="pt-4">
                <Button type="submit" disabled={busy || !online || pass.length < MIN_PASSPHRASE || pass !== pass2 || (!paired && !code.trim())}>
                  {busy ? 'Turning sync on…' : 'Turn on sync'}
                </Button>
              </div>
            </form>
          )}
        </section>

        <SettingsGroup title="What syncs">
          <SettingsRow label="Tasks and reminders" value="Yes" />
          <SettingsRow label="Quick notes" value="Yes" />
          <SettingsRow label="Meetings, transcripts and summaries" value="Yes" description="Once the recording and its clean-up have finished" />
          <SettingsRow label="Settings and speech models" value="No" description="Set up on each device" />
        </SettingsGroup>

        {on && (
          <SettingsGroup title="Manage">
            <SettingsRow label="Turn off sync on this device" description="Your data stays here and on your other devices." onClick={() => setConfirm('off')} />
            <SettingsRow label="Reset sync" description="Forgot the passphrase? Clears the server's copy. Each device keeps its own data." danger onClick={() => setConfirm('reset')} />
          </SettingsGroup>
        )}
      </div>
      <ConfirmDialog
        open={confirm === 'off'}
        title="Turn off sync on this device?"
        body="Changes here will stop reaching your other devices. Nothing is deleted."
        confirmLabel="Turn off"
        onConfirm={() => { setConfirm(null); void disableSync(); }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset sync?"
        body="The server's encrypted copy is deleted and sync stops on every device. Each device keeps its own data. Turn sync on again everywhere with a new passphrase."
        confirmLabel="Reset"
        onConfirm={() => { setConfirm(null); void resetSyncSpace().then(() => toast({ text: 'Sync was reset' })); }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
