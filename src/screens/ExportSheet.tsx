import { useState } from 'react';
import { CalendarPlus, FileText, FileType } from 'lucide-react';
import type { ExportFormat } from '../data/export';
import type { MeetingDetail } from '../data';
import { Button, Dialog, useToast } from '../ui';

const options: { format: ExportFormat; label: string; hint: string; Icon: typeof FileText }[] = [
  { format: 'pdf', label: 'PDF', hint: 'Summary, actions and transcript', Icon: FileType },
  { format: 'md', label: 'Markdown', hint: 'Plain text for notes apps', Icon: FileText },
  { format: 'ics', label: 'Calendar events', hint: 'One event per action item', Icon: CalendarPlus },
];

/** S09 Export / share. Files are built on the device; nothing is uploaded. */
export function ExportSheet({ open, onClose, detail }: { open: boolean; onClose: () => void; detail: MeetingDetail }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const toast = useToast();

  async function run(format: ExportFormat) {
    setBusy(format);
    try {
      // pdf-lib is large, so the exporters load on first use (and are precached for offline).
      const { buildExport, shareOrDownload } = await import('../data/export');
      const file = await buildExport(detail, format);
      const result = await shareOrDownload(file);
      if (result !== 'cancelled') {
        toast({ tone: 'success', text: result === 'shared' ? 'Shared' : `Saved ${file.name}` });
        onClose();
      }
    } catch {
      toast({ tone: 'error', text: "Couldn't create the file. Try another format." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Export meeting" actions={<Button variant="secondary" onClick={onClose}>Cancel</Button>}>
      <p>Files are plain text, so anyone who opens them can read them.</p>
      <ul className="mt-3 grid gap-2">
        {options.map(({ format, label, hint, Icon }) => {
          const disabled = format === 'ics' && detail.actions.length === 0;
          return (
            <li key={format}>
              <button
                type="button"
                disabled={disabled || busy !== null}
                aria-busy={busy === format || undefined}
                onClick={() => void run(format)}
                className="flex min-h-14 w-full items-center gap-3 rounded-md border border-border px-4 py-2 text-left text-fg hover:bg-surface-sunken disabled:opacity-50"
              >
                <Icon aria-hidden className="size-5 shrink-0 text-accent" />
                <span>
                  <span className="block font-semibold">{label}</span>
                  <span className="block text-sm text-muted">{disabled ? 'No action items in this meeting' : hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
