// SPDX-License-Identifier: AGPL-3.0-only
// The server's admin pages (Phase 3): the same checks as the prototype sweeps, on the real thing.
// Boots a throwaway server on its own folders, sweeps setup, finishes it through the API, seeds
// people, keys, a custom theme and a waiting TV, then visits every admin page signed out, as the
// owner and as an admin, and as a user, who gets the refusal page at every address (ADR 0032): axe,
// overflow and page errors in three themes, at 200% text and with reduced motion, then the
// keyboard walk. TMDB answers from the recordings in packages/metadata (HIGHSEA_TMDB_REPLAY), and
// the library is seeded from them through the API. Indexers search the fake indexer
// (packages/indexers/test/fake) on a local port: the catalog is the seed the development key signs,
// plus a local copy of the Internet Archive's definition pointed at the fake, so a public indexer
// and a private one are added without the network. Subtitles come from the providers' fakes
// (HIGHSEA_SUBTITLES_FAKE), for two movies imported from generated clips; the sync is the real
// engine, so Sintel's clip speaks Sintel and its release's subtitle comes back Synced, while
// Nosferatu's tone leaves its downloaded track Not synced, under the minimum confidence. Usage: bun scripts/sweeps/server.ts [pages|keyboard]
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FAKE_CREDENTIALS, serveFakeIndexer } from '@highsea/indexers/fake'
import { makeFeature } from '@highsea/media/testing'
import { FAKE_ACCOUNTS } from '@highsea/subtitles/fake'
import { sintel } from '@highsea/subtitles/testing'
import type { BrowserContext, Page } from 'playwright-core'
import { axe, heightFor, launch, overflow, pool, ROOT, settleAnimations, walk } from './lib.ts'

const only = process.argv[2] as 'pages' | 'keyboard' | undefined
const PORT = Number(process.env.SWEEP_PORT ?? 3150)
// localhost: Next's dev server serves its dev resources to that origin only (allowedDevOrigins)
const BASE = `http://localhost:${PORT}`
const OWNER = { username: 'sweep', displayName: 'Sweep', password: 'sweep sweep sweep' }
const VARIANTS = [
  'theme=default',
  'theme=oled',
  'theme=high-contrast',
  'text=200',
  'motion=reduced',
] as const
const WIDTHS = [1440, 390]
// SWEEP_SHOTS=<folder>: also save each page, default theme, at each width (for checkpoint reports)
const SHOTS = process.env.SWEEP_SHOTS

// ---------------------------------------------------------------- the server

// the server runs on the Node in .nvmrc, as production does; stop here if `node` is another
execFileSync('node', [join(ROOT, 'scripts/check-node.ts')], { stdio: 'inherit' })
const dir = mkdtempSync(join(tmpdir(), 'highsea-sweep-'))
const dataDir = join(dir, 'data')
for (const d of ['movies', 'downloads']) mkdirSync(join(dataDir, d), { recursive: true })
const indexer = serveFakeIndexer(PORT + 2)
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
    NODE_ENV: 'development',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    HIGHSEA_CONFIG_DIR: join(dir, 'config'),
    HIGHSEA_DATA_DIR: dataDir,
    HIGHSEA_DISCOVERY_PORT: String(PORT + 1),
    HIGHSEA_LOG_LEVEL: 'warn',
    HIGHSEA_TMDB_REPLAY: '1',
    // the engine opens no socket: grabs join the queue, nothing downloads, nothing reaches the network
    HIGHSEA_TORRENT_OFFLINE: '1',
    // the subtitle providers are the fakes in packages/subtitles: no accounts, no network
    HIGHSEA_SUBTITLES_FAKE: '1',
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})
const stop = () => {
  server.kill('SIGTERM')
  indexer.stop()
  rmSync(dir, { recursive: true, force: true })
}

/** "00:01:02,500". */
const srtTime = (ms: number) => {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}

async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
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
  const up = await fetch(`${BASE}/api/health`).then(
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

// ---------------------------------------------------------------- the checks

type Visit = {
  name: string
  path: string
  /** Signed in as the owner. */
  owner?: boolean
  /** Before setup: these run first, while the server has no owner. */
  before?: boolean
  /** What to do once the page is up: open a tab, a sheet, the palette. */
  act?: (page: Page) => Promise<void>
  init?: string
}

const problems: string[] = []
const browser = await launch()

async function open(context: BrowserContext, v: Visit, width: number, variant?: string) {
  const page = await context.newPage()
  await page.setViewportSize({ width, height: heightFor(width) })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  // React reports hydration mismatches and the like through console.error; a 404 page's own
  // status is expected, though
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      errors.push(m.text().slice(0, 120))
  })
  if (variant === 'motion=reduced') await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((init) => {
    localStorage.clear()
    if (init) localStorage.setItem('highsea:setup', init)
  }, v.init ?? '')
  await page.goto(`${BASE}${v.path}`)
  // Not 'networkidle', which Playwright discourages and which never comes here: a signed-in page
  // keeps the event stream open. Ready means hydrated (React DOM puts its props key on an element
  // once it's hydrated, and <html> finishes last) with nothing still loading (aria-busy).
  await page.waitForFunction(
    () =>
      Object.keys(document.documentElement).some((k) => k.startsWith('__reactProps$')) &&
      !document.querySelector('[aria-busy="true"]'),
  )
  if (variant?.startsWith('theme='))
    await page.evaluate(
      (t) => document.documentElement.setAttribute('data-theme', t),
      variant.slice(6),
    )
  // as the prototypes do it (prototypes.css): rem-based type doubles
  if (variant === 'text=200')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
  await v.act?.(page)
  await page.waitForTimeout(400)
  await settleAnimations(page)
  return { page, errors }
}

// A context per page: a signed-in page holds the event stream open, and Chromium allows six
// HTTP/1.1 connections per host across a context (MDN, Server-sent events), so shared contexts stall.
async function sweep(visits: Visit[], context: () => Promise<BrowserContext>) {
  if (only !== 'keyboard') {
    const jobs = visits.flatMap((v) => WIDTHS.flatMap((w) => VARIANTS.map((q) => ({ v, w, q }))))
    await pool(jobs, 4, async ({ v, w, q }) => {
      try {
        const ctx = await context()
        try {
          const { page, errors } = await open(ctx, v, w, q)
          if (SHOTS && q === 'theme=default')
            await page.screenshot({
              path: join(SHOTS, `${v.name.replaceAll(/[^\w-]+/g, '_')}-${w}.png`),
            })
          const o = await overflow(page)
          const found = await axe(page)
          if (o > 0 || found.length || errors.length)
            problems.push(
              `${v.name} ${w} ${q}: ${o > 0 ? `overflow=${o} ` : ''}${[...found, ...errors].join(' ; ')}`,
            )
        } finally {
          await ctx.close()
        }
      } catch (e) {
        problems.push(`${v.name} ${w} ${q}: crashed: ${(e as Error).message.slice(0, 160)}`)
      }
    })
  }
  if (only !== 'pages') {
    const jobs = visits.filter((v) => !v.act).flatMap((v) => WIDTHS.map((w) => ({ v, w })))
    await pool(jobs, 3, async ({ v, w }) => {
      try {
        const ctx = await context()
        try {
          const { page } = await open(ctx, v, w)
          const { stops, bad } = await walk(page)
          if (bad.length)
            problems.push(
              `${v.name} ${w} keyboard (${stops} stops): ${bad.slice(0, 6).join(' ; ')}`,
            )
        } finally {
          await ctx.close()
        }
      } catch (e) {
        problems.push(`${v.name} ${w} keyboard: crashed: ${(e as Error).message.slice(0, 160)}`)
      }
    })
  }
}

const draft = (step: number) =>
  JSON.stringify({
    step,
    reached: 8,
    draft: {
      serverName: 'Harbor',
      owner: { displayName: 'Ines', username: 'ines' },
      folders: { movies: join(dataDir, 'movies'), downloads: join(dataDir, 'downloads') },
      remote: step === 6 ? 'reverse-proxy' : 'local-only',
      proxyUrl: 'https://movies.example.com',
      port: '8484',
      cloudLink: false,
    },
  })

try {
  // setup, each step, while there's no owner yet
  const steps = [
    'name',
    'owner',
    'metadata',
    'folders',
    'indexers',
    'subtitles',
    'remote',
    'cloud',
    'review',
  ]
  await sweep(
    steps.map((s, i) => ({ name: `setup:${s}`, path: '/setup', init: i ? draft(i) : undefined })),
    () => browser.newContext(),
  )
  await sweep(
    [
      {
        name: 'setup:picker',
        path: '/setup',
        init: draft(3),
        act: (p) => p.getByRole('button', { name: 'Browse' }).first().click(),
      },
    ],
    () => browser.newContext(),
  )

  // finish setup and seed what the pages show
  await api('POST', '/setup', {
    serverName: 'Harbor',
    owner: OWNER,
    folders: { movies: join(dataDir, 'movies'), downloads: join(dataDir, 'downloads') },
    remoteAccess: { kind: 'local-only' },
    cloudLink: false,
  })
  const device = { name: 'Sweep script', client: 'desktop', appVersion: '1.0.0' }
  const signedIn = await api<{ token: string }>('POST', '/auth/sign-in', {
    username: OWNER.username,
    password: OWNER.password,
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
  const path = (link: string) => new URL(link).pathname

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

  // signed out
  await sweep(
    [
      { name: 'login', path: '/login' },
      { name: 'login:oidc-error', path: '/login?error=oidc-denied' },
      { name: 'invite', path: path(invite.link) },
      { name: 'reset', path: path(reset.link) },
      { name: 'link:dead', path: '/invite/nothing-here' },
      { name: 'nowhere', path: '/no/such/page/outside' },
    ],
    () => browser.newContext(),
  )

  // signed in through the login page, once each; each page's context reuses the cookie
  async function signIn(username: string, password: string) {
    const login = await browser.newContext()
    const page = await login.newPage()
    await page.goto(`${BASE}/login`)
    await page.getByLabel('Username').fill(username)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(`${BASE}/`)
    const storageState = await login.storageState()
    await login.close()
    return () => browser.newContext({ storageState })
  }
  const ownerContext = await signIn(OWNER.username, OWNER.password)
  const tab = (name: string | RegExp) => (p: Page) => p.getByRole('tab', { name }).click()
  const customize = (p: Page) => p.getByRole('button', { name: 'Customize' }).click()
  await sweep(
    [
      { name: 'dashboard', path: '/' },
      { name: 'dashboard:customize', path: '/', act: customize },
      {
        name: 'dashboard:add',
        path: '/',
        act: async (p) => {
          await customize(p)
          await p.getByRole('button', { name: 'Remove Network' }).click()
          await p.getByRole('button', { name: 'Add widget' }).first().click()
        },
      },
      {
        name: 'palette',
        path: '/',
        act: async (p) => {
          await p.keyboard.press('ControlOrMeta+k')
        },
      },
      {
        name: 'account',
        path: '/',
        act: async (p) => {
          const menu = p.getByRole('button', { name: 'Menu' })
          if (await menu.isVisible()) await menu.click()
          await p
            .getByRole('link', { name: 'Your account' })
            .or(p.getByRole('button', { name: 'Your account' }))
            .first()
            .click()
        },
      },
      { name: 'settings', path: '/settings' },
      { name: 'settings:later', path: '/settings/backups' },
      { name: 'settings:general', path: '/settings/general' },
      { name: 'settings:media', path: '/settings/media' },
      { name: 'settings:profiles', path: '/settings/profiles' },
      { name: 'settings:quality', path: '/settings/quality' },
      { name: 'settings:vpn', path: '/settings/vpn' },
      {
        name: 'settings:vpn:container',
        path: '/settings/vpn',
        act: (p) => p.getByRole('radio', { name: /A VPN container/ }).click(),
      },
      {
        name: 'settings:vpn:connects',
        path: '/settings/vpn',
        act: (p) => p.getByRole('radio', { name: /highsea connects/ }).click(),
      },
      { name: 'settings:downloads', path: '/settings/downloads' },
      // 6b: the importers, and A17's library mode on the root folder seeded above
      { name: 'settings:migration', path: '/settings/migration' },
      // 8a: Import lists, Wanted and System's Tasks
      { name: 'settings:lists', path: '/settings/lists' },
      {
        name: 'settings:lists:add',
        path: '/settings/lists',
        act: (p) => p.getByRole('button', { name: 'Add a list' }).click(),
      },
      { name: 'wanted', path: '/wanted' },
      { name: 'wanted:cutoff', path: '/wanted/cutoff' },
      { name: 'wanted:calendar', path: '/wanted/calendar' },
      {
        name: 'import:library',
        path: `/activity/import?mode=library&root=${encodeURIComponent(join(dataDir, 'films'))}`,
      },
      // A7, A17 and A8 (checkpoint 6a)
      { name: 'activity', path: '/activity' },
      { name: 'activity:history', path: '/activity', act: tab('History') },
      { name: 'activity:blocklist', path: '/activity', act: tab(/Blocklist/) },
      { name: 'import', path: '/activity/import' },
      { name: 'downloads', path: '/downloads' },
      {
        name: 'downloads:sheet',
        path: '/downloads',
        act: (p) =>
          p
            .getByRole('button', { name: /Sintel/ })
            .first()
            .click(),
      },
      {
        name: 'downloads:add',
        path: '/downloads',
        act: (p) => p.getByRole('button', { name: 'Add torrent' }).click(),
      },
      {
        name: 'downloads:limits',
        path: '/downloads',
        act: (p) => p.getByRole('button', { name: 'Limits' }).click(),
      },
      { name: 'system', path: '/system' },
      { name: 'system:tasks', path: '/system/tasks' },
      // A10, with OpenSubtitles.com and Subdl signed in against their fakes
      { name: 'subtitles', path: '/subtitles' },
      { name: 'subtitles:providers', path: '/subtitles', act: tab('Providers') },
      {
        name: 'subtitles:provider-edit',
        path: '/subtitles',
        act: async (p) => {
          await tab('Providers')(p)
          await p.getByRole('button', { name: 'Edit Subdl' }).click()
        },
      },
      { name: 'subtitles:languages', path: '/subtitles', act: tab('Languages') },
      {
        name: 'subtitles:profile',
        path: '/subtitles',
        act: async (p) => {
          await tab('Languages')(p)
          await p
            .getByRole('button', { name: /^Edit / })
            .first()
            .click()
        },
      },
      { name: 'subtitles:scoring', path: '/subtitles', act: tab('Scoring and sync') },
      // A9, with a Local public indexer and a private one against the fake indexer
      { name: 'indexers', path: '/indexers' },
      { name: 'indexers:catalog', path: '/indexers', act: tab('Catalog') },
      {
        name: 'indexers:changes',
        path: '/indexers',
        act: (p) => p.getByRole('button', { name: 'What changed' }).click(),
      },
      {
        name: 'indexers:setup',
        path: '/indexers',
        act: async (p) => {
          await tab('Catalog')(p)
          await p.getByRole('button', { name: 'Set up Torrent feed' }).click()
        },
      },
      {
        name: 'indexers:edit',
        path: '/indexers',
        act: async (p) => {
          await p.getByRole('button', { name: 'More for Torznab' }).click()
          await p.getByRole('menuitem', { name: 'Edit' }).click()
        },
      },
      { name: 'users', path: '/settings/users' },
      { name: 'users:devices', path: '/settings/users', act: tab('Devices') },
      { name: 'users:keys', path: '/settings/users', act: tab('API keys') },
      {
        name: 'users:invite',
        path: '/settings/users',
        act: (p) => p.getByRole('button', { name: 'Invite someone' }).click(),
      },
      {
        name: 'users:edit',
        path: '/settings/users',
        act: (p) => p.getByRole('button', { name: 'Edit Theo' }).click(),
      },
      { name: 'appearance', path: '/settings/appearance' },
      {
        name: 'appearance:theme',
        path: '/settings/appearance',
        act: (p) => p.getByRole('button', { name: 'New theme' }).click(),
      },
      {
        name: 'appearance:unsaved',
        path: '/settings/appearance',
        act: (p) => p.getByLabel('Name', { exact: true }).fill('Lighthouse'),
      },
      { name: 'discover', path: '/discover' },
      { name: 'discover:popular', path: '/discover?list=popular' },
      { name: 'discover:search', path: '/discover?q=sintel' },
      { name: 'discover:nothing', path: '/discover?q=no-recording-here' },
      {
        name: 'discover:add',
        path: '/discover',
        act: (p) => p.getByRole('button', { name: /^Add / }).first().click(),
      },
      { name: 'movies', path: '/movies' },
      { name: 'movies:wanted', path: '/movies?status=wanted&sort=added' },
      { name: 'movies:none', path: '/movies?title=zzz' },
      {
        name: 'movies:table',
        path: '/movies',
        act: (p) => p.getByRole('radio', { name: 'Table' }).click(),
      },
      {
        name: 'movies:select',
        path: '/movies',
        act: async (p) => {
          await p.getByRole('radio', { name: 'Table' }).click()
          await p.getByRole('checkbox').nth(1).check()
        },
      },
      // A6 in the library (two versions, then one not released yet), people and collections
      { name: 'movie:library', path: '/movies/45745' },
      { name: 'movie:files', path: '/movies/45745', act: tab('Files') },
      { name: 'movie:search', path: '/movies/45745', act: tab('Search') },
      { name: 'movie:history', path: '/movies/45745', act: tab('History') },
      // Synced, with the release's track and the clip's forced stream
      { name: 'movie:subtitles', path: '/movies/45745', act: tab('Subtitles') },
      // a downloaded track under the minimum confidence: Not synced, with its confidence
      { name: 'movie:subtitles:unsynced', path: '/movies/653', act: tab('Subtitles') },
      {
        name: 'movie:subtitles:results',
        path: '/movies/45745',
        act: async (p) => {
          await tab('Subtitles')(p)
          await p.getByRole('button', { name: 'Search providers' }).click()
          // Use's accessible name says what it downloads
          await p
            .getByRole('button', { name: /^Download .+ from / })
            .first()
            .waitFor()
        },
      },
      { name: 'movie:upcoming', path: '/movies/1117898' },
      // and from the recorded TMDB fixtures, not in the library
      { name: 'movie:not-added', path: '/movies/19' },
      { name: 'movie:cast', path: '/movies/19', act: tab('Cast and crew') },
      { name: 'movie:collection', path: '/movies/969681' },
      { name: 'movie:unknown', path: '/movies/999999999' },
      { name: 'person', path: '/people/68' },
      { name: 'collection', path: '/collections/531241' },
      { name: 'not-found', path: '/wanted' },
      { name: 'pair', path: '/link' },
      { name: 'pair:confirm', path: `/link?code=${pairing.code}` },
    ],
    ownerContext,
  )

  // an admin: the same admin, People read-only (ADR 0032)
  await sweep(
    [
      { name: 'admin:dashboard', path: '/' },
      { name: 'admin:settings', path: '/settings' },
      { name: 'admin:general', path: '/settings/general' },
      // Security and Backups are the owner's: not there for an admin
      { name: 'admin:security', path: '/settings/security' },
      // Migration is the owner's too (6b)
      { name: 'admin:migration', path: '/settings/migration' },
      { name: 'admin:users', path: '/settings/users' },
      { name: 'admin:users:devices', path: '/settings/users', act: tab('Devices') },
      { name: 'admin:users:keys', path: '/settings/users', act: tab('API keys') },
      { name: 'admin:movies', path: '/movies' },
      { name: 'admin:movie', path: '/movies/45745' },
      { name: 'admin:discover', path: '/discover' },
      { name: 'admin:activity', path: '/activity' },
      { name: 'admin:downloads', path: '/downloads' },
      // Settings › VPN and Download client are the owner's: not there for an admin
      { name: 'admin:vpn', path: '/settings/vpn' },
    ],
    await signIn('ruth', 'ruth ruth ruth'),
  )

  // a user: the refusal page at every admin address, and nothing else
  const refused = (p: Page) =>
    p.getByRole('heading', { name: 'This is where the server’s owner and admins run it' }).waitFor()
  await sweep(
    [
      { name: 'user:refusal', path: '/' },
      ...[
        '/',
        '/settings/users',
        '/movies',
        '/movies/45745',
        '/discover',
        '/system',
        '/people/68',
        '/activity',
        '/downloads',
      ].map((path) => ({ name: `user:${path}`, path, act: refused })),
    ],
    await signIn('theo', 'theo theo theo'),
  )
} finally {
  await browser.close()
  stop()
}

console.log(problems.length ? problems.sort().join('\n') : 'clean: the server’s admin pages')
process.exit(problems.length ? 1 : 0)
