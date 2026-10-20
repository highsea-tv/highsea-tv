// SPDX-License-Identifier: AGPL-3.0-only
// Our own small migrator (ADR 0019): migrations are embedded in `migrations.ts`, applied in order
// inside a transaction each, and recorded in `__migrations`. Before touching a database that
// already has data, it's copied with `VACUUM INTO`.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { RawDatabase } from './database.ts'
import { migrations as embedded, type Migration } from './migrations.ts'

export type MigrateResult = { applied: string[]; backup: string | null }

const BREAK = '--> statement-breakpoint'

export function pendingMigrations(raw: RawDatabase, all: Migration[] = embedded): Migration[] {
  raw.exec(
    'CREATE TABLE IF NOT EXISTS __migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)',
  )
  const done = new Set(raw.all('SELECT tag FROM __migrations').map((r) => String(r.tag)))
  return all.filter((m) => !done.has(m.tag))
}

export function migrate(
  raw: RawDatabase,
  {
    backupDir,
    now = Date.now(),
    all = embedded,
  }: { backupDir?: string; now?: number; all?: Migration[] } = {},
): MigrateResult {
  const pending = pendingMigrations(raw, all)
  if (pending.length === 0) return { applied: [], backup: null }
  let backup: string | null = null
  const hasData = raw.all('SELECT count(*) AS n FROM __migrations')[0]?.n !== 0
  if (backupDir && hasData) {
    mkdirSync(backupDir, { recursive: true })
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
    backup = join(backupDir, `highsea-${stamp}-before-${pending[0]?.tag}.db`)
    raw.run('VACUUM INTO ?', backup)
  }
  for (const m of pending) {
    raw.exec('BEGIN')
    try {
      for (const statement of m.sql.split(BREAK)) if (statement.trim()) raw.exec(statement)
      raw.run('INSERT INTO __migrations (tag, applied_at) VALUES (?, ?)', m.tag, now)
      raw.exec('COMMIT')
    } catch (e) {
      raw.exec('ROLLBACK')
      throw new Error(`Migration ${m.tag} failed: ${(e as Error).message}`)
    }
  }
  return { applied: pending.map((m) => m.tag), backup }
}
