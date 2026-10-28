// SPDX-License-Identifier: AGPL-3.0-only
// A throwaway server with a lived-in admin, for the server sweep and the docs' screenshots. boot()
// starts it on its own folders, with TMDB answering from the recordings in packages/metadata
// (HIGHSEA_TMDB_REPLAY), the torrent engine offline and the subtitle providers' fakes; seed() finishes
// setup through the API and fills what the pages show. Indexers search the fake indexer
// (packages/indexers/test/fake) on a local port: the catalog is the seed the development key signs,
// plus a local copy of the Internet Archive's definition pointed at the fake, so a public indexer
// and a private one are added without the network. Subtitles come from the providers' fakes, for
// two movies imported from generated clips; the sync is the real engine, so Sintel's clip speaks
// Sintel and its release's subtitle comes back Synced, while Nosferatu's tone leaves its downloaded
// track Not synced, under the minimum confidence.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FAKE_CREDENTIALS, serveFakeIndexer } from '@highsea-tv/indexers/fake'
import { makeFeature } from '@highsea-tv/media/testing'
import { FAKE_ACCOUNTS } from '@highsea-tv/subtitles/fake'
import { sintel } from '@highsea-tv/subtitles/testing'
import { ROOT } from './lib.ts'

/** "00:01:02,500". */
const srtTime = (ms: number) => {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

/**
 * Starts the server on `port`, with discovery on the next port and the fake indexer on the one after.
 * `production` runs the production build in apps/server/.next (`next build` first), as the image
 * does; otherwise Next's dev server.
 */
export async function boot(port: number, { production = false } = {}) {
  // localhost: Next's dev server serves its dev resources to that origin only (allowedDevOrigins)
  const base = `http://localhost:${port}`

  // the server runs on the Node in .nvmrc, as production does; stop here if `node` is another
  execFileSync('node', [join(ROOT, 'scripts/check-node.ts')], { stdio: 'inherit' })
  const dir = mkdtempSync(join(tmpdir(), 'highsea-sweep-'))
  const dataDir = join(dir, 'data')
  for (const d of ['movies', 'downloads']) mkdirSync(join(dataDir, d), { recursive: true })
  const indexer = serveFakeIndexer(port + 2)
  // a local definition overrides the catalog's (ADR 0034): the Internet Archive, at the fake
  const definitions = join(dir, 'config', 'definitions')
  mkdirSync(definitions, { recursive: true })
  writeFileSync(
    join(definitions, 'internet-archive.yml'),
    readFileSync(join(ROOT, 'catalog/indexers/definitions/internet-archive.yml'), 'utf8').replace(
      'links: [https://archive.org/]',
      `links: ['${indexer.origin}/archive/']`,
    ),
  )
  const server: ChildProcess = spawn('node', ['server.ts'], {
    cwd: join(ROOT, 'apps/server'),
    env: {
      ...process.env,
      NODE_ENV: production ? 'production' : 'development',
      // production would check highsea's published catalog and trust only the release key; the
      // seed here is signed with the development key, and nothing reaches the network
      ...(production ? { HIGHSEA_CATALOG_URL: 'off', HIGHSEA_CATALOG_DEV_KEY: '1' } : {}),
      PORT: String(port),
      HOST: '127.0.0.1',
      HIGHSEA_CONFIG_DIR: join(dir, 'config'),
      HIGHSEA_DATA_DIR: dataDir,
      HIGHSEA_DISCOVERY_PORT: String(port + 1),
      HIGHSEA_LOG_LEVEL: 'warn',
      HIGHSEA_TMDB_REPLAY: '1',
      // the engine opens no socket: grabs join the queue, nothing downloads, nothing reaches the network
      HIGHSEA_TORRENT_OFFLINE: '1',
      // no graphics chip, whatever this machine has; HIGHSEA_HARDWARE_NONE=0 looks for the real one
      HIGHSEA_HARDWARE_NONE: process.env.HIGHSEA_HARDWARE_NONE ?? '1',
      // the subtitle providers are the fakes in packages/subtitles: no accounts, no network
      HIGHSEA_SUBTITLES_FAKE: '1',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const exited = new Promise<void>((resolve) => server.once('exit', () => resolve()))
  /** Stops the server; resolves once it has exited, and Next's dev server with it. */
  const stop = () => {
    server.kill('SIGTERM')
    indexer.stop()
    rmSync(dir, { recursive: true, force: true })
    return exited
  }

  async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`)
    return (res.status === 204 ? null : await res.json()) as T
  }

  for (let i = 0; ; i++) {
    const up = await fetch(`${base}/api/health`).then(
      (r) => r.ok,
      () => false,
    )
    if (up) break
    if (i > 120) {
      stop()
      throw new Error('The server didn’t start')
    }
    await Bun.sleep(500)
  }
  return { base, dir, dataDir, indexer, api, stop }
}

export type Server = Awaited<ReturnType<typeof boot>>
export type Person = { username: string; displayName: string; password: string }

/**
 * Finishes setup as `owner` and seeds the library, indexers, downloads, subtitles, people, curation
 * and collections. Returns the owner's token and what the pages link to.
 */
export async function seed(
  { api, dir, dataDir, indexer }: Server,
  owner: Person,
  deviceName: string,
) {
  await api('POST', '/setup', {
    serverName: 'Harbor',
    owner,
    folders: { movies: join(dataDir, 'movies'), downloads: join(dataDir, 'downloads') },
    remoteAccess: { kind: 'local-only' },
    cloudLink: false,
  })
  const device = { name: deviceName, client: 'desktop', appVersion: '1.0.0' }
  const signedIn = await api<{ token: string }>('POST', '/auth/sign-in', {
    username: owner.username,
    password: owner.password,
    device,
  })
  const token = signedIn.token
  const invite = await api<{ link: string }>(
    'POST',
    '/users/invites',
    { displayName: 'Mara', email: null, role: 'user', libraries: 'all' },
    token,
  )
  const joined = await api<{ link: string; user: { id: string } }>(
    'POST',
    '/users/invites',
    { displayName: 'Theo', email: null, role: 'user', libraries: ['movies'] },
    token,
  )
  const accept = (link: string, password: string) =>
    api('POST', `/links/${new URL(link).pathname.split('/').pop()}/accept`, { password })
  await accept(joined.link, 'theo theo theo')
  const admin = await api<{ link: string }>(
    'POST',
    '/users/invites',
    { displayName: 'Ruth', email: null, role: 'admin', libraries: 'all' },
    token,
  )
  await accept(admin.link, 'ruth ruth ruth')
  // a new server requires two-step for the owner and admins; the sweep signs in with passwords
  const security = await api<Record<string, unknown>>('GET', '/settings/security', undefined, token)
  await api('PUT', '/settings/security', { ...security, twoFactor: false }, token)
  const reset = await api<{ link: string }>(
    'POST',
    `/users/${joined.user.id}/password-reset`,
    undefined,
    token,
  )
  await api('POST', '/api-keys', { name: 'Home Assistant', scope: 'read' }, token)
  const pairing = await api<{ code: string }>('POST', '/auth/pairing', {
    device: { name: 'Living room TV', client: 'tvos', appVersion: '1.0.0' },
  })
  await api(
    'PUT',
    '/appearance/themes/lighthouse',
    { name: 'Lighthouse', base: 'oled', accent: '#3d8bfd' },
    token,
  )

  // the library, from the recorded TMDB fixtures: a key (any works under replay), the recordings'
  // region, a second root folder, and movies, one with two versions. Metropolis (19) and the
  // collection's Spider-Man (969681) stay out, for the pages' not-added state.
  await api('PUT', '/settings/metadata', { key: 'sweep-tmdb-key', region: 'US' }, token)
  mkdirSync(join(dataDir, 'films'), { recursive: true })
  await api('POST', '/rootfolders', { path: join(dataDir, 'films') }, token)
  const movies = join(dataDir, 'movies')
  const add = (tmdbId: number, versions = [{ label: '1080p', qualityProfileId: 'qp-hd' }]) =>
    api(
      'POST',
      '/movies',
      {
        tmdbId,
        rootFolder: movies,
        monitored: true,
        minimumAvailability: 'released',
        versions,
        // the seeded English profile, as the add dialog sends; without one nothing is wanted
        languageProfileId: 'lp-en',
      },
      token,
    )
  await add(45745, [
    { label: '4K HDR', qualityProfileId: 'qp-uhd' },
    { label: '1080p', qualityProfileId: 'qp-hd' },
  ])
  for (const id of [10378, 133701, 9761, 653, 832, 1117898]) await add(id)
  await api('PATCH', '/movies/832', { monitored: false }, token)
  // 8c: tags, one on Sintel, for the library's filter, the movie's Tags and Settings › Tags
  const kids = await api<{ id: string }>('POST', '/tags', { label: 'Kids' }, token)
  await api('POST', '/tags', { label: 'Anime' }, token)
  await api('PATCH', '/movies/45745', { tags: [kids.id] }, token)

  // indexers: the public one in a click, the private one with its settings; both are tested first
  await api('POST', '/indexers', { definitionId: 'internet-archive' }, token)
  await api(
    'POST',
    '/indexers',
    {
      definitionId: 'generic-torznab',
      settings: { baseUrl: `${indexer.origin}/torznab`, apiKey: FAKE_CREDENTIALS.torznabKey },
      priority: 10,
    },
    token,
  )
  const found = await api<{ releases: { guid: string; indexerId: string }[] }>(
    'POST',
    '/movies/45745/search',
    undefined,
    token,
  )

  // downloads (checkpoint 6a): the two best releases, grabbed anyway (only one is approved) and
  // the first then blocklisted, a torrent added by hand, and a stray file for manual import
  for (const r of found.releases.slice(0, 2))
    await api(
      'POST',
      `/movies/45745/releases/${encodeURIComponent(r.guid)}/grab`,
      { indexerId: r.indexerId, force: true },
      token,
    )
  const queue = await api<{ id: string }[]>('GET', '/queue', undefined, token)
  if (queue[1])
    await api('DELETE', `/queue/${queue[1].id}`, { deleteData: true, blocklist: true }, token)
  await api(
    'POST',
    '/torrents',
    {
      urlOrMagnet:
        'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Home.Movies.2024',
    },
    token,
  )
  // 6b: an owner's category, so Downloads' filter and Settings' Categories group have one
  await api('POST', '/torrents/categories', { name: 'books', folder: null }, token)
  mkdirSync(join(dataDir, 'downloads', 'Big.Buck.Bunny.2008.1080p.BluRay.x264-GRP'), {
    recursive: true,
  })
  writeFileSync(
    join(dataDir, 'downloads', 'Big.Buck.Bunny.2008.1080p.BluRay.x264-GRP', 'bbb.mkv'),
    '',
  )

  // subtitles (checkpoint 7): two providers signed in, the third left without an account; then
  // Sintel imported with the English subtitle its release carried, 2.5 s late against its speech,
  // and Nosferatu with only the forced English stream inside the clip, whose import searches the
  // fakes.
  await api('PUT', '/subtitles/providers/opensubtitles', FAKE_ACCOUNTS.opensubtitles, token)
  await api('PUT', '/subtitles/providers/subdl', FAKE_ACCOUNTS.subdl, token)
  for (const id of ['opensubtitles', 'subdl'])
    await api('PATCH', `/subtitles/providers/${id}`, { enabled: true }, token)
  // feature length, or the import skips them as samples
  const feature = makeFeature(join(dir, 'feature.mkv'))
  const speaking = makeFeature(join(dir, 'sintel.mkv'), 600, sintel.audio)
  const late = sintel
    .cues()
    .map(
      (c, i) => `${i + 1}\n${srtTime(c.start + 2_500)} --> ${srtTime(c.end + 2_500)}\n${c.text}\n`,
    )
    .join('\n')
  const release = (name: string, srt?: string, clip = feature) => {
    const folder = join(dataDir, 'downloads', name)
    mkdirSync(folder, { recursive: true })
    copyFileSync(clip, join(folder, `${name}.mkv`))
    if (srt) writeFileSync(join(folder, `${name}.en.srt`), srt)
    return folder
  }
  for (const folder of [
    release('Sintel.2010.1080p.BluRay.x264-GRP', late, speaking),
    release('Nosferatu.1922.1080p.BluRay.x264-GRP'),
  ]) {
    const found = await api<
      { path: string; movieId: number | null; versionId: string | null; skip: string | null }[]
    >('POST', '/import/scan', { path: folder }, token)
    // into the 1080p version, as the owner would pick it in the Version column: the scan suggests
    // the first without a file, and Sintel's first is 4K HDR, which refuses a 1080p release
    const files = []
    for (const f of found) {
      if (!f.movieId || f.skip) continue
      const movie = await api<{ versions: { id: string; label: string }[] }>(
        'GET',
        `/movies/${f.movieId}`,
        undefined,
        token,
      )
      const hd = movie.versions.find((v) => v.label === '1080p')
      files.push({ path: f.path, movieId: f.movieId, versionId: hd?.id ?? f.versionId })
    }
    if (!files.length) throw new Error(`nothing to import in ${folder}: ${JSON.stringify(found)}`)
    const ran = await api<{ results: { ok: boolean; message: string }[] }>(
      'POST',
      '/import',
      { files, mode: 'hardlink' },
      token,
    )
    const refused = ran.results.filter((r) => !r.ok)
    if (refused.length) throw new Error(`not imported: ${JSON.stringify(refused)}`)
  }
  // Sintel has what its profile asks for (the release's English and the clip's forced stream);
  // Nosferatu lacks regular English, so its import searched the fakes
  for (let i = 0; i < 50; i++) {
    const tracks = await api<unknown[]>('GET', '/movies/653/subtitles', undefined, token)
    if (tracks.length > 0) break
    if (i === 49) throw new Error('the import’s subtitle search found nothing for Nosferatu')
    await new Promise((r) => setTimeout(r, 200))
  }
  // Re-sync Sintel's release subtitle against its speech, and wait for every sync to finish, so
  // A6 shows Synced and Not synced rather than whatever was mid-sync
  type Track = { id: string; kind: string; sync: { status: string } }
  const tracksOf = (id: number) => api<Track[]>('GET', `/movies/${id}/subtitles`, undefined, token)
  const carried = (await tracksOf(45745)).find((t) => t.kind === 'bundled')
  if (!carried) throw new Error('Sintel’s release subtitle wasn’t kept')
  // the 52-second clip's 12 cues earn less confidence than a film's: its minimum for this sync,
  // then the default again, so Settings shows what it ships with
  const settings = await api<{ minConfidence: number }>(
    'GET',
    '/settings/subtitles',
    undefined,
    token,
  )
  await api('PATCH', '/settings/subtitles', { minConfidence: sintel.minConfidence }, token)
  await api('POST', `/subtitles/${carried.id}/sync`, undefined, token)
  for (let i = 0; ; i++) {
    const all = [...(await tracksOf(45745)), ...(await tracksOf(653))]
    if (all.every((t) => t.sync.status !== 'queued' && t.sync.status !== 'syncing')) {
      const status = (await tracksOf(45745)).find((t) => t.id === carried.id)?.sync.status
      if (status !== 'synced') throw new Error(`Sintel’s subtitle came back ${status}`)
      break
    }
    if (i === 300) throw new Error('the subtitle syncs didn’t finish')
    await new Promise((r) => setTimeout(r, 200))
  }
  await api('PATCH', '/settings/subtitles', { minConfidence: settings.minConfidence }, token)

  // 8c: an announcement (its banner shows on every admin page too) and a hand-picked section
  const curated = {
    audience: { kind: 'everyone' },
    schedule: { start: new Date().toISOString(), end: null },
  }
  const notice = await api<{ id: string }>(
    'POST',
    '/curation/announcements',
    {
      ...curated,
      title: 'Movie night is Friday',
      body: 'We’re watching **Sintel** in the living room at 8 pm.',
      image: null,
      cta: null,
      severity: 'notice',
      placements: ['banner', 'card'],
      acknowledgement: 'dismiss',
      draft: false,
    },
    token,
  )
  const picks = await api<{ id: string }>(
    'POST',
    '/curation/sections',
    {
      ...curated,
      title: 'Staff picks',
      tagline: 'by Ines',
      layout: 'row',
      source: { kind: 'manual', itemIds: [45745, 653] },
      overrides: [],
    },
    token,
  )

  // 8d: a smart collection with a group, one picked by hand that a section draws on, and one
  // whose rules match nothing yet
  const collection = (name: string, rules: unknown, include: number[] = []) => ({
    name,
    summary: '',
    artwork: null,
    rules,
    include,
    exclude: [],
    sort: rules ? 'rating' : 'manual',
    descending: true,
    limit: null,
    audience: { kind: 'everyone' },
  })
  const condition = (id: string, field: string, op: string, value: unknown) => ({
    kind: 'condition',
    id,
    field,
    op,
    value,
  })
  const decade = await api<{ id: string }>(
    'POST',
    '/curation/collections',
    collection('Open movies of the 2010s', {
      kind: 'group',
      id: 'g-1',
      match: 'all',
      rules: [
        condition('c-1', 'year', 'between', [2010, 2020]),
        {
          kind: 'group',
          id: 'g-2',
          match: 'any',
          rules: [
            condition('c-2', 'rating', 'atLeast', 3),
            condition('c-3', 'runtime', 'atMost', 20),
          ],
        },
      ],
    }),
    token,
  )
  const handPicked = await api<{ id: string }>(
    'POST',
    '/curation/collections',
    collection('Blender picks', null, [45745, 653]),
    token,
  )
  const nothingYet = await api<{ id: string }>(
    'POST',
    '/curation/collections',
    collection('Nothing yet', {
      kind: 'group',
      id: 'g-1',
      match: 'all',
      rules: [condition('c-1', 'title', 'contains', 'No such film')],
    }),
    token,
  )
  const drawsOn = await api<{ id: string }>(
    'POST',
    '/curation/sections',
    {
      ...curated,
      title: 'Blender night',
      tagline: null,
      layout: 'row',
      source: { kind: 'rule', rule: 'collection', value: handPicked.id },
      overrides: [],
    },
    token,
  )
  return { token, invite, reset, pairing, notice, picks, drawsOn, decade, handPicked, nothingYet }
}
