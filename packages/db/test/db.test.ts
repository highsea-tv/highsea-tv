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

describe('0004_roles', () => {
  const before = migrations.filter((m) => m.tag < '0004')
  const roles = migrations.find((m) => m.tag === '0004_roles') as (typeof migrations)[number]

  /** A server from before the change, with someone in every old role and every old permission. */
  function older() {
    const { raw } = openDatabase(':memory:')
    migrate(raw, { all: before })
    const person = (id: string, role: string, permissions: string[], libraries: string[]) => {
      raw.run(
        'INSERT INTO users (id, username, display_name, role, webauthn_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0)',
        id,
        id,
        id,
        role,
        `w-${id}`,
      )
      for (const p of permissions) raw.run('INSERT INTO user_permissions VALUES (?, ?)', id, p)
      for (const l of libraries) raw.run('INSERT INTO library_access VALUES (?, ?)', id, l)
    }
    const old = ['admin', 'manageUsers', 'manageLibrary', 'autoApprove', 'request', 'download']
    person('ines', 'owner', old, ['*'])
    person('ruth', 'admin', ['manageLibrary', 'request'], ['movies'])
    person('mara', 'member', ['request', 'download', 'autoApprove'], ['*'])
    person('theo', 'restricted', ['manageLibrary'], ['movies'])
    const layout = (scope: string) =>
      raw.run("INSERT INTO widget_layouts (scope, widgets, updated_at) VALUES (?, '[]', 0)", scope)
    for (const scope of ['role:owner', 'role:admin', 'role:member', 'role:restricted'])
      layout(scope)
    return raw
  }

  const state = (raw: ReturnType<typeof older>) => ({
    roles: Object.fromEntries(raw.all('SELECT id, role FROM users').map((r) => [r.id, r.role])),
    permissions: raw
      .all('SELECT user_id, permission FROM user_permissions ORDER BY user_id, permission')
      .map((r) => `${r.user_id}:${r.permission}`),
    libraries: raw
      .all('SELECT user_id, library FROM library_access ORDER BY user_id, library')
      .map((r) => `${r.user_id}:${r.library}`),
    layouts: raw.all('SELECT scope FROM widget_layouts ORDER BY scope').map((r) => r.scope),
    security: raw.all("SELECT value FROM settings WHERE key = 'security'").map((r) => r.value),
  })

  test('members and restricted people become users; staff hold no permissions and every library', () => {
    const raw = older()
    migrate(raw)
    expect(state(raw)).toMatchObject({
      roles: { ines: 'owner', ruth: 'admin', mara: 'user', theo: 'user' },
      // a user keeps Ask for titles and Download for offline, and their libraries
      permissions: ['mara:download', 'mara:request'],
      libraries: ['ines:*', 'mara:*', 'ruth:*', 'theo:movies'],
      layouts: ['role:admin', 'role:owner'],
    })
    raw.close()
  })

  test('the two-step policy becomes one switch; a server without one keeps it off', () => {
    for (const [policy, on] of [
      ['everyone', true],
      ['staff', true],
      ['optional', false],
    ] as const) {
      const raw = older()
      raw.run(
        "INSERT INTO settings VALUES ('security', ?, 0)",
        JSON.stringify({ twoFactor: policy, sessionDays: 7 }),
      )
      migrate(raw)
      expect(state(raw).security.map((v) => JSON.parse(String(v)))).toEqual([
        { twoFactor: on, sessionDays: 7 },
      ])
      raw.close()
    }
    // set up before, never saved: off, as it was
    const raw = older()
    migrate(raw)
    expect(state(raw).security.map((v) => JSON.parse(String(v)))).toEqual([{ twoFactor: false }])
    raw.close()
    // not set up yet: nothing written, so the new default (on) applies
    const fresh = openDatabase(':memory:').raw
    migrate(fresh)
    expect(state(fresh).security).toEqual([])
    fresh.close()
  })

  test('is safe to run again', () => {
    const raw = older()
    migrate(raw)
    const once = state(raw)
    for (const statement of roles.sql.split('--> statement-breakpoint')) raw.exec(statement)
    expect(state(raw)).toEqual(once)
    raw.close()
  })
})
