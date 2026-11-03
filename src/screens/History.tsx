import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { History as HistoryIcon, NotebookPen, SearchX, Trash2 } from 'lucide-react';
import type { Meeting, Note } from '../db/schema';
import { deleteMeeting, deleteNote, listMeetings, listNotes, meetingTitle, restoreMeeting, restoreNote } from '../data';
import { durationLabel, groupByDay, timeLabel } from '../app/format';
import { Button, ConfirmDialog, DayHeader, EmptyState, IconButton, MeetingRow, SearchField, Skeleton, TopBar, cx, useToast } from '../ui';
import { MeetingStatus } from './parts/MeetingStatus';

type Filter = 'all' | 'meetings' | 'notes';
type Item = { kind: 'meeting'; at: number; m: Meeting } | { kind: 'note'; at: number; n: Note };

/** S06 History: every meeting and quick note, newest first, grouped by day and searchable. */
export function History() {
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>('all');
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const toast = useToast();

  const items = useLiveQuery(async (): Promise<Item[]> => {
    const [ms, ns] = await Promise.all([
      filter === 'notes' ? [] : listMeetings({ query: q }),
      filter === 'meetings' ? [] : listNotes({ query: q }),
    ]);
    return [
      ...ms.map((m): Item => ({ kind: 'meeting', at: m.startedAt, m })),
      ...ns.map((n): Item => ({ kind: 'note', at: n.createdAt, n })),
    ].sort((a, b) => b.at - a.at);
  }, [q, filter]);

  async function confirmDelete() {
    const it = pendingDelete;
    setPendingDelete(null);
    if (!it) return;
    if (it.kind === 'meeting') {
      const snap = await deleteMeeting(it.m.id);
      if (snap) toast({ text: 'Meeting deleted', action: { label: 'Undo', onClick: () => void restoreMeeting(snap) } });
    } else {
      const note = await deleteNote(it.n.id);
      if (note) toast({ text: 'Note deleted', action: { label: 'Undo', onClick: () => void restoreNote(note) } });
    }
  }

  const groups = items ? groupByDay(items, (i) => i.at) : [];
  const searching = q.trim().length > 0;

  return (
    <>
      <TopBar title="History" />
      <div className="mx-auto max-w-(--cn-content-max) space-y-3 px-4 py-3">
        <SearchField value={query} onChange={setQuery} />
        <div role="radiogroup" aria-label="Show" className="flex gap-2">
          {(['all', 'meetings', 'notes'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cx('h-9 rounded-pill border px-4 text-sm font-semibold capitalize', filter === f ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:text-fg')}
            >
              {f}
            </button>
          ))}
        </div>
        {searching && items && <p role="status" className="text-sm text-muted">{items.length} result{items.length === 1 ? '' : 's'}</p>}
      </div>

      <div className="mx-auto max-w-(--cn-content-max) px-4 pb-8">
        {items === undefined ? (
          <div className="rounded-lg bg-surface p-4 shadow-card"><Skeleton lines={6} label="Loading history" /></div>
        ) : items.length === 0 ? (
          searching ? (
            <EmptyState icon={SearchX} title="Nothing matches" body={`No meetings or notes mention "${q.trim()}".`} action={<Button variant="secondary" onClick={() => setQuery('')}>Clear search</Button>} />
          ) : (
            <EmptyState icon={HistoryIcon} title={filter === 'notes' ? 'No quick notes yet' : 'Nothing here yet'} body="Recordings and quick notes you make will be listed here, newest first."
              action={<Link to="/" className="inline-flex h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent/90">Start a recording</Link>} />
          )
        ) : (
          groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <DayHeader>{g.label}</DayHeader>
              <div className="overflow-hidden rounded-lg bg-surface shadow-card">
                {g.items.map((it) =>
                  it.kind === 'meeting' ? (
                    <MeetingRow
                      key={it.m.id}
                      to={`/m/${it.m.id}`}
                      title={meetingTitle(it.m)}
                      meta={[durationLabel(it.m.durationS), it.m.speakerCount ? `${it.m.speakerCount} speakers` : ''].filter(Boolean).join(' · ') || 'Meeting'}
                      trailing={timeLabel(it.m.startedAt)}
                      status={<MeetingStatus meeting={it.m} />}
                      menu={<RowMenu label={`Delete ${meetingTitle(it.m)}`} onDelete={() => setPendingDelete(it)} />}
                    />
                  ) : (
                    <MeetingRow
                      key={it.n.id}
                      to={`/quick?id=${it.n.id}`}
                      title={it.n.text ?? ''}
                      meta="Quick note"
                      trailing={timeLabel(it.n.createdAt)}
                      status={<NotebookPen aria-hidden className="size-4 text-muted" />}
                      menu={<RowMenu label="Delete note" onDelete={() => setPendingDelete(it)} />}
                    />
                  ),
                )}
              </div>
            </section>
          ))
        )}
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete?.kind === 'note' ? 'Delete this note?' : 'Delete this meeting?'}
        body={pendingDelete?.kind === 'note' ? 'The note will be removed from this device.' : 'Its transcript, summary and notes will be removed from this device.'}
        confirmLabel="Delete"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

/** One action for now, so the "menu" is a direct delete button with a clear label. */
function RowMenu({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <IconButton label={label} onClick={onDelete} className="text-muted hover:text-danger">
      <Trash2 aria-hidden className="size-5" />
    </IconButton>
  );
}
