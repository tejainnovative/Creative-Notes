import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, BellRing, CalendarPlus, ChevronDown, ListTodo, PartyPopper, Plus, Trash2 } from 'lucide-react';
import { createTodo, deleteTask, groupTasks, listTasks, restoreTask, setTaskDone, taskIcs, updateTask, type Task } from '../data';
import { shareOrDownload } from '../data/files';
import { useNow } from '../app/useNow';
import { Badge, Banner, Button, Dialog, EmptyState, IconButton, Skeleton, TopBar, cx, useToast } from '../ui';
import { useDictation } from '../speech/useDictation';
import { DictationStatus, MicButton, appendPhrase } from './parts/MicButton';

type Filter = 'all' | 'mine' | 'meetings';

// ---- dates ----

const DAY = 86_400_000;
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function dueLabel(ms: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: Math.abs(diff) > 300 ? 'numeric' : undefined });
}

const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

function reminderLabel(ms: number, now = Date.now()) {
  return `${dueLabel(ms, now)}, ${timeLabel(ms)}`;
}

/** <input type="date"> value <-> local midnight */
const toDateInput = (ms?: number) => {
  if (ms === undefined) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fromDateInput = (v: string) => {
  if (!v) return undefined;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y!, m! - 1, d!).getTime();
};
/** <input type="datetime-local"> value <-> ms */
const toDateTimeInput = (ms?: number) => (ms === undefined ? '' : `${toDateInput(ms)}T${new Date(ms).toTimeString().slice(0, 5)}`);
const fromDateTimeInput = (v: string) => (v ? new Date(v).getTime() : undefined);

const tomorrowAt9 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
};

// ---- notifications ----

function notificationState(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** S16 Tasks: your to-dos and every meeting's action items, with due dates and reminders. */
export function Tasks() {
  const tasks = useLiveQuery(listTasks, []);
  const now = useNow(60_000);
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [text, setText] = useState('');
  const [due, setDue] = useState<'none' | 'today' | 'tomorrow'>('none');
  const [editing, setEditing] = useState<Task | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [perm, setPerm] = useState(notificationState);
  const inputId = useId();
  const [spoken, setSpoken] = useState(false);
  const dictation = useDictation((phrase) => {
    setSpoken(true);
    setText((t) => appendPhrase(t, phrase));
  });

  async function add() {
    const value = text.trim();
    if (!value) return;
    if (dictation.state !== 'idle') await dictation.stop();
    const today = startOfDay(Date.now());
    await createTodo({
      text: value,
      dueAt: due === 'today' ? today : due === 'tomorrow' ? today + DAY : undefined,
      source: spoken ? 'dictated' : 'typed',
    });
    setText('');
    setSpoken(false);
    toast({ tone: 'success', text: 'Task added' });
  }

  async function toggle(t: Task, done: boolean) {
    await setTaskDone(t, done);
    if (done) toast({ text: 'Done', action: { label: 'Undo', onClick: () => void setTaskDone(t, false) } });
  }

  const visible = (tasks ?? []).filter((t) => (filter === 'mine' ? t.kind === 'todo' : filter === 'meetings' ? t.kind === 'action' : true));
  const g = groupTasks(visible, now);
  const open = g.overdue.length + g.today.length + g.upcoming.length + g.someday.length;
  const anyReminders = (tasks ?? []).some((t) => t.remindAt && !t.done);

  return (
    <>
      <TopBar title="Tasks" />
      <div className="mx-auto max-w-(--cn-content-max) space-y-4 px-4 py-3 pb-10">
        <form
          className="space-y-2 rounded-lg bg-surface p-3 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label htmlFor={inputId} className="sr-only">New task</label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              value={text}
              maxLength={500}
              onChange={(e) => setText(e.target.value)}
              placeholder="Add a task, or tap the mic and say it"
              className="h-11 min-w-0 flex-1 rounded-md border border-border-input bg-surface px-3 text-base placeholder:text-muted"
            />
            <MicButton dictation={dictation} label="Dictate a task" />
            <Button type="submit" disabled={!text.trim()} icon={<Plus aria-hidden className="size-5" />}>Add</Button>
          </div>
          <div role="radiogroup" aria-label="Due" className="flex flex-wrap gap-2">
            {(['none', 'today', 'tomorrow'] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={due === d} onClick={() => setDue(d)}
                className={cx('h-8 rounded-pill border px-3 text-xs font-semibold', due === d ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted hover:text-fg')}>
                {d === 'none' ? 'No date' : d === 'today' ? 'Today' : 'Tomorrow'}
              </button>
            ))}
          </div>
          <DictationStatus dictation={dictation} />
        </form>

        {anyReminders && perm === 'default' && (
          <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={async () => setPerm(await Notification.requestPermission())}>Turn on</Button>}>
            Allow notifications so reminders can pop up while Creative Notes is open.
          </Banner>
        )}
        {anyReminders && (perm === 'denied' || perm === 'unsupported') && (
          <Banner tone="info">
            Notifications are off, so reminders show here when you open the app. For alerts when it's closed, use <strong>Add to calendar</strong> on a task.
          </Banner>
        )}

        <div role="radiogroup" aria-label="Show" className="flex gap-2">
          {(['all', 'mine', 'meetings'] as const).map((f) => (
            <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
              className={cx('h-9 rounded-pill border px-4 text-sm font-semibold', filter === f ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface text-muted hover:text-fg')}>
              {f === 'all' ? 'All' : f === 'mine' ? 'My to-dos' : 'From meetings'}
            </button>
          ))}
        </div>

        {tasks === undefined ? (
          <div className="rounded-lg bg-surface p-4 shadow-card"><Skeleton lines={5} label="Loading tasks" /></div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title={filter === 'meetings' ? 'No action items yet' : 'No tasks yet'}
            body={filter === 'meetings' ? "Follow-ups from your meetings' summaries show up here." : 'Add one above. Action items from your meetings appear here too.'}
          />
        ) : (
          <>
            {open === 0 && <EmptyState icon={PartyPopper} title="All done" body="Nothing open. Enjoy it." />}
            <TaskGroup title="Overdue" tasks={g.overdue} tone="danger" now={now} onToggle={toggle} onEdit={setEditing} />
            <TaskGroup title="Today" tasks={g.today} now={now} onToggle={toggle} onEdit={setEditing} />
            <TaskGroup title="Upcoming" tasks={g.upcoming} now={now} onToggle={toggle} onEdit={setEditing} />
            <TaskGroup title="No date" tasks={g.someday} now={now} onToggle={toggle} onEdit={setEditing} />
            {g.done.length > 0 && (
              <section aria-label="Done">
                <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}
                  className="flex h-11 items-center gap-2 px-1 text-sm font-semibold text-muted hover:text-fg">
                  <ChevronDown aria-hidden className={cx('size-4 transition-transform', showDone && 'rotate-180')} />
                  Done ({g.done.length})
                </button>
                {showDone && <TaskList tasks={g.done} now={now} onToggle={toggle} onEdit={setEditing} />}
              </section>
            )}
          </>
        )}
      </div>
      {editing && <TaskSheet task={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

interface GroupProps {
  title: string;
  tasks: Task[];
  tone?: 'danger';
  now: number;
  onToggle: (t: Task, done: boolean) => void;
  onEdit: (t: Task) => void;
}

function TaskGroup({ title, tasks, tone, ...rest }: GroupProps) {
  if (!tasks.length) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2 className={cx('px-1 text-sm font-semibold', tone === 'danger' ? 'text-danger' : 'text-muted')}>
        {title} <span className="tabular font-normal">({tasks.length})</span>
      </h2>
      <TaskList tasks={tasks} {...rest} />
    </section>
  );
}

function TaskList({ tasks, now, onToggle, onEdit }: Omit<GroupProps, 'title' | 'tone'>) {
  return (
    <ul className="overflow-hidden rounded-lg bg-surface shadow-card">
      {tasks.map((t) => <TaskRow key={t.key} task={t} now={now} onToggle={onToggle} onEdit={onEdit} />)}
    </ul>
  );
}

function TaskRow({ task: t, now, onToggle, onEdit }: { task: Task; now: number; onToggle: GroupProps['onToggle']; onEdit: GroupProps['onEdit'] }) {
  const id = useId();
  const overdue = !t.done && t.dueAt !== undefined && t.dueAt < startOfDay(now);
  return (
    <li className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <input id={id} type="checkbox" checked={t.done} onChange={(e) => onToggle(t, e.target.checked)} className="mt-1 size-5 shrink-0 accent-(--cn-accent)" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cx('block break-words', t.done && 'text-muted line-through')}>
          {t.owner && <span className="font-semibold">{t.owner}: </span>}
          {t.text}
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {t.dueAt !== undefined ? (
            <span className={cx(overdue && 'font-semibold text-danger')}>{overdue ? 'Was due' : 'Due'} {dueLabel(t.dueAt, now).toLowerCase()}</span>
          ) : t.dueText ? (
            <span>Said: by {t.dueText}</span>
          ) : null}
          {t.remindAt !== undefined && !t.done && (
            <span className="inline-flex items-center gap-1"><Bell aria-hidden className="size-3.5" /><span className="sr-only">Reminder</span>{reminderLabel(t.remindAt, now)}</span>
          )}
          {t.meetingId && (
            <Link to={`/m/${t.meetingId}?tab=summary`} className="truncate text-accent hover:underline">From: {t.meetingTitle ?? 'a meeting'}</Link>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => onEdit(t)} aria-label={`Edit ${t.text}`}>Edit</Button>
    </li>
  );
}

/** Edit one task: text, due date, reminder, calendar, delete. */
function TaskSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(task.text);
  const [dueAt, setDueAt] = useState<number | undefined>(task.dueAt);
  const [remindAt, setRemindAt] = useState<number | undefined>(task.remindAt);
  const [busy, setBusy] = useState(false);
  const ids = { text: useId(), due: useId(), remind: useId() };
  const dictation = useDictation((phrase) => setText((t) => appendPhrase(t, phrase)));
  const remindInPast = remindAt !== undefined && remindAt < Date.now() - 60_000;

  async function save() {
    setBusy(true);
    if (dictation.state !== 'idle') await dictation.stop();
    await updateTask(task, { text, dueAt: dueAt ?? null, remindAt: remindAt ?? null });
    toast({ tone: 'success', text: remindAt ? `Saved. Reminder ${reminderLabel(remindAt).toLowerCase()}` : 'Saved' });
    onClose();
  }

  async function remove() {
    const saved = await deleteTask(task);
    onClose();
    if (saved) toast({ text: 'Task deleted', action: { label: 'Undo', onClick: () => void restoreTask(saved) } });
  }

  async function addToCalendar() {
    const file = taskIcs({ ...task, text, dueAt, remindAt });
    const r = await shareOrDownload(file);
    if (r !== 'cancelled') toast({ tone: 'success', text: 'Calendar event created. Open it to add it to your calendar.' });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={task.kind === 'action' ? 'Action item' : 'Task'}
      actions={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={!text.trim()} onClick={() => void save()}>Save</Button>
      </>}
    >
      <div className="space-y-4 text-fg">
        {task.meetingTitle && <Badge tone="accent">From {task.meetingTitle}</Badge>}
        <div>
          <label htmlFor={ids.text} className="mb-1 block text-sm font-semibold">What needs doing</label>
          <div className="flex items-start gap-2">
            <textarea id={ids.text} value={text} rows={2} maxLength={500} onChange={(e) => setText(e.target.value)}
              className="min-h-11 w-full resize-none rounded-md border border-border-input bg-surface px-3 py-2 text-base" />
            <MicButton dictation={dictation} label="Dictate" />
          </div>
          <div className="mt-1"><DictationStatus dictation={dictation} /></div>
        </div>

        <div>
          <label htmlFor={ids.due} className="mb-1 block text-sm font-semibold">Due</label>
          <div className="flex gap-2">
            <input id={ids.due} type="date" value={toDateInput(dueAt)} onChange={(e) => setDueAt(fromDateInput(e.target.value))}
              className="h-11 min-w-0 flex-1 rounded-md border border-border-input bg-surface px-3 text-base" />
            {dueAt !== undefined && <Button variant="ghost" onClick={() => setDueAt(undefined)}>Clear</Button>}
          </div>
          {task.dueText && dueAt === undefined && <p className="mt-1 text-xs text-muted">Said in the meeting: by {task.dueText}</p>}
        </div>

        <div>
          <label htmlFor={ids.remind} className="mb-1 flex items-center gap-1 text-sm font-semibold"><BellRing aria-hidden className="size-4" /> Remind me</label>
          <div className="flex gap-2">
            <input id={ids.remind} type="datetime-local" value={toDateTimeInput(remindAt)} onChange={(e) => setRemindAt(fromDateTimeInput(e.target.value))}
              className="h-11 min-w-0 flex-1 rounded-md border border-border-input bg-surface px-3 text-base" />
            {remindAt !== undefined && <Button variant="ghost" onClick={() => setRemindAt(undefined)}>Clear</Button>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRemindAt(Date.now() + 60 * 60_000)}>In 1 hour</Button>
            <Button size="sm" variant="secondary" onClick={() => setRemindAt(tomorrowAt9())}>Tomorrow 9 am</Button>
          </div>
          {remindInPast && <p className="mt-1 text-xs text-warning">That time has passed; the reminder will show straight away.</p>}
          <p className="mt-1 text-xs text-muted">Reminders pop up while Creative Notes is open. For an alert when it's closed, add it to your calendar.</p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button variant="secondary" icon={<CalendarPlus aria-hidden className="size-4" />} onClick={() => void addToCalendar()}>Add to calendar</Button>
          <IconButton label="Delete task" onClick={() => void remove()} className="text-danger"><Trash2 aria-hidden className="size-5" /></IconButton>
        </div>
      </div>
    </Dialog>
  );
}
