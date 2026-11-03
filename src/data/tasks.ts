import { db, type ActionItem, type Todo } from '../db/schema';
import { uuidv7 } from '../db/ids';
import { meetingTitle } from './meetings';

export const TASK_MAX = 500;

/** One row in the Tasks list: either a to-do you wrote or an action item from a meeting. */
export interface Task {
  /** Unique across both kinds, for React keys and URLs. */
  key: string;
  kind: 'todo' | 'action';
  id: string;
  text: string;
  owner?: string;
  done: boolean;
  dueAt?: number;
  /** A meeting's own words for the deadline ("by Friday") when no exact date was parsed. */
  dueText?: string;
  remindAt?: number;
  remindedAt?: number;
  meetingId?: string;
  meetingTitle?: string;
  createdAt: number;
  completedAt?: number;
}

function fromTodo(t: Todo): Task {
  return { key: `t:${t.id}`, kind: 'todo', id: t.id, text: t.text ?? '', done: t.done === 1, dueAt: t.dueAt, remindAt: t.remindAt, remindedAt: t.remindedAt, createdAt: t.createdAt, completedAt: t.completedAt };
}

export async function listTasks(): Promise<Task[]> {
  const [todos, actions, meetings] = await Promise.all([db.todos.toArray(), db.actionItems.toArray(), db.meetings.toArray()]);
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const fromAction = (a: ActionItem): Task => {
    const m = byId.get(a.meetingId);
    return {
      key: `a:${a.id}`,
      kind: 'action',
      id: a.id,
      text: a.text ?? '',
      owner: a.owner,
      done: a.done === 1,
      dueAt: a.dueAt,
      dueText: a.dueText,
      remindAt: a.remindAt,
      remindedAt: a.remindedAt,
      meetingId: a.meetingId,
      meetingTitle: m ? meetingTitle(m) : undefined,
      createdAt: m?.startedAt ?? 0,
      completedAt: a.completedAt,
    };
  };
  return [...todos.map(fromTodo), ...actions.map(fromAction)];
}

export async function createTodo(input: { text: string; dueAt?: number; remindAt?: number; source?: Todo['source']; noteId?: string }): Promise<Todo> {
  const now = Date.now();
  const todo: Todo = {
    id: uuidv7(now),
    text: input.text.trim().slice(0, TASK_MAX),
    done: 0,
    dueAt: input.dueAt,
    remindAt: input.remindAt,
    source: input.source ?? 'typed',
    noteId: input.noteId,
    createdAt: now,
    updatedAt: now,
  };
  await db.todos.add(todo);
  return todo;
}

type Patch = { text?: string; dueAt?: number | null; remindAt?: number | null };

/** Edits either kind. A changed reminder time is armed again (remindedAt cleared). */
export async function updateTask(task: Pick<Task, 'kind' | 'id'>, patch: Patch): Promise<void> {
  const changes: Record<string, unknown> = {};
  if (patch.text !== undefined) changes.text = patch.text.trim().slice(0, TASK_MAX);
  if (patch.dueAt !== undefined) changes.dueAt = patch.dueAt ?? undefined;
  if (patch.remindAt !== undefined) {
    changes.remindAt = patch.remindAt ?? undefined;
    changes.remindedAt = undefined;
  }
  if (task.kind === 'todo') await db.todos.update(task.id, { ...changes, updatedAt: Date.now() });
  else await db.actionItems.update(task.id, changes);
}

export async function setTaskDone(task: Pick<Task, 'kind' | 'id'>, done: boolean): Promise<void> {
  const changes = { done: (done ? 1 : 0) as 0 | 1, completedAt: done ? Date.now() : undefined };
  if (task.kind === 'todo') await db.todos.update(task.id, { ...changes, updatedAt: Date.now() });
  else await db.actionItems.update(task.id, changes);
}

/** Deletes and returns the row so the caller can offer Undo. */
export async function deleteTask(task: Pick<Task, 'kind' | 'id'>): Promise<{ kind: Task['kind']; row: Todo | ActionItem } | undefined> {
  if (task.kind === 'todo') {
    const row = await db.todos.get(task.id);
    await db.todos.delete(task.id);
    return row ? { kind: 'todo', row } : undefined;
  }
  const row = await db.actionItems.get(task.id);
  await db.actionItems.delete(task.id);
  return row ? { kind: 'action', row } : undefined;
}

export async function restoreTask(saved: { kind: Task['kind']; row: Todo | ActionItem }): Promise<void> {
  if (saved.kind === 'todo') await db.todos.put(saved.row as Todo);
  else await db.actionItems.put(saved.row as ActionItem);
}

/** Open tasks whose reminder time has passed and that haven't been shown yet. */
export async function dueReminders(now = Date.now()): Promise<Task[]> {
  const [todos, actions] = await Promise.all([
    db.todos.where('remindAt').belowOrEqual(now).toArray(),
    db.actionItems.where('remindAt').belowOrEqual(now).toArray(),
  ]);
  const all = await listTasks();
  const ids = new Set([...todos.map((t) => `t:${t.id}`), ...actions.map((a) => `a:${a.id}`)]);
  return all.filter((t) => ids.has(t.key) && !t.done && !t.remindedAt);
}

export async function markReminded(task: Pick<Task, 'kind' | 'id'>): Promise<void> {
  const changes = { remindedAt: Date.now() };
  if (task.kind === 'todo') await db.todos.update(task.id, changes);
  else await db.actionItems.update(task.id, changes);
}

// ---- grouping ----

export interface TaskGroups {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  someday: Task[];
  done: Task[];
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function groupTasks(tasks: Task[], now = Date.now()): TaskGroups {
  const today = startOfDay(now);
  const tomorrow = today + 86_400_000;
  const g: TaskGroups = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const t of tasks) {
    if (t.done) g.done.push(t);
    else if (t.dueAt === undefined) g.someday.push(t);
    else if (t.dueAt < today) g.overdue.push(t);
    else if (t.dueAt < tomorrow) g.today.push(t);
    else g.upcoming.push(t);
  }
  const byDue = (a: Task, b: Task) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.createdAt - b.createdAt;
  g.overdue.sort(byDue);
  g.today.sort(byDue);
  g.upcoming.sort(byDue);
  g.someday.sort((a, b) => b.createdAt - a.createdAt);
  g.done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return g;
}

// ---- calendar file with an alarm: the reliable way to be reminded with the app closed ----

const icsDate = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * One calendar event per task. It starts at the reminder time (or the due time, or 9 am on the
 * due day) and carries an alarm at the start, so the phone's calendar alerts you.
 */
export function taskIcs(task: Task): File {
  let start = task.remindAt ?? task.dueAt;
  if (start === undefined) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    start = d.getTime();
  } else if (task.remindAt === undefined) {
    const d = new Date(start);
    if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(9);
    start = d.getTime();
  }
  const summary = `${task.owner ? `${task.owner}: ` : ''}${task.text}`;
  const desc = task.meetingTitle ? `From the meeting "${task.meetingTitle}" in Creative Notes.` : 'From Creative Notes.';
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Creative Notes//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${task.key.replace(':', '-')}@creative-notes`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(start + 15 * 60_000)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(desc)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsEscape(summary)}`,
    'TRIGGER:PT0M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  const name = task.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
  return new File([body], `${name}.ics`, { type: 'text/calendar' });
}
