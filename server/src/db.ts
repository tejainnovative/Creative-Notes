// The smallest database surface the server needs. D1 in production, node:sqlite locally,
// so the same queries run in both. Every query is parameterised.

export type Param = string | number | null | Uint8Array;

export interface Db {
  first<T>(sql: string, ...params: Param[]): Promise<T | null>;
  all<T>(sql: string, ...params: Param[]): Promise<T[]>;
  run(sql: string, ...params: Param[]): Promise<{ changes: number }>;
}

interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
      run(): Promise<{ meta: { changes: number } }>;
    };
  };
}

export function d1Db(d1: D1Like): Db {
  return {
    first: (sql, ...p) => d1.prepare(sql).bind(...p).first(),
    all: async (sql, ...p) => (await d1.prepare(sql).bind(...p).all()).results as never,
    run: async (sql, ...p) => ({ changes: (await d1.prepare(sql).bind(...p).run()).meta.changes }),
  };
}
