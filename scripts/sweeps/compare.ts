// SPDX-License-Identifier: AGPL-3.0-only
// The full review against the prototypes (checkpoint 9c): every admin screen in the prototype's
// state beside the server's, at 1440 and 390 in the default theme, for the owner to compare by eye.
// Boots the seeded server (seeded.ts) from the production build, captures setup before an owner
// exists, then seeds it and captures the rest; the prototypes come from `bun run prototypes`,
// started here if nothing answers on :4500. Writes the pairs, index.html (side by side) and
// checklist.md (the same order, one box a pair) to a folder outside the repository.
// Usage: bun scripts/sweeps/compare.ts [folder]   (COMPARE_DEV=1: Next's dev server, no build)
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright-core'
import {
  acknowledge,
  BASE,
  heightFor,
  launch,
  pool,
  ROOT,
  screenUrl,
  settleAnimations,
} from './lib.ts'
import { boot, seed } from './seeded.ts'

const PORT = Number(process.env.COMPARE_PORT ?? 3160)
const WIDTHS = [1440, 390]
/** Long pages are cut here: the top of a page is what differs, and a library's grid is long. */
const MAX_HEIGHT = 4000
const OWNER = { username: 'compare', displayName: 'Ines', password: 'compare compare compare' }
const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'highsea-compare-'))
mkdirSync(out, { recursive: true })

type Side = {
  /** The prototype's route (`/admin/...`) or the server's path. */
  path: string
  /** What to do once the page is up: a tab, a dialog. Shared by both sides unless one has its own. */
  act?: (page: Page) => Promise<void>
  /** The setup draft, for the step it opens on. */
  setup?: string
}
type Pair = {
  /** The matrix's row (phase-3-checkpoint-9.md › The full review against the prototypes). */
  screen: string
  name: string
  prototype: Side | null
  server: Side | null
  /** A difference already known, and where it was decided. */
  note?: string
}
type Shots = Record<number, { prototype?: string; server?: string }>

const tab = (name: string | RegExp) => (p: Page) => p.getByRole('tab', { name }).first().click()
const button = (name: string | RegExp) => (p: Page) =>
  p
    .getByRole('button', { name, exact: typeof name === 'string' })
    .first()
    .click()
const both = (proto: string, server: string, act?: Side['act']) => ({
  prototype: { path: proto, act },
  server: { path: server, act },
})

// ---------------------------------------------------------------- setup's steps

const SERVER_STEPS = [
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
const PROTO_STEPS = SERVER_STEPS.filter((s) => s !== 'metadata')
const folders = { movies: '/data/media/movies', downloads: '/data/downloads' }
const owner = { displayName: OWNER.displayName, username: 'ines' }
const draft = {
  serverName: 'Harbor',
  folders,
  remote: 'local-only',
  proxyUrl: '',
  port: '8484',
  cloudLink: false,
}
const serverSetup = (id: string) => {
  const step = SERVER_STEPS.indexOf(id)
  return step
    ? JSON.stringify({ step, reached: SERVER_STEPS.length - 1, draft: { ...draft, owner } })
    : undefined
}
const protoSetup = (id: string) =>
  JSON.stringify({
    step: PROTO_STEPS.indexOf(id),
    reached: PROTO_STEPS.length - 1,
    draft: {
      ...draft,
      owner: { ...owner, password: '', confirm: '' },
      indexers: [],
      subtitleLanguages: ['en'],
    },
    indexersSeeded: true,
  })
const setupPairs: Pair[] = SERVER_STEPS.map((id) => ({
  screen: 'A2 Setup',
  name: `setup: ${id}`,
  prototype: PROTO_STEPS.includes(id) ? { path: '/admin/setup', setup: protoSetup(id) } : null,
  server: { path: '/setup', setup: serverSetup(id) },
  note:
    id === 'metadata'
      ? 'The TMDB key step (Phase 3 decision 4, setup.md), built at checkpoint 4; the prototype’s setup has no step for it.'
      : undefined,
}))

// ---------------------------------------------------------------- the rest, by the matrix's rows

function pairs(ids: Awaited<ReturnType<typeof seed>>): { signedOut: Pair[]; owner: Pair[] } {
  const path = (link: string) => new URL(link).pathname
  return {
    signedOut: [
      { screen: 'A18 Login', name: 'sign in', ...both('/admin/login', '/login') },
      {
        screen: 'A18 Login',
        name: 'invite',
        prototype: null,
        server: { path: path(ids.invite.link) },
        note: 'Built at checkpoint 2 from login.md and users-devices.md; the prototype has the sign-in card only.',
      },
      {
        screen: 'A18 Login',
        name: 'password reset',
        prototype: null,
        server: { path: path(ids.reset.link) },
        note: 'Built at checkpoint 2 from login.md and users-devices.md; the prototype has the sign-in card only.',
      },
    ],
    owner: [
      {
        screen: 'A1 Shell',
        name: 'command palette',
        ...both('/admin', '/', (p) => p.keyboard.press('ControlOrMeta+k')),
      },
      {
        screen: 'A18 Login',
        name: 'pair a device',
        prototype: null,
        server: { path: `/link?code=${ids.pairing.code}` },
        note: 'Built at checkpoint 2 from users-devices.md and connectivity.md (pairing a TV).',
      },
      { screen: 'A3 Dashboard', name: 'dashboard', ...both('/admin', '/') },
      { screen: 'A3 Dashboard', name: 'customize', ...both('/admin', '/', button('Customize')) },
      { screen: 'A4 Discover', name: 'discover', ...both('/admin/discover', '/discover') },
      {
        screen: 'A4 Discover',
        name: 'search',
        prototype: {
          path: '/admin/discover',
          act: (p) => p.getByLabel('Search for a movie').fill('sintel'),
        },
        server: { path: '/discover?q=sintel' },
      },
      {
        screen: 'A4 Discover',
        name: 'add dialog',
        ...both('/admin/discover', '/discover', button(/^Add /)),
      },
      { screen: 'A5 Movies', name: 'library', ...both('/admin/movies', '/movies') },
      {
        screen: 'A5 Movies',
        name: 'table',
        ...both('/admin/movies', '/movies', (p) => p.getByRole('radio', { name: 'Table' }).click()),
      },
      {
        screen: 'A6 Movie detail',
        name: 'in the library',
        ...both('/admin/movies/1', '/movies/45745'),
      },
      {
        screen: 'A6 Movie detail',
        name: 'files',
        ...both('/admin/movies/1', '/movies/45745', tab('Files')),
      },
      {
        screen: 'A6 Movie detail',
        name: 'history',
        ...both('/admin/movies/1', '/movies/45745', tab('History')),
      },
      {
        screen: 'A6 Movie detail',
        name: 'search',
        ...both('/admin/movies/1', '/movies/45745', tab('Search')),
      },
      {
        screen: 'A6 Movie detail',
        name: 'subtitles',
        ...both('/admin/movies/1', '/movies/45745', tab('Subtitles')),
      },
      { screen: 'A6 Movie detail', name: 'not added', ...both('/admin/movies/107', '/movies/19') },
      {
        screen: 'A6 Movie detail',
        name: 'cast and crew',
        ...both('/admin/movies/107', '/movies/19', tab('Cast and crew')),
      },
      {
        screen: 'A6 Movie detail',
        name: 'person',
        ...both('/admin/people/fritz-lang', '/people/68'),
      },
      {
        screen: 'A6 Movie detail',
        name: 'TMDB collection',
        prototype: null,
        server: { path: '/collections/531241' },
        note: 'In the prototype /collections/:id is the smart collections’ editor (8d), so TMDB’s collection page, built at checkpoint 4, has no route there to compare.',
      },
      {
        screen: 'A6 Movie detail',
        name: 'not found',
        ...both('/admin/movies/nowhere', '/movies/999999999'),
      },
      { screen: 'A7 Activity', name: 'queue', ...both('/admin/activity', '/activity') },
      {
        screen: 'A7 Activity',
        name: 'history',
        ...both('/admin/activity', '/activity', tab('History')),
      },
      {
        screen: 'A7 Activity',
        name: 'blocklist',
        ...both('/admin/activity', '/activity', tab(/Blocklist/)),
      },
      {
        screen: 'A17 Manual import',
        name: 'manual import',
        ...both('/admin/activity/import', '/activity/import'),
      },
      { screen: 'A8 Downloads', name: 'downloads', ...both('/admin/downloads', '/downloads') },
      {
        screen: 'A8 Downloads',
        name: 'add torrent',
        ...both('/admin/downloads', '/downloads', button('Add torrent')),
      },
      { screen: 'A9 Indexers', name: 'installed', ...both('/admin/indexers', '/indexers') },
      {
        screen: 'A9 Indexers',
        name: 'catalog',
        ...both('/admin/indexers', '/indexers', tab('Catalog')),
      },
      {
        screen: 'A9 Indexers',
        name: 'what changed',
        ...both('/admin/indexers', '/indexers', button('What changed')),
      },
      { screen: 'A10 Subtitles', name: 'wanted', ...both('/admin/subtitles', '/subtitles') },
      {
        screen: 'A10 Subtitles',
        name: 'providers',
        ...both('/admin/subtitles', '/subtitles', tab('Providers')),
      },
      {
        screen: 'A10 Subtitles',
        name: 'languages',
        ...both('/admin/subtitles', '/subtitles', tab('Languages')),
      },
      {
        screen: 'A10 Subtitles',
        name: 'scoring and sync',
        ...both('/admin/subtitles', '/subtitles', tab('Scoring and sync')),
      },
      { screen: 'A11 Curation', name: 'announcements', ...both('/admin/curation', '/curation') },
      {
        screen: 'A11 Curation',
        name: 'featured sections',
        ...both('/admin/curation/featured', '/curation/featured'),
      },
      {
        screen: 'A11 Curation',
        name: 'announcement',
        ...both(
          '/admin/curation/announcements/an-movie-night',
          `/curation/announcements/${ids.notice.id}`,
        ),
      },
      {
        screen: 'A11 Curation',
        name: 'new announcement',
        ...both('/admin/curation/announcements/new', '/curation/announcements/new'),
      },
      {
        screen: 'A11 Curation',
        name: 'section',
        ...both('/admin/curation/featured/fs-staff', `/curation/featured/${ids.picks.id}`),
      },
      {
        screen: 'A11 Curation',
        name: 'new section',
        ...both('/admin/curation/featured/new', '/curation/featured/new'),
      },
      {
        screen: 'A12 Appearance',
        name: 'appearance',
        ...both('/admin/settings/appearance', '/settings/appearance'),
      },
      {
        screen: 'A12 Appearance',
        name: 'new theme',
        ...both('/admin/settings/appearance', '/settings/appearance', button('New theme')),
      },
      {
        screen: 'A13 Users and devices',
        name: 'people',
        ...both('/admin/settings/users', '/settings/users'),
      },
      {
        screen: 'A13 Users and devices',
        name: 'devices',
        ...both('/admin/settings/users', '/settings/users', tab('Devices')),
      },
      {
        screen: 'A13 Users and devices',
        name: 'API keys',
        ...both('/admin/settings/users', '/settings/users', tab('API keys')),
      },
      {
        screen: 'A13 Users and devices',
        name: 'invite',
        ...both('/admin/settings/users', '/settings/users', button('Invite someone')),
      },
      { screen: 'A14 Wanted and calendar', name: 'missing', ...both('/admin/wanted', '/wanted') },
      {
        screen: 'A14 Wanted and calendar',
        name: 'cutoff',
        ...both('/admin/wanted/cutoff', '/wanted/cutoff'),
      },
      {
        screen: 'A14 Wanted and calendar',
        name: 'calendar',
        ...both('/admin/wanted/calendar', '/wanted/calendar'),
      },
      { screen: 'A15 Settings', name: 'index', ...both('/admin/settings', '/settings') },
      ...(
        [
          'general',
          'network',
          'security',
          'backups',
          'media',
          'profiles',
          'quality',
          'lists',
          'vpn',
          'downloads',
          'connections',
        ] as const
      ).map((area) => ({
        screen: 'A15 Settings',
        name: area,
        ...both(`/admin/settings/${area}`, `/settings/${area}`),
      })),
      {
        screen: 'A15 Settings',
        name: 'profile editor',
        ...both('/admin/settings/profiles/qp-hd', '/settings/profiles/qp-hd'),
      },
      {
        screen: 'A15 Settings',
        name: 'new profile',
        ...both('/admin/settings/profiles/new', '/settings/profiles/new'),
      },
      {
        screen: 'A15 Settings',
        name: 'format editor',
        prototype: { path: '/admin/settings/profiles/formats/cf-dv' },
        server: { path: '/settings/profiles/formats/cf-x265' },
        note: 'Each side’s own seeded format: Dolby Vision in the prototype, x265 on the server.',
      },
      {
        screen: 'A15 Settings',
        name: 'sizes',
        ...both('/admin/settings/quality/sizes', '/settings/quality/sizes'),
      },
      {
        screen: 'A15 Settings',
        name: 'add a list',
        prototype: { path: '/admin/settings/lists' },
        server: { path: '/settings/lists', act: button('Add a list') },
        note: 'The prototype’s Add a list is a placeholder (Soon); the dialog was built at checkpoint 8a from settings.md › Import lists.',
      },
      {
        screen: 'A15 Settings',
        name: 'migration',
        prototype: null,
        server: { path: '/settings/migration' },
        note: 'Built at checkpoint 6b (ADR 0041, settings.md); the prototype has no Migration area.',
      },
      { screen: 'A16 System', name: 'status', ...both('/admin/system', '/system') },
      ...(['health', 'tasks', 'logs', 'events', 'backups', 'updates'] as const).map((t) => ({
        screen: 'A16 System',
        name: t,
        ...both(`/admin/system/${t}`, `/system/${t}`),
      })),
      {
        screen: 'A19 Collections',
        name: 'collections',
        ...both('/admin/collections', '/collections'),
      },
      {
        screen: 'A19 Collections',
        name: 'new',
        ...both('/admin/collections/new', '/collections/new'),
      },
      {
        screen: 'A19 Collections',
        name: 'rules',
        ...both('/admin/collections/sc-2010s', `/collections/${ids.decade.id}`),
      },
      {
        screen: 'A19 Collections',
        name: 'picked by hand',
        ...both('/admin/collections/sc-staff', `/collections/${ids.handPicked.id}`),
      },
      { screen: 'A1 Shell', name: 'not found', ...both('/admin/nowhere', '/no/such/page') },
    ],
  }
}

// ---------------------------------------------------------------- capturing

const browser = await launch()
const done: {
  pair: Pair
  index: number
  shots: Shots
  problems: string[]
}[] = []
let next = 0

async function shot(page: Page, file: string) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  const width = page.viewportSize()?.width ?? 1440
  await page.screenshot({
    path: join(out, file),
    fullPage: true,
    clip: { x: 0, y: 0, width, height: Math.min(height, MAX_HEIGHT) },
  })
}

async function capturePrototype(side: Side, width: number, file: string) {
  const page = await browser.newPage({ viewport: { width, height: heightFor(width) } })
  try {
    await page.addInitScript((setup) => {
      localStorage.clear()
      if (setup) localStorage.setItem('highsea-proto:setup', setup)
    }, side.setup ?? '')
    await page.goto(screenUrl(side.path))
    await page.waitForTimeout(1500)
    await acknowledge(page)
    await side.act?.(page)
    await page.waitForTimeout(400)
    await settleAnimations(page)
    await shot(page, file)
  } finally {
    await page.close()
  }
}

async function captureServer(
  context: () => Promise<BrowserContext>,
  base: string,
  side: Side,
  width: number,
  file: string,
) {
  const ctx = await context()
  try {
    const page = await ctx.newPage()
    await page.setViewportSize({ width, height: heightFor(width) })
    await page.addInitScript((setup) => {
      localStorage.clear()
      if (setup) localStorage.setItem('highsea:setup', setup)
    }, side.setup ?? '')
    await page.goto(`${base}${side.path}`)
    // ready, as the sweep has it: hydrated, and nothing aria-busy
    await page.waitForFunction(
      () =>
        Object.keys(document.documentElement).some((k) => k.startsWith('__reactProps$')) &&
        !document.querySelector('[aria-busy="true"]'),
    )
    await side.act?.(page)
    await page.waitForTimeout(400)
    await settleAnimations(page)
    await shot(page, file)
  } finally {
    await ctx.close()
  }
}

async function capture(list: Pair[], context: () => Promise<BrowserContext>, base: string) {
  const entries = list.map((pair) => ({
    pair,
    index: ++next,
    shots: {} as Shots,
    problems: [] as string[],
  }))
  done.push(...entries)
  const jobs = entries.flatMap((e) =>
    WIDTHS.flatMap((w) => (['prototype', 'server'] as const).map((s) => ({ e, w, s }))),
  )
  await pool(jobs, 4, async ({ e, w, s }) => {
    const side = e.pair[s]
    if (!side) return
    const file = `${String(e.index).padStart(3, '0')}-${e.pair.name.replaceAll(/[^\w]+/g, '-')}-${w}-${s}.png`
    try {
      if (s === 'prototype') await capturePrototype(side, w, file)
      else await captureServer(context, base, side, w, file)
      e.shots[w] = { ...e.shots[w], [s]: file }
    } catch (err) {
      e.problems.push(`${s} at ${w}: ${(err as Error).message.split('\n')[0]?.slice(0, 160)}`)
    }
  })
}

// the prototypes, unless they're already up
let prototypes: ChildProcess | null = null
const up = () =>
  fetch(`${BASE}/index.html`).then(
    (r) => r.ok,
    () => false,
  )
if (!(await up())) {
  prototypes = spawn('bun', ['run', 'prototypes'], { cwd: ROOT, stdio: 'ignore', detached: true })
  for (let i = 0; !(await up()); i++) {
    if (i > 60) throw new Error(`The prototypes didn’t start on ${BASE}`)
    await Bun.sleep(500)
  }
}

const production = process.env.COMPARE_DEV !== '1'
if (production)
  execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
const server = await boot(PORT, { production })
try {
  await capture(setupPairs, () => browser.newContext(), server.base)
  const ids = await seed(server, OWNER, 'Compare script')
  const list = pairs(ids)
  await capture(list.signedOut, () => browser.newContext(), server.base)
  // signed in through the login page once; each page's context reuses the cookie
  const login = await browser.newContext()
  const page = await login.newPage()
  await page.goto(`${server.base}/login`)
  await page.getByLabel('Username').fill(OWNER.username)
  await page.getByLabel('Password').fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(`${server.base}/`)
  const storageState = await login.storageState()
  await login.close()
  await capture(list.owner, () => browser.newContext({ storageState }), server.base)
} finally {
  await browser.close()
  await server.stop()
  if (prototypes?.pid) process.kill(-prototypes.pid, 'SIGTERM')
}

// ---------------------------------------------------------------- the review's pages

done.sort((a, b) => a.index - b.index)
const html = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const where = (side: Side | null) => (side ? `\`${side.path}\`` : 'none')
const order = done.map((d, i) => ({ ...d, n: String(i + 1).padStart(3, '0') }))

writeFileSync(
  join(out, 'checklist.md'),
  [
    '# The full review against the prototypes',
    '',
    `Captured ${new Date().toISOString().slice(0, 10)} by \`scripts/sweeps/compare.ts\`: the prototype on the left, the server from its production build on the right, at ${WIDTHS.join(' and ')} in the default theme. Each difference is a change real data forced (already in a checkpoint report), or a finding to fix in 9c or keep as a known difference.`,
    '',
    ...order.flatMap((d, i) => [
      ...(i === 0 || order[i - 1]?.pair.screen !== d.pair.screen
        ? ['', `## ${d.pair.screen}`, '']
        : []),
      `- [ ] **${d.n} ${d.pair.name}**: prototype ${where(d.pair.prototype)}, server ${where(d.pair.server)}${d.pair.note ? `. ${d.pair.note}` : ''}${d.problems.length ? `. Not captured: ${d.problems.join('; ')}` : ''}`,
    ]),
    '',
  ].join('\n'),
)

writeFileSync(
  join(out, 'index.html'),
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Prototype and server</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 24px; background: #111; color: #ddd }
  section { margin: 0 0 48px } h2 { margin: 32px 0 4px; font-size: 18px } p { margin: 4px 0; color: #aaa }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; align-items: start }
  .narrow { grid-template-columns: repeat(2, minmax(0, 390px)) }
  figure { margin: 0 } figcaption { color: #888; font-size: 12px; margin-bottom: 4px }
  img { max-width: 100%; border: 1px solid #333 } .none { padding: 24px; border: 1px dashed #444; color: #777 }
</style></head><body>
<h1>Prototype and server</h1>
${order
  .map(
    (d) => `<section id="p${d.n}">
<h2>${d.n} · ${html(d.pair.screen)} · ${html(d.pair.name)}</h2>
${d.pair.note ? `<p>${html(d.pair.note)}</p>` : ''}${d.problems.map((p) => `<p>Not captured: ${html(p)}</p>`).join('')}
${WIDTHS.map((w) => {
  const s = d.shots[w] ?? {}
  const fig = (label: string, file?: string, side?: Side | null) =>
    `<figure><figcaption>${label} · ${w} · ${html(side?.path ?? 'none')}</figcaption>${file ? `<img src="${file}" loading="lazy" alt="${label} at ${w}">` : '<div class="none">Nothing to show</div>'}</figure>`
  return `<div class="row${w < 768 ? ' narrow' : ''}">${fig('Prototype', s.prototype, d.pair.prototype)}${fig('Server', s.server, d.pair.server)}</div>`
}).join('\n')}
</section>`,
  )
  .join('\n')}
</body></html>
`,
)

const failed = done.filter((d) => d.problems.length)
console.log(`${done.length} pairs in ${out} (index.html, checklist.md)`)
for (const d of failed)
  console.log(`not captured: ${d.pair.screen} ${d.pair.name}: ${d.problems.join('; ')}`)
process.exit(0)
