import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Download, Smartphone, Trash2 } from 'lucide-react';
import { requestPersistentStorage, setSetting, storageEstimate, useSettings } from '../data';
import { bytesLabel } from '../app/format';
import { useOnline } from '../app/connectivity';
import { MODEL, deleteWhisper, loadWhisper, whisperCached, type LoadProgress } from '../speech/whisper';
import { Banner, Button, ConfirmDialog, ProgressBar, SettingsGroup, SettingsRow, Skeleton, Toggle, TopBar, useToast } from '../ui';

type Phase = 'checking' | 'none' | 'downloading' | 'ready' | 'failed';

/** S13 Offline: download the on-device speech model, see storage, set offline-only. */
export function OfflineSetup() {
  const s = useSettings();
  const online = useOnline();
  const toast = useToast();
  const storage = useLiveQuery(storageEstimate, []);
  const [phase, setPhase] = useState<Phase>('checking');
  const [progress, setProgress] = useState<LoadProgress>({ loaded: 0, total: MODEL.approxBytes });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // On opening: the setting says "ready", but the cache is the truth (the browser may have cleared it).
  // Only checked once, when the screen opens: right after a download the library may still be
  // writing files to the cache, so checking then would wrongly report it missing.
  const settingsLoaded = !!s;
  useEffect(() => {
    if (!s || phase !== 'checking') return;
    if (s.offlineModel !== 'ready') return setPhase('none');
    void whisperCached().then((cached) => {
      if (cached) setPhase('ready');
      else {
        setPhase('none');
        void setSetting('offlineModel', 'none');
      }
    });
  }, [settingsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function download() {
    setPhase('downloading');
    await requestPersistentStorage();
    try {
      await loadWhisper((p) => setProgress(p));
      await setSetting('offlineModel', 'ready');
      setPhase('ready');
      toast({ tone: 'success', text: 'Offline transcription is ready' });
    } catch {
      setPhase('failed');
    }
  }

  async function remove() {
    setConfirmDelete(false);
    await deleteWhisper();
    await setSetting('offlineModel', 'none');
    setPhase('none');
    toast({ text: 'Speech model removed from this device' });
  }

  if (!s) return (<><TopBar title="Offline" back="/settings" /><div className="p-4"><Skeleton lines={6} /></div></>);

  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <>
      <TopBar title="Offline" back="/settings" />
      <div className="mx-auto max-w-(--cn-content-max) space-y-6 px-4 py-4 pb-10">
        <section aria-labelledby="model" className="space-y-3 rounded-lg bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-11 items-center justify-center rounded-pill bg-success-soft text-success"><Smartphone aria-hidden className="size-5" /></span>
            <div>
              <h2 id="model" className="text-lg">On-device transcription</h2>
              <p className="text-sm text-muted">Speech model, about {bytesLabel(MODEL.approxBytes)}, downloaded once</p>
            </div>
          </div>

          {phase === 'checking' && <Skeleton lines={2} label="Checking for the speech model" />}

          {phase === 'none' && (
            <>
              <p className="text-sm">
                Download it once and recordings are transcribed on this device whenever you're offline or in offline-only mode.
                Nothing you say leaves the device. Text appears a moment after each pause, without speaker names.
              </p>
              {!online && <Banner tone="warning">Connect to the internet to download the model.</Banner>}
              <Button icon={<Download aria-hidden className="size-5" />} disabled={!online} onClick={() => void download()}>
                Download speech model
              </Button>
            </>
          )}

          {phase === 'downloading' && (
            <div className="space-y-2" aria-live="polite">
              <ProgressBar
                label="Downloading the speech model"
                value={progress.loaded}
                max={progress.total || MODEL.approxBytes}
                valueText={progress.loaded ? `${bytesLabel(progress.loaded)} of ${bytesLabel(progress.total)} (${pct}%)` : 'Starting…'}
              />
              <p className="text-xs text-muted">You can keep using the app. Leave this screen open on a phone until it finishes.</p>
            </div>
          )}

          {phase === 'failed' && (
            <Banner tone="danger" action={<Button size="sm" variant="secondary" onClick={() => void download()}>Try again</Button>}>
              The download didn't finish. Check your connection and try again.
            </Banner>
          )}

          {phase === 'ready' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 aria-hidden className="size-5" /> Ready. Works with no connection.</p>
              <Button size="sm" variant="secondary" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => setConfirmDelete(true)}>Remove</Button>
            </div>
          )}
        </section>

        <SettingsGroup title="What works offline">
          <SettingsRow label="Opening the app" value="Yes" />
          <SettingsRow label="Reading meetings, notes and transcripts" value="Yes" />
          <SettingsRow label="Quick notes" value="Yes" />
          <SettingsRow label="Live transcript" value={phase === 'ready' ? 'Yes, on device' : 'Needs the speech model'} />
          <SettingsRow label="Summaries and answers" value="Queued" description="Written automatically when you're back online" />
        </SettingsGroup>

        <SettingsGroup title="Privacy">
          <SettingsRow
            label="Offline only"
            description="Never send audio or text off this device. Uses the speech model for transcripts."
            control={<Toggle label="Offline only" checked={s.connectivityMode === 'offline_only'} onChange={(on) => void setSetting('connectivityMode', on ? 'offline_only' : 'auto')} />}
          />
        </SettingsGroup>

        <section aria-labelledby="storage" className="space-y-3 rounded-lg bg-surface p-4 shadow-card">
          <h2 id="storage" className="text-lg">Storage</h2>
          {storage ? (
            <>
              <ProgressBar label="Used by Creative Notes" value={storage.usage} max={storage.quota || 1} valueText={`${bytesLabel(storage.usage)} of ${bytesLabel(storage.quota)}`} />
              {storage.quota - storage.usage < 200 * 1024 * 1024 && <Banner tone="warning">Less than 200 MB left. Long recordings may not save.</Banner>}
              {!storage.persisted && <Button variant="secondary" onClick={() => void requestPersistentStorage()}>Protect from automatic clean-up</Button>}
            </>
          ) : (
            <p className="text-sm text-muted">This browser doesn't report storage use.</p>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Remove the speech model?"
        body="Offline recordings will show a demo transcript until you download it again. Your meetings aren't affected."
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
