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

describe('0018_profiles', () => {
  const before = migrations.filter((m) => m.tag < '0018')

  /**
   * A server from before profiles, as the owner's NAS is: two accounts with watch positions,
   * history, playback picks, a Home and a signed-in device each, and a Now playing row.
   */
  function older(file: string) {
    const { raw } = openDatabase(file)
    migrate(raw, { all: before })
    raw.exec('PRAGMA foreign_keys = OFF')
    for (const [id, name] of [
      ['usr_ines', 'Ines'],
      ['usr_theo', 'Theo'],
    ]) {
      raw.run(
        "INSERT INTO users (id, username, display_name, role, webauthn_id, created_at, updated_at) VALUES (?, ?, ?, 'user', ?, 5, 5)",
        id,
        id,
        name,
        `w-${id}`,
      )
      raw.run(
        "INSERT INTO devices (id, user_id, kind, token_hash, name, client, app_version, address, method, created_at, last_seen_at) VALUES (?, ?, 'token', ?, 'TV', 'tvos', '1', '::1', 'pairing', 0, 0)",
        `dev-${id}`,
        id,
        `hash-${id}`,
      )
      raw.run(
        'INSERT INTO home_layouts (user_id, "order", hidden, updated_at) VALUES (?, \'["continue"]\', \'[]\', 0)',
        id,
      )
    }
    for (const item of ['itm_a', 'itm_b'])
      raw.run(
        "INSERT INTO media_items (id, type, tmdb_id, title, sort_title, status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at, updated_at) VALUES (?, 'movie', ?, ?, ?, 'released', 1, 'released', 'qp', '/m', ?, 0, 0)",
        item,
        item === 'itm_a' ? 1 : 2,
        item,
        item,
        `/m/${item}`,
      )
    raw.run("INSERT INTO watch_positions VALUES ('usr_ines', 'itm_a', 600, 6000, 10)")
    raw.run("INSERT INTO watch_positions VALUES ('usr_theo', 'itm_a', 60, 6000, 11)")
    raw.run("INSERT INTO watch_history VALUES ('usr_ines', 'itm_b', 1, 2, 12, 12)")
    raw.run("INSERT INTO playback_prefs VALUES ('usr_ines', 'itm_a', NULL, 'a2', 's1', 250, 13)")
    raw.exec('PRAGMA foreign_keys = ON')
    return raw
  }

  const state = (raw: ReturnType<typeof older>) => ({
    profiles: raw.all('SELECT id, user_id, name, tone, pin_hash, main FROM profiles ORDER BY id'),
    positions: raw.all(
      'SELECT user_id, profile_id, item_id, position_seconds FROM watch_positions ORDER BY user_id',
    ),
    history: raw.all('SELECT user_id, profile_id, item_id, play_count FROM watch_history'),
    prefs: raw.all('SELECT profile_id, item_id, audio_id, subtitle_offset_ms FROM playback_prefs'),
    home: raw.all('SELECT profile_id, user_id, "order" FROM home_layouts ORDER BY profile_id'),
    devices: raw.all('SELECT id, profile_id FROM devices ORDER BY id'),
  })

  test("moves every account's watch state, picks and Home to its own profile", () => {
    const raw = older(':memory:')
    expect(migrate(raw).applied).toContain('0018_profiles')
    expect(state(raw)).toEqual({
      profiles: [
        {
          id: 'usr_ines',
          user_id: 'usr_ines',
          name: 'Ines',
          tone: 'accent',
          pin_hash: null,
          main: 1,
        },
        {
          id: 'usr_theo',
          user_id: 'usr_theo',
          name: 'Theo',
          tone: 'accent',
          pin_hash: null,
          main: 1,
        },
      ],
      positions: [
        { user_id: 'usr_ines', profile_id: 'usr_ines', item_id: 'itm_a', position_seconds: 600 },
        { user_id: 'usr_theo', profile_id: 'usr_theo', item_id: 'itm_a', position_seconds: 60 },
      ],
      history: [{ user_id: 'usr_ines', profile_id: 'usr_ines', item_id: 'itm_b', play_count: 2 }],
      prefs: [
        { profile_id: 'usr_ines', item_id: 'itm_a', audio_id: 'a2', subtitle_offset_ms: 250 },
      ],
      home: [
        { profile_id: 'usr_ines', user_id: 'usr_ines', order: '["continue"]' },
        { profile_id: 'usr_theo', user_id: 'usr_theo', order: '["continue"]' },
      ],
      // a device that never chose watches as the account's own
      devices: [
        { id: 'dev-usr_ines', profile_id: null },
        { id: 'dev-usr_theo', profile_id: null },
      ],
    })
    expect(raw.all('PRAGMA foreign_key_check')).toEqual([])
    raw.close()
  })

  test('a server started twice over a migrated file changes nothing the second time', () => {
    const dir = tempDir()
    const file = join(dir, 'highsea.db')
    const first = older(file)
    const result = migrate(first, { backupDir: join(dir, 'backups') })
    expect(result.applied).toEqual([
      '0018_profiles',
      '0019_artwork',
      '0020_shows',
      '0021_web_seeds',
      '0022_unmatched_files',
      '0023_fanart',
      '0024_show_dismissals',
      '0025_music',
      '0026_unmatched_dismissed',
      '0027_job_subjects',
      '0028_music_plays',
    ])
    expect(result.backup).not.toBeNull()
    const once = state(first)
    first.close()
    const again = openDatabase(file).raw
    expect(migrate(again, { backupDir: join(dir, 'backups') })).toEqual({
      applied: [],
      backup: null,
    })
    expect(state(again)).toEqual(once)
    again.close()
  })

  test("a profile's watch state, picks and Home go with it; a device that chose it goes back to the account's own", () => {
    const raw = older(':memory:')
    migrate(raw)
    raw.run(
      "INSERT INTO profiles (id, user_id, name, tone, main, created_at, updated_at) VALUES ('prf_kids', 'usr_ines', 'Kids', 'warning', 0, 0, 0)",
    )
    raw.run("INSERT INTO watch_positions VALUES ('usr_ines', 'prf_kids', 'itm_b', 30, 6000, 20)")
    raw.run("UPDATE devices SET profile_id = 'prf_kids' WHERE id = 'dev-usr_ines'")
    raw.run("DELETE FROM profiles WHERE id = 'prf_kids'")
    expect(raw.all("SELECT * FROM watch_positions WHERE profile_id = 'prf_kids'")).toEqual([])
    expect(raw.all("SELECT profile_id FROM devices WHERE id = 'dev-usr_ines'")).toEqual([
      { profile_id: null },
    ])
    raw.close()
  })
})

describe('0020_shows', () => {
  const before = migrations.filter((m) => m.tag < '0020')

  /**
   * A server as the owner's NAS is before shows: films with versions, files, watch positions,
   * history and chosen artwork, every migration up to 0019_artwork applied.
   */
  function withFilms(file: string, upTo = before) {
    const { raw } = openDatabase(file)
    migrate(raw, { all: upTo })
    raw.exec('PRAGMA foreign_keys = OFF')
    raw.run(
      "INSERT INTO users (id, username, display_name, role, webauthn_id, created_at, updated_at) VALUES ('usr_ines', 'ines', 'Ines', 'owner', 'w-1', 5, 5)",
    )
    raw.run(
      "INSERT INTO profiles (id, user_id, name, tone, main, created_at, updated_at) VALUES ('usr_ines', 'usr_ines', 'Ines', 'accent', 1, 5, 5)",
    )
    for (let n = 1; n <= 300; n++) {
      const id = `itm_${n}`
      raw.run(
        "INSERT INTO media_items (id, type, tmdb_id, title, sort_title, year, status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at, updated_at) VALUES (?, 'movie', ?, ?, ?, 2001, 'available', 1, 'released', 'qp', '/media/movies', ?, ?, ?)",
        id,
        n,
        `Film ${n}`,
        `film ${n}`,
        `/media/movies/Film ${n} (2001)`,
        n,
        n,
      )
      raw.run(
        "INSERT INTO media_files (id, item_id, version_id, path, size, quality, added_at) VALUES (?, ?, ?, ?, 1000, 'Bluray-1080p', ?)",
        `fil_${n}`,
        id,
        `ver_${n}`,
        `/media/movies/Film ${n} (2001)/Film ${n}.mkv`,
        n,
      )
      raw.run(
        "INSERT INTO versions (id, item_id, label, quality_profile_id, file_id, position, created_at) VALUES (?, ?, 'Main', 'qp', ?, 0, ?)",
        `ver_${n}`,
        id,
        `fil_${n}`,
        n,
      )
    }
    raw.run(
      "INSERT INTO watch_positions (user_id, profile_id, item_id, position_seconds, duration_seconds, updated_at) VALUES ('usr_ines', 'usr_ines', 'itm_7', 600, 6000, 10)",
    )
    raw.run(
      "INSERT INTO artwork (owner_type, owner_id, kind, source, file, chosen_at) VALUES ('movie', 7, 'logo', 'tmdb', '/logo.png', 10)",
    )
    raw.exec('PRAGMA foreign_keys = ON')
    return raw
  }

  const films = (raw: ReturnType<typeof withFilms>) => ({
    items: raw.all(
      'SELECT id, type, tmdb_id, parent_id, title, status, path, added_at FROM media_items ORDER BY added_at',
    ),
    versions: raw.all('SELECT id, item_id, file_id FROM versions ORDER BY id'),
    files: raw.all('SELECT id, item_id, version_id, path FROM media_files ORDER BY id'),
    positions: raw.all('SELECT profile_id, item_id, position_seconds FROM watch_positions'),
    artwork: raw.all('SELECT owner_type, owner_id, kind, file FROM artwork'),
  })

  test('leaves every film, version, file and watch position as it was', () => {
    const raw = withFilms(':memory:')
    const was = films(raw)
    expect(migrate(raw).applied).toEqual([
      '0020_shows',
      '0021_web_seeds',
      '0022_unmatched_files',
      '0023_fanart',
      '0024_show_dismissals',
      '0025_music',
      '0026_unmatched_dismissed',
      '0027_job_subjects',
      '0028_music_plays',
    ])
    expect(films(raw)).toEqual(was)
    expect(raw.all('SELECT count(*) AS n FROM media_items')).toEqual([{ n: 300 }])
    // the new columns are empty on films
    expect(
      raw.all(
        'SELECT count(*) AS n FROM media_items WHERE show_id IS NULL AND season_number IS NULL AND episode_number IS NULL',
      ),
    ).toEqual([{ n: 300 }])
    expect(raw.all('PRAGMA foreign_key_check')).toEqual([])
    expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
    raw.close()
  })

  test('a show, a season and an episode sit beside the films, and go with the show', () => {
    const raw = withFilms(':memory:')
    migrate(raw)
    const row = (
      id: string,
      type: string,
      tmdbId: number,
      parent: string | null,
      extra: object,
    ) => ({
      id,
      type,
      tmdbId,
      parentId: parent,
      title: id,
      sortTitle: id,
      status: 'wanted',
      monitored: 1,
      minimumAvailability: 'released',
      qualityProfileId: 'qp',
      rootFolder: '/media/shows',
      path: '/media/shows/Show',
      addedAt: 1,
      updatedAt: 1,
      ...extra,
    })
    for (const r of [
      row('itm_show', 'show', 87108, null, {}),
      row('itm_s1', 'season', 7, 'itm_show', { showId: 'itm_show', seasonNumber: 1 }),
      // a film and an episode may share a TMDB number (itm_1 is film 1): type tells them apart
      row('itm_e1', 'episode', 1, 'itm_s1', {
        showId: 'itm_show',
        seasonNumber: 1,
        episodeNumber: 1,
      }),
    ])
      raw.run(
        'INSERT INTO media_items (id, type, tmdb_id, parent_id, show_id, season_number, episode_number, title, sort_title, status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        r.id,
        r.type,
        r.tmdbId,
        r.parentId,
        (r as { showId?: string }).showId ?? null,
        (r as { seasonNumber?: number }).seasonNumber ?? null,
        (r as { episodeNumber?: number }).episodeNumber ?? null,
        r.title,
        r.sortTitle,
        r.status,
        r.monitored,
        r.minimumAvailability,
        r.qualityProfileId,
        r.rootFolder,
        r.path,
        r.addedAt,
        r.updatedAt,
      )
    raw.run("INSERT INTO show_details (item_id, tvdb_id) VALUES ('itm_show', 360893)")
    expect(raw.all("SELECT season_folders FROM show_details WHERE item_id = 'itm_show'")).toEqual([
      { season_folders: 1 },
    ])
    expect(
      raw.all(
        "SELECT id FROM media_items WHERE show_id = 'itm_show' ORDER BY season_number, episode_number",
      ),
    ).toEqual([{ id: 'itm_s1' }, { id: 'itm_e1' }])
    raw.run("DELETE FROM media_items WHERE id = 'itm_show'")
    expect(raw.all('SELECT item_id FROM show_details')).toEqual([])
    raw.close()
  })

  describe('0022_unmatched_files', () => {
    /**
     * Films, and a show from #77 with a season and two episodes, every migration before `before`
     * (0022 by default).
     */
    function withShow(before = '0022') {
      const raw = withFilms(
        ':memory:',
        migrations.filter((m) => m.tag < before),
      )
      const insert = (
        id: string,
        type: string,
        tmdbId: number,
        parent: string | null,
        season: number | null,
        episode: number | null,
      ) =>
        raw.run(
          "INSERT INTO media_items (id, type, tmdb_id, parent_id, show_id, season_number, episode_number, title, sort_title, status, monitored, minimum_availability, quality_profile_id, root_folder, path, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'wanted', 1, 'released', 'qp', '/media/shows', '/media/shows/Chernobyl (2019)', 1, 1)",
          id,
          type,
          tmdbId,
          parent,
          parent ? 'itm_show' : null,
          season,
          episode,
          id,
          id,
        )
      insert('itm_show', 'show', 87108, null, null, null)
      insert('itm_s1', 'season', 116924, 'itm_show', 1, null)
      insert('itm_e1', 'episode', 1, 'itm_s1', 1, 1)
      insert('itm_e2', 'episode', 2, 'itm_s1', 1, 2)
      raw.run("INSERT INTO show_details (item_id, tvdb_id) VALUES ('itm_show', 360893)")
      for (const e of ['itm_e1', 'itm_e2'])
        raw.run(
          "INSERT INTO versions (id, item_id, label, quality_profile_id, position, created_at) VALUES (?, ?, 'Default', 'qp', 0, 1)",
          `ver_${e}`,
          e,
        )
      // one file holding both episodes, under the first (ADR 0064)
      raw.run(
        "INSERT INTO media_files (id, item_id, version_id, path, size, quality, added_at) VALUES ('fil_e12', 'itm_e1', 'ver_itm_e1', '/media/shows/Chernobyl (2019)/Season 01/Chernobyl.S01E01E02.mkv', 1000, 'WEBDL-1080p', 1)",
      )
      raw.run("UPDATE versions SET file_id = 'fil_e12' WHERE item_id IN ('itm_e1', 'itm_e2')")
      return raw
    }
    const all = (raw: ReturnType<typeof withShow>) => ({
      items: raw.all('SELECT * FROM media_items ORDER BY id'),
      versions: raw.all('SELECT * FROM versions ORDER BY id'),
      files: raw.all('SELECT * FROM media_files ORDER BY id'),
      details: raw.all('SELECT * FROM show_details'),
      positions: raw.all('SELECT * FROM watch_positions'),
    })

    test('adds the table and leaves the films and the show’s rows as they were', () => {
      const raw = withShow()
      const was = all(raw)
      expect(migrate(raw).applied).toEqual([
        '0022_unmatched_files',
        '0023_fanart',
        '0024_show_dismissals',
        '0025_music',
        '0026_unmatched_dismissed',
        '0027_job_subjects',
        '0028_music_plays',
      ])
      expect(all(raw)).toEqual(was)
      expect(raw.all('SELECT count(*) AS n FROM unmatched_files')).toEqual([{ n: 0 }])
      expect(raw.all('PRAGMA foreign_key_check')).toEqual([])
      expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
      expect(migrate(raw).applied).toEqual([])
      raw.close()
    })

    test('a file kept unmatched goes with its show; a folder has none', () => {
      const raw = withShow()
      migrate(raw)
      raw.run(
        "INSERT INTO unmatched_files (path, kind, root_folder, item_id, reason, message, size, found_at) VALUES ('/media/shows/Chernobyl (2019)/Recap.mkv', 'episode-file', '/media/shows', 'itm_show', 'no-episode-number', 'No number.', 10, 1)",
      )
      raw.run(
        "INSERT INTO unmatched_files (path, kind, root_folder, item_id, reason, message, found_at) VALUES ('/media/shows/Chernobyl', 'show-folder', '/media/shows', NULL, 'ambiguous', 'Two shows.', 1)",
      )
      raw.run("DELETE FROM media_items WHERE id = 'itm_show'")
      expect(raw.all('SELECT path FROM unmatched_files')).toEqual([
        { path: '/media/shows/Chernobyl' },
      ])
      raw.close()
    })

    // HT-83 (Phase 5 B): a show taken off Continue watching and Next up, per profile
    describe('0024_show_dismissals', () => {
      /** The show above, with #79's unmatched files and a watch position, migrated up to 0023. */
      function withUnmatched() {
        const raw = withShow('0024')
        raw.run(
          "INSERT INTO unmatched_files (path, kind, root_folder, item_id, reason, message, size, found_at) VALUES ('/media/shows/Chernobyl (2019)/Recap.mkv', 'episode-file', '/media/shows', 'itm_show', 'no-episode-number', 'No number.', 10, 1)",
        )
        const [profile] = raw.all('SELECT id, user_id FROM profiles LIMIT 1') as {
          id: string
          user_id: string
        }[]
        if (profile)
          raw.run(
            'INSERT INTO watch_positions (user_id, profile_id, item_id, position_seconds, duration_seconds, updated_at) VALUES (?, ?, ?, 600, 3600, 1)',
            profile.user_id,
            profile.id,
            'itm_e1',
          )
        return { raw, profile }
      }
      const everything = (raw: ReturnType<typeof withShow>) => ({
        ...all(raw),
        unmatched: raw.all('SELECT * FROM unmatched_files ORDER BY path'),
      })

      test('adds the table and leaves the films, the show and its unmatched files as they were', () => {
        const { raw } = withUnmatched()
        const was = everything(raw)
        expect(migrate(raw, { all: migrations.filter((m) => m.tag < '0026') }).applied).toEqual([
          '0024_show_dismissals',
          '0025_music',
        ])
        expect(everything(raw)).toEqual(was)
        expect(raw.all('SELECT count(*) AS n FROM show_dismissals')).toEqual([{ n: 0 }])
        expect(raw.all('PRAGMA foreign_key_check')).toEqual([])
        expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
        expect(migrate(raw).applied).toEqual([
          '0026_unmatched_dismissed',
          '0027_job_subjects',
          '0028_music_plays',
        ])
        expect(migrate(raw).applied).toEqual([])
        raw.close()
      })

      // Phase 5 D, ADR 0065: music in its own tables, added beside the films and shows
      test('0025_music only adds its tables, and leaves the films, the show and its files as they were', () => {
        const { raw } = withUnmatched()
        migrate(raw, { all: migrations.filter((m) => m.tag < '0025') })
        const was = everything(raw)
        const tables = () =>
          (
            raw.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name") as {
              name: string
            }[]
          ).map((t) => t.name)
        const before = tables()
        expect(migrate(raw, { all: migrations.filter((m) => m.tag < '0026') }).applied).toEqual([
          '0025_music',
        ])
        expect(everything(raw)).toEqual(was)
        expect(tables().filter((t) => !before.includes(t))).toEqual([
          'music_albums',
          'music_artists',
          'music_tracks',
          'music_unmatched',
          'musicbrainz_cache',
        ])
        // an album goes with its artist, and a track with its album
        raw.run(
          "INSERT INTO music_artists (id, name, sort_name, name_key, root_folder, source, added_at, updated_at) VALUES ('ar_1', 'Blur', 'blur', 'blur', '/music', 'tags', 1, 1)",
        )
        raw.run(
          "INSERT INTO music_albums (id, artist_id, title, sort_title, path, root_folder, source, added_at, updated_at) VALUES ('al_1', 'ar_1', 'Parklife', 'parklife', '/music/Blur/Parklife', '/music', 'tags', 1, 1)",
        )
        raw.run(
          "INSERT INTO music_tracks (id, album_id, number, title, path, size, mtime, format, codec, added_at, updated_at) VALUES ('tr_1', 'al_1', 1, 'Girls & Boys', '/music/Blur/Parklife/01.flac', 1, 1, 'FLAC', 'flac', 1, 1)",
        )
        raw.run("DELETE FROM music_artists WHERE id = 'ar_1'")
        expect(raw.all('SELECT count(*) AS n FROM music_tracks')).toEqual([{ n: 0 }])
        expect(raw.all('PRAGMA foreign_key_check')).toEqual([])
        expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
        expect(migrate(raw, { all: migrations.filter((m) => m.tag < '0026') }).applied).toEqual([])
        raw.close()
      })

      // HT-92: the owner's Ignore on an unmatched path
      test('0026_unmatched_dismissed adds dismissed_at, null on the rows there', () => {
        const { raw } = withUnmatched()
        migrate(raw, { all: migrations.filter((m) => m.tag < '0026') })
        const was = everything(raw)
        expect(migrate(raw, { all: migrations.filter((m) => m.tag < '0027') }).applied).toEqual([
          '0026_unmatched_dismissed',
        ])
        const now = everything(raw)
        expect(now.unmatched).toEqual(
          (was.unmatched as Record<string, unknown>[]).map((r) => ({ ...r, dismissed_at: null })),
        )
        expect({ ...now, unmatched: was.unmatched }).toEqual(was)
        expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
        raw.close()
      })

      test('0026 gives a show without a subtitle profile its root folder’s, and no film', () => {
        const { raw } = withUnmatched()
        migrate(raw, { all: migrations.filter((m) => m.tag < '0026') })
        raw.run(
          "INSERT INTO language_profiles (id, name, rules, min_score, created_at, updated_at) VALUES ('lp-en', 'English', '[]', 80, 1, 1)",
        )
        raw.run(
          "INSERT INTO root_folders (id, path, created_at, kind, language_profile_id) VALUES ('rf-tv', '/media/shows', 1, 'shows', 'lp-en')",
        )
        const films = raw.all(
          "SELECT id, language_profile_id FROM media_items WHERE type = 'movie'",
        )
        migrate(raw)
        expect(
          raw.all(
            "SELECT id, language_profile_id AS p FROM media_items WHERE type != 'movie' ORDER BY id",
          ),
        ).toEqual(['itm_e1', 'itm_e2', 'itm_s1', 'itm_show'].map((id) => ({ id, p: 'lp-en' })))
        expect(
          raw.all("SELECT id, language_profile_id FROM media_items WHERE type = 'movie'"),
        ).toEqual(films)
        raw.close()
      })

      // HT-101: a song's plays, the owner's matches by hand, playlists and Recently played, beside
      // the films, the show and the music already there
      test('0028_music_plays adds its tables and an artist’s photo_url, and leaves the rest as it was', () => {
        const { raw, profile } = withUnmatched()
        migrate(raw, { all: migrations.filter((m) => m.tag < '0028') })
        raw.run(
          "INSERT INTO music_artists (id, name, sort_name, name_key, root_folder, source, added_at, updated_at) VALUES ('ar_1', 'Blur', 'blur', 'blur', '/music', 'tags', 1, 1)",
        )
        raw.run(
          "INSERT INTO music_albums (id, artist_id, title, sort_title, path, root_folder, source, added_at, updated_at) VALUES ('al_1', 'ar_1', 'Parklife', 'parklife', '/music/Blur/Parklife', '/music', 'tags', 1, 1)",
        )
        raw.run(
          "INSERT INTO music_tracks (id, album_id, number, title, path, size, mtime, format, codec, added_at, updated_at) VALUES ('tr_1', 'al_1', 1, 'Girls & Boys', '/music/Blur/Parklife/01.flac', 1, 1, 'FLAC', 'flac', 1, 1)",
        )
        const music = () => ({
          albums: raw.all('SELECT * FROM music_albums'),
          tracks: raw.all('SELECT * FROM music_tracks'),
        })
        const was = { ...everything(raw), ...music() }
        const artists = raw.all('SELECT * FROM music_artists') as Record<string, unknown>[]
        const tables = () =>
          (
            raw.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name") as {
              name: string
            }[]
          ).map((t) => t.name)
        const before = tables()
        expect(migrate(raw).applied).toEqual(['0028_music_plays'])
        expect({ ...everything(raw), ...music() }).toEqual(was)
        expect(raw.all('SELECT * FROM music_artists')).toEqual(
          artists.map((a) => ({ ...a, photo_url: null })),
        )
        expect(tables().filter((t) => !before.includes(t))).toEqual([
          'music_matches',
          'music_playlist_entries',
          'music_playlists',
          'music_plays',
          'music_recent',
        ])
        // a play keeps its words when its track goes; a playlist's entry goes with its track
        raw.run(
          "INSERT INTO music_plays (id, user_id, profile_id, profile_name, track_id, album_id, artist_id, title, artist_name, album_title, device_name, client, version, method, away, played, finished, started_at, ended_at) VALUES ('mpl_1', ?, ?, 'Main', 'tr_1', 'al_1', 'ar_1', 'Girls & Boys', 'Blur', 'Parklife', 'TV', 'web', 'FLAC', 'direct-play', 0, 200, 1, 1, 2)",
          profile?.user_id,
          profile?.id,
        )
        raw.run(
          "INSERT INTO music_playlists (id, user_id, profile_id, name, created_at, updated_at) VALUES ('pl_1', ?, ?, 'Mornings', 1, 1)",
          profile?.user_id,
          profile?.id,
        )
        raw.run(
          "INSERT INTO music_playlist_entries (id, playlist_id, track_id, position) VALUES ('pe_1', 'pl_1', 'tr_1', 0)",
        )
        raw.run("DELETE FROM music_artists WHERE id = 'ar_1'")
        expect(raw.all('SELECT track_id, album_id, artist_id, title FROM music_plays')).toEqual([
          { track_id: null, album_id: null, artist_id: null, title: 'Girls & Boys' },
        ])
        expect(raw.all('SELECT count(*) AS n FROM music_playlist_entries')).toEqual([{ n: 0 }])
        expect(raw.all('PRAGMA foreign_key_check')).toEqual([])
        expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
        expect(migrate(raw).applied).toEqual([])
        raw.close()
      })

      test('a dismissal goes with its show', () => {
        const { raw, profile } = withUnmatched()
        migrate(raw)
        expect(profile).toBeDefined()
        raw.run(
          "INSERT INTO show_dismissals (user_id, profile_id, item_id, dismissed_at) VALUES (?, ?, 'itm_show', 1)",
          profile?.user_id,
          profile?.id,
        )
        raw.run("DELETE FROM media_items WHERE id = 'itm_show'")
        expect(raw.all('SELECT * FROM show_dismissals')).toEqual([])
        raw.close()
      })
    })
  })

  test('a cached season goes with its show', () => {
    const raw = withFilms(':memory:')
    migrate(raw)
    raw.run(
      "INSERT INTO show_metadata (tmdb_id, name, original_name, language, data, fetched_at) VALUES (87108, 'Chernobyl', 'Chernobyl', 'en-US', '{}', 1)",
    )
    raw.run(
      "INSERT INTO season_metadata (show_id, season_number, tmdb_id, language, data, fetched_at) VALUES (87108, 1, 116924, 'en-US', '{}', 1)",
    )
    raw.run('DELETE FROM show_metadata WHERE tmdb_id = 87108')
    expect(raw.all('SELECT * FROM season_metadata')).toEqual([])
    raw.close()
  })
})

describe('0023_fanart', () => {
  test('adds fanart.tv’s cache, keyed by subject and id, and the fanart artwork source', () => {
    const { raw } = openDatabase(':memory:')
    migrate(raw, { all: migrations.filter((m) => m.tag < '0023') })
    expect(migrate(raw, { all: migrations.filter((m) => m.tag < '0026') }).applied).toEqual([
      '0023_fanart',
      '0024_show_dismissals',
      '0025_music',
    ])
    raw.run(
      "INSERT INTO fanart_images (subject, external_id, data, fetched_at) VALUES ('movie', '550', NULL, 1)",
    )
    expect(() =>
      raw.run(
        "INSERT INTO fanart_images (subject, external_id, data, fetched_at) VALUES ('movie', '550', '{}', 2)",
      ),
    ).toThrow()
    raw.run(
      "INSERT INTO fanart_images (subject, external_id, data, fetched_at) VALUES ('show', '550', '{}', 2)",
    )
    expect(raw.all('SELECT count(*) AS n FROM fanart_images')[0]?.n).toBe(2)
    raw.close()
  })
})

// HT-106: what a job works on, so the admin can mark the item while it runs
describe('0027_job_subjects', () => {
  test('adds subject and subject_of, null on the jobs there, and keeps them as they were', () => {
    const { raw } = openDatabase(':memory:')
    migrate(raw, { all: migrations.filter((m) => m.tag < '0027') })
    raw.run(
      `INSERT INTO jobs (id, type, payload, status, max_attempts, run_at, created_at)
       VALUES ('job_1', 'metadata.refresh', '{"kind":"movie","id":603}', 'queued', 3, 1, 1)`,
    )
    const was = raw.all('SELECT * FROM jobs') as Record<string, unknown>[]
    expect(migrate(raw, { all: migrations.filter((m) => m.tag < '0028') }).applied).toEqual([
      '0027_job_subjects',
    ])
    expect(raw.all('SELECT * FROM jobs')).toEqual(
      was.map((j) => ({ ...j, subject: null, subject_of: null })),
    )
    raw.run(
      `INSERT INTO jobs (id, type, payload, status, max_attempts, run_at, created_at, subject, subject_of)
       VALUES ('job_2', 'subtitles.search', '{}', 'running', 2, 1, 1, 'episode:62085', 'show:1396')`,
    )
    expect(
      raw.all("SELECT id FROM jobs WHERE subject_of = 'show:1396' AND status = 'running'"),
    ).toEqual([{ id: 'job_2' }])
    expect(raw.all('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }])
    raw.close()
  })
})
