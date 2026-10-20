// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate, openDatabase, pendingMigrations, schema } from '../src/index.ts'
import { migrations } from '../src/migrations.ts'

const dirs: string[] = []
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), 'highsea-db-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('database', () => {
  test('migrates an empty database and reads and writes through Drizzle', () => {
    const { db, raw } = openDatabase(':memory:')
    expect(migrate(raw).applied).toEqual(migrations.map((m) => m.tag))
    db.insert(schema.settings)
      .values({ key: 'server', value: { name: 'Harbor' }, updatedAt: 1 })
      .run()
    const row = db.select().from(schema.settings).where(eq(schema.settings.key, 'server')).get()
    expect(row?.value).toEqual({ name: 'Harbor' })
    // nothing left to apply
    expect(migrate(raw).applied).toEqual([])
    raw.close()
  })

  test('a file database is in WAL mode with foreign keys on', () => {
    const { raw } = openDatabase(join(tempDir(), 'highsea.db'))
    expect(raw.all('PRAGMA journal_mode')[0]?.journal_mode).toBe('wal')
    expect(raw.all('PRAGMA foreign_keys')[0]?.foreign_keys).toBe(1)
    raw.close()
  })

  test('backs up a migrated database before the next migration, not a new one', () => {
    const dir = tempDir()
    const backups = join(dir, 'backups')
    const first = openDatabase(join(dir, 'highsea.db'))
    expect(migrate(first.raw, { backupDir: backups }).backup).toBeNull()
    first.raw.close()

    const next = [...migrations, { tag: '9999_test', sql: 'CREATE TABLE extra (id TEXT)' }]
    const second = openDatabase(join(dir, 'highsea.db'))
    expect(pendingMigrations(second.raw, next).map((m) => m.tag)).toEqual(['9999_test'])
    const result = migrate(second.raw, {
      backupDir: backups,
      all: next,
      now: Date.UTC(2026, 9, 19),
    })
    expect(result.applied).toEqual(['9999_test'])
    expect(result.backup && existsSync(result.backup)).toBe(true)
    expect(readdirSync(backups)).toEqual(['highsea-2026-10-19T00-00-00-000Z-before-9999_test.db'])
    // the backup has the old schema, without the new table
    const copy = openDatabase(result.backup as string)
    expect(copy.raw.all("SELECT name FROM sqlite_master WHERE name = 'extra'")).toEqual([])
    copy.raw.close()
    second.raw.close()
  })

  test('a failing migration rolls back and names itself', () => {
    const { raw } = openDatabase(':memory:')
    const bad = [
      ...migrations,
      { tag: '9999_bad', sql: 'CREATE TABLE a (id TEXT);\n--> statement-breakpoint\nNOT SQL' },
    ]
    expect(() => migrate(raw, { all: bad })).toThrow('Migration 9999_bad failed')
    expect(raw.all("SELECT name FROM sqlite_master WHERE name = 'a'")).toEqual([])
    expect(pendingMigrations(raw, bad).map((m) => m.tag)).toEqual(['9999_bad'])
    raw.close()
  })

  test('the embedded migrations match drizzle/', () => {
    const run = Bun.spawnSync(['bun', 'scripts/embed.ts', '--check'], {
      cwd: join(import.meta.dir, '..'),
    })
    expect(run.stdout.toString() + run.stderr.toString()).toContain('migrations up to date')
  })
})
