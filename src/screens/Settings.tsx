import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteEverything, loadSampleData, setSetting, storageEstimate, useSettings, type ThemePref } from '../data';
import { bytesLabel } from '../app/format';
import { getAi } from '../ai/client';
import { ServerSettings, forgetServer } from './parts/ServerSettings';
import { BackupSettings } from './parts/BackupSettings';
import { Avatar, Badge, ConfirmDialog, Dialog, Button, SettingsGroup, SettingsRow, Skeleton, Toggle, TopBar, useToast } from '../ui';

const LANGUAGES: [string, string][] = [
  ['auto', 'Detect automatically'],
  ['en-AU', 'English (Australia)'],
  ['en-GB', 'English (UK)'],
  ['en-US', 'English (US)'],
  ['es-ES', 'Spanish'],
  ['pt-BR', 'Portuguese'],
  ['fr-FR', 'French'],
  ['de-DE', 'German'],
  ['hi-IN', 'Hindi'],
  ['zh-CN', 'Chinese (Mandarin)'],
];
const THEMES: [ThemePref, string][] = [['system', 'Match device'], ['light', 'Light'], ['dark', 'Dark']];

function ChoiceDialog<T extends string>({ open, title, options, value, onPick, onClose }: { open: boolean; title: string; options: [T, string][]; value: T; onPick: (v: T) => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={title} actions={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <fieldset className="mt-2 grid gap-1">
        <legend className="sr-only">{title}</legend>
        {options.map(([v, label]) => (
          <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-fg hover:bg-surface-sunken">
            <input type="radio" name={title} checked={value === v} onChange={() => { onPick(v); onClose(); }} className="size-5 accent-(--cn-accent)" />
            {label}
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

/** S08 Settings: name, language, connectivity, theme, install, storage, and wiping the device. */
export function Settings() {
  const s = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const storage = useLiveQuery(storageEstimate, []);
  const [open, setOpen] = useState<'name' | 'lang' | 'theme' | 'wipe' | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [busy, setBusy] = useState(false);

  if (!s) return (<><TopBar title="Settings" /><div className="p-4"><Skeleton lines={8} /></div></>);

  const name = s.displayName.trim();

  return (
    <>
      <TopBar title="Settings" />
      <div className="mx-auto max-w-(--cn-content-max) space-y-6 px-4 py-4 pb-10">
        <div className="flex items-center gap-3 rounded-lg bg-surface p-4 shadow-card">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{name || 'No name set'}</p>
            <Badge tone="success">Stored on this device</Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setNameDraft(name); setOpen('name'); }}>Edit</Button>
        </div>

        <SettingsGroup title="Recording">
          <SettingsRow label="Language" value={LANGUAGES.find(([v]) => v === s.language)?.[1] ?? s.language} onClick={() => setOpen('lang')} />
          <SettingsRow
            label="Offline only"
            description="Never send audio or text off this device. Summaries and answers wait until you turn this off."
            control={<Toggle label="Offline only" checked={s.connectivityMode === 'offline_only'} onChange={(on) => void setSetting('connectivityMode', on ? 'offline_only' : 'auto')} />}
          />
          <SettingsRow label="Offline transcription" value={s.offlineModel === 'ready' ? 'Ready' : 'Not set up'} onClick={() => navigate('/settings/offline')} />
        </SettingsGroup>

        <SettingsGroup title="Sync">
          <SettingsRow label="Sync between devices" value={s.syncKey ? 'On' : 'Off'} description="Tasks, notes and meetings on your phone and computer" onClick={() => navigate('/settings/sync')} />
        </SettingsGroup>

        <ServerSettings />

        <SettingsGroup title="Appearance">
          <SettingsRow label="Theme" value={THEMES.find(([v]) => v === s.theme)?.[1]} onClick={() => setOpen('theme')} />
        </SettingsGroup>

        <BackupSettings />

        <SettingsGroup title="This device">
          <SettingsRow label="Install the app" description="Home screen, desktop window and the Siri shortcut" onClick={() => navigate('/install')} />
          <SettingsRow
            label="Storage used"
            value={storage ? bytesLabel(storage.usage) : '…'}
            description={storage ? (storage.persisted ? 'Protected from automatic clean-up' : 'The browser may clear this if space runs low. Install the app to protect it.') : undefined}
          />
          <SettingsRow label="Load sample meetings" description="Adds four example meetings to explore" onClick={async () => { await loadSampleData(); toast({ tone: 'success', text: 'Sample meetings added' }); }} />
          <SettingsRow label="Delete everything" danger onClick={() => setOpen('wipe')} />
        </SettingsGroup>

        <SettingsGroup title="About">
          <SettingsRow label="Summaries by" value={getAi().name} description={getAi().name === 'Claude' ? 'Claude, through your own server and API key.' : 'A simple on-device preview. Connect your server above to use Claude.'} />
          <SettingsRow label="Version" value={__APP_VERSION__} />
        </SettingsGroup>
      </div>

      <Dialog
        open={open === 'name'}
        onClose={() => setOpen(null)}
        title="Your name"
        actions={<>
          <Button variant="secondary" onClick={() => setOpen(null)}>Cancel</Button>
          <Button onClick={async () => { await setSetting('displayName', nameDraft.trim().slice(0, 40)); setOpen(null); }}>Save</Button>
        </>}
      >
        <label htmlFor="name-edit" className="mb-1 block text-sm">Shown on Home. Stays on this device.</label>
        <input id="name-edit" value={nameDraft} maxLength={40} onChange={(e) => setNameDraft(e.target.value)} className="h-11 w-full rounded-md border border-border-input bg-surface px-3 text-base text-fg" />
      </Dialog>
      <ChoiceDialog open={open === 'lang'} title="Transcription language" options={LANGUAGES} value={s.language} onPick={(v) => void setSetting('language', v)} onClose={() => setOpen(null)} />
      <ChoiceDialog open={open === 'theme'} title="Theme" options={THEMES} value={s.theme} onPick={(v) => void setSetting('theme', v)} onClose={() => setOpen(null)} />
      <ConfirmDialog
        open={open === 'wipe'}
        title="Delete everything?"
        body="Every meeting, note and setting on this device will be erased. There's no copy anywhere else, so this can't be undone."
        confirmLabel={busy ? 'Deleting…' : 'Delete everything'}
        onCancel={() => setOpen(null)}
        onConfirm={async () => {
          setBusy(true);
          await forgetServer();
          await deleteEverything();
          setBusy(false);
          setOpen(null);
          navigate('/welcome', { replace: true });
        }}
      />
    </>
  );
}
