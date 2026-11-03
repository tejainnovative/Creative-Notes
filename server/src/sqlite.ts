// Local stand-in for D1, on Node's built-in SQLite. Same SQL, same migrations.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Db, Param } from './db.ts';

export function sqliteDb(path: string): Db & { close(): void } {
  const db = new DatabaseSync(path);
  db.exec('pragma foreign_keys = on; pragma journal_mode = wal;');
  const args = (p: Param[]) => p as never[];
  return {
    first: async (sql, ...p) => (db.prepare(sql).get(...args(p)) as never) ?? null,
    all: async (sql, ...p) => db.prepare(sql).all(...args(p)) as never,
    run: async (sql, ...p) => ({ changes: Number(db.prepare(sql).run(...args(p)).changes) }),
    close: () => db.close(),
  };
}

/** Applies server/migrations/*.sql in order, once each. Same files `wrangler d1 migrations apply` uses. */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.run('create table if not exists _migrations (name text primary key, applied_at integer not null)');
  const applied = new Set((await db.all<{ name: string }>('select name from _migrations')).map((r) => r.name));
  const done: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const stmt of sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.run(stmt);
    await db.run('insert into _migrations (name, applied_at) values (?, ?)', file, Date.now());
    done.push(file);
  }
  return done;
}
