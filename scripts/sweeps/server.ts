// SPDX-License-Identifier: AGPL-3.0-only
// The server's admin pages (Phase 3): the same checks as the prototype sweeps, on the real thing.
// Boots a throwaway server on its own folders, sweeps setup, finishes it through the API, seeds
// people, keys, a custom theme and a waiting TV, then visits every admin page signed out, as the
// owner and as an admin, and as a user, who gets the refusal page at every address (ADR 0032): axe,
// overflow and page errors in three themes, at 200% text and with reduced motion, then the
// keyboard walk. TMDB answers from the recordings in packages/metadata (HIGHSEA_TMDB_REPLAY), and
// the library is seeded from them through the API. Usage: bun scripts/sweeps/server.ts [pages|keyboard]
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

// ---------------------------------------------------------------- the server

const dir = mkdtempSync(join(tmpdir(), 'highsea-sweep-'))
const dataDir = join(dir, 'data')
for (const d of ['movies', 'downloads']) mkdirSync(join(dataDir, d), { recursive: true })
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
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})
const stop = () => {
  server.kill('SIGTERM')
  rmSync(dir, { recursive: true, force: true })
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
    reached: 6,
    draft: {
      serverName: 'Harbor',
      owner: { displayName: 'Ines', username: 'ines' },
      folders: { movies: join(dataDir, 'movies'), downloads: join(dataDir, 'downloads') },
      remote: step === 4 ? 'reverse-proxy' : 'local-only',
      proxyUrl: 'https://movies.example.com',
      port: '8484',
      cloudLink: false,
    },
  })

try {
  // setup, each step, while there's no owner yet
  const steps = ['name', 'owner', 'metadata', 'folders', 'remote', 'cloud', 'review']
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
      { tmdbId, rootFolder: movies, monitored: true, minimumAvailability: 'released', versions },
      token,
    )
  await add(45745, [
    { label: '4K HDR', qualityProfileId: 'qp-uhd' },
    { label: '1080p', qualityProfileId: 'qp-hd' },
  ])
  for (const id of [10378, 133701, 9761, 653, 832, 1117898]) await add(id)
  await api('PATCH', '/movies/832', { monitored: false }, token)

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
  const tab = (name: string) => (p: Page) => p.getByRole('tab', { name }).click()
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
      { name: 'system', path: '/system' },
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
      { name: 'admin:users', path: '/settings/users' },
      { name: 'admin:users:devices', path: '/settings/users', act: tab('Devices') },
      { name: 'admin:users:keys', path: '/settings/users', act: tab('API keys') },
      { name: 'admin:movies', path: '/movies' },
      { name: 'admin:movie', path: '/movies/45745' },
      { name: 'admin:discover', path: '/discover' },
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
