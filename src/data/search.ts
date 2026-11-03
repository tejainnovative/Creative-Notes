import MiniSearch from 'minisearch';
import { db } from '../db/schema';

interface Doc {
  id: string; // 'm:<meetingId>' or 'n:<noteId>'
  kind: 'meeting' | 'note';
  title: string;
  body: string;
}

/**
 * In-memory full-text index over meetings and notes. Built on first use and kept up to date
 * by the data layer. It never touches disk, so it never needs encrypting.
 */
class SearchIndex {
  private ms = new MiniSearch<Doc>({
    fields: ['title', 'body'],
    storeFields: ['kind'],
    searchOptions: { boost: { title: 3 }, prefix: true, fuzzy: 0.15, combineWith: 'AND' },
  });
  private ready: Promise<void> | null = null;

  private async meetingDoc(id: string): Promise<Doc | undefined> {
    const m = await db.meetings.get(id);
    if (!m) return undefined;
    const [segs, summary, notes] = await Promise.all([
      db.segments.where('meetingId').equals(id).toArray(),
      db.summaries.get(id),
      db.manualNotes.where('meetingId').equals(id).toArray(),
    ]);
    const body = [summary?.overview, ...(summary?.decisions ?? []), ...segs.map((s) => s.text), ...notes.map((n) => n.text)].filter(Boolean).join('\n');
    return { id: `m:${id}`, kind: 'meeting', title: m.title ?? '', body };
  }

  private build(): Promise<void> {
    this.ready ??= (async () => {
      const [meetings, notes] = await Promise.all([db.meetings.toArray(), db.notes.toArray()]);
      const docs = (await Promise.all(meetings.map((m) => this.meetingDoc(m.id)))).filter((d): d is Doc => !!d);
      this.ms.addAll([...docs, ...notes.map((n): Doc => ({ id: `n:${n.id}`, kind: 'note', title: '', body: n.text ?? '' }))]);
    })();
    return this.ready;
  }

  async meetingIds(query: string): Promise<string[]> {
    await this.build();
    return this.ms.search(query).filter((r) => r.kind === 'meeting').map((r) => String(r.id).slice(2));
  }

  async noteIds(query: string): Promise<string[]> {
    await this.build();
    return this.ms.search(query).filter((r) => r.kind === 'note').map((r) => String(r.id).slice(2));
  }

  async refreshMeeting(id: string): Promise<void> {
    if (!this.ready) return;
    await this.ready;
    const doc = await this.meetingDoc(id);
    if (this.ms.has(`m:${id}`)) this.ms.discard(`m:${id}`);
    if (doc) this.ms.add(doc);
  }

  removeMeeting(id: string) {
    if (this.ms.has(`m:${id}`)) this.ms.discard(`m:${id}`);
  }

  upsertNote(id: string, text: string) {
    if (!this.ready) return;
    if (this.ms.has(`n:${id}`)) this.ms.discard(`n:${id}`);
    this.ms.add({ id: `n:${id}`, kind: 'note', title: '', body: text });
  }

  /** Drops the index; the next search rebuilds it from the database (after a restore). */
  reset() {
    this.ms.removeAll();
    this.ready = null;
  }

  removeNote(id: string) {
    if (this.ms.has(`n:${id}`)) this.ms.discard(`n:${id}`);
  }
}

export const searchIndex = new SearchIndex();
