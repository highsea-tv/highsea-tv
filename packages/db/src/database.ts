// SPDX-License-Identifier: AGPL-3.0-only
import { createRequire } from 'node:module'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import * as schema from './schema/index.ts'

export type Schema = typeof schema
export type Db = BaseSQLiteDatabase<'sync', unknown, Schema>

/** The raw connection, for what Drizzle doesn't cover: pragmas, `VACUUM INTO`, the migrator. */
export type RawDatabase = {
  exec(sql: string): void
  /** All rows of a query, as objects. */
  all(sql: string, ...params: unknown[]): Record<string, unknown>[]
  run(sql: string, ...params: unknown[]): void
  close(): void
}

export type Database = { db: Db; raw: RawDatabase; path: string; driver: 'bun' | 'node' }

const require = createRequire(import.meta.url)
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA busy_timeout = 5000',
]

/** Opens (and creates) the database at `path`, or an in-memory one at `:memory:`. */
export function openDatabase(path: string): Database {
  if (isBun) {
    const { Database: BunDatabase } = require('bun:sqlite') as typeof import('bun:sqlite')
    const { drizzle } = require('drizzle-orm/bun-sqlite') as typeof import('drizzle-orm/bun-sqlite')
    const conn = new BunDatabase(path, { create: true })
    const raw: RawDatabase = {
      exec: (sql) => conn.exec(sql),
      all: (sql, ...params) =>
        conn.query(sql).all(...(params as never[])) as Record<string, unknown>[],
      run: (sql, ...params) => {
        conn.query(sql).run(...(params as never[]))
      },
      close: () => conn.close(),
    }
    for (const p of PRAGMAS) raw.exec(p)
    return { db: drizzle(conn, { schema }) as unknown as Db, raw, path, driver: 'bun' }
  }
  const BetterSqlite = require('better-sqlite3') as typeof import('better-sqlite3')
  const { drizzle } =
    require('drizzle-orm/better-sqlite3') as typeof import('drizzle-orm/better-sqlite3')
  const conn = new BetterSqlite(path)
  const raw: RawDatabase = {
    exec: (sql) => {
      conn.exec(sql)
    },
    all: (sql, ...params) => conn.prepare(sql).all(...params) as Record<string, unknown>[],
    run: (sql, ...params) => {
      conn.prepare(sql).run(...params)
    },
    close: () => conn.close(),
  }
  for (const p of PRAGMAS) raw.exec(p)
  return { db: drizzle(conn, { schema }) as unknown as Db, raw, path, driver: 'node' }
}
