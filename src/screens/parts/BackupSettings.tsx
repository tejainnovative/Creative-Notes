import { useId, useState } from 'react';
import { useSettings } from '../../data';
import { BackupError, MIN_PASSPHRASE, createBackup, openBackup, restoreBackup, type OpenedBackup } from '../../data/backup';
import { shareOrDownload } from '../../data/files';
import { Button, Dialog, SettingsGroup, SettingsRow, useToast } from '../../ui';

function lastBackupLabel(ms: number): string {
  if (!ms) return 'Never backed up';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 1) return 'Last backup: today';
  if (days === 1) return 'Last backup: yesterday';
  return `Last backup: ${days} days ago`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = useId();
  return (
    <div className="mt-3">
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-fg">{label}</label>
      <input id={id} aria-describedby={hint ? hintId : undefined} className="h-11 w-full rounded-md border border-border-input bg-surface px-3 text-base text-fg file:mr-3 file:rounded-sm file:border-0 file:bg-surface-sunken file:px-3 file:py-1.5 file:text-sm file:text-fg" {...props} />
      {hint && <p id={hintId} className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** S08 "Backup" group: encrypted backup file and restore (F08). */
export function BackupSettings() {
  const s = useSettings();
  const toast = useToast();
  const [open, setOpen] = useState<'backup' | 'restore' | null>(null);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [opened, setOpened] = useState<OpenedBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    setOpen(null);
    setPass('');
    setPass2('');
    setFile(null);
    setOpened(null);
    setError('');
    setBusy(false);
  }

  async function backUp() {
    setBusy(true);
    try {
      const out = await createBackup(pass);
      const result = await shareOrDownload(out);
      if (result !== 'cancelled') toast({ tone: 'success', text: result === 'shared' ? 'Backup shared' : `Saved ${out.name}` });
      close();
    } catch {
      setError("Couldn't create the backup. Try again.");
      setBusy(false);
    }
  }

  async function openFile() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setOpened(await openBackup(file, pass));
    } catch (err) {
      setError(err instanceof BackupError ? err.message : "Couldn't read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!opened) return;
    setBusy(true);
    try {
      const r = await restoreBackup(opened);
      toast({ tone: 'success', text: `Restored ${plural(r.meetings, 'meeting')} and ${plural(r.notes, 'note')}` });
      close();
    } catch {
      setError("Couldn't restore. Nothing was changed.");
      setBusy(false);
    }
  }

  const tooShort = pass.length < MIN_PASSPHRASE;
  const mismatch = pass2.length > 0 && pass !== pass2;

  return (
    <>
      <SettingsGroup title="Backup">
        <SettingsRow
          label="Back up to a file"
          description={`${lastBackupLabel(s?.lastBackupAt ?? 0)}. Your notes only live on this device, so keep a copy somewhere safe.`}
          onClick={() => setOpen('backup')}
        />
        <SettingsRow label="Restore from a file" description="Adds what's missing; never deletes anything here" onClick={() => setOpen('restore')} />
      </SettingsGroup>

      <Dialog
        open={open === 'backup'}
        onClose={close}
        title="Back up to a file"
        actions={<>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button loading={busy} disabled={tooShort || pass !== pass2} onClick={() => void backUp()}>Create backup</Button>
        </>}
      >
        <p>Everything you've recorded and written goes into one encrypted file. Choose a passphrase to lock it.</p>
        <Field label="Passphrase" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)}
          hint={`At least ${MIN_PASSPHRASE} characters. If you forget it, the backup can't be opened: there's no reset.`} />
        <Field label="Passphrase again" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
        {mismatch && <p className="mt-2 text-sm text-danger">The passphrases don't match.</p>}
        {error && open === 'backup' && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </Dialog>

      <Dialog
        open={open === 'restore'}
        onClose={close}
        title="Restore from a file"
        actions={
          opened ? (
            <>
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button loading={busy} disabled={opened.newCounts.total === 0} onClick={() => void restore()}>Restore</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={close}>Cancel</Button>
              <Button loading={busy} disabled={!file || !pass} onClick={() => void openFile()}>Open backup</Button>
            </>
          )
        }
      >
        {opened ? (
          <div className="space-y-2" aria-live="polite">
            <p>
              Backup from {new Date(opened.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}:{' '}
              {plural(opened.counts.meetings, 'meeting')}, {plural(opened.counts.notes, 'note')}.
            </p>
            <p className="font-semibold text-fg">
              {opened.newCounts.total === 0
                ? 'Nothing new to add: everything in this backup is already on this device.'
                : `Adds ${plural(opened.newCounts.meetings, 'meeting')} and ${plural(opened.newCounts.notes, 'note')} to this device. Nothing here is deleted.`}
            </p>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </div>
        ) : (
          <>
            <p>Pick a Creative Notes backup and enter its passphrase.</p>
            <Field label="Backup file" type="file" accept=".cnbackup,application/json" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
            <Field label="Passphrase" type="password" autoComplete="current-password" value={pass} onChange={(e) => { setPass(e.target.value); setError(''); }} />
            {error && open === 'restore' && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          </>
        )}
      </Dialog>
    </>
  );
}
