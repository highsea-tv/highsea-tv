// SPDX-License-Identifier: AGPL-3.0-only
// The server's admin pages (Phase 3): the same checks as the prototype sweeps, on the real thing.
// Boots a throwaway server (seeded.ts), sweeps setup, finishes it and seeds the admin through the
// API, then visits every admin page signed out, as the owner and as an admin, and as a user, who
// gets the refusal page at every address (ADR 0032): axe, overflow and page errors in three themes,
// at 200% text and with reduced motion, then the keyboard walk.
// Usage: bun scripts/sweeps/server.ts [pages|keyboard]
import { join } from 'node:path'
import type { BrowserContext, Page } from 'playwright-core'
import { axe, heightFor, launch, overflow, pool, settleAnimations, walk } from './lib.ts'
import { boot, seed } from './seeded.ts'

const only = process.argv[2] as 'pages' | 'keyboard' | undefined
const PORT = Number(process.env.SWEEP_PORT ?? 3150)
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

const server = await boot(PORT)
const { base: BASE, dataDir, stop } = server
const path = (link: string) => new URL(link).pathname

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
  const { invite, reset, pairing, notice, picks, drawsOn, decade, handPicked, nothingYet } =
    await seed(server, OWNER, 'Sweep script')

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
      { name: 'settings:general', path: '/settings/general' },
      { name: 'settings:media', path: '/settings/media' },
      // 8c: Settings › Media management's Tags, with its Rename and Remove dialogs
      {
        name: 'settings:media:tag-rename',
        path: '/settings/media',
        act: (p) => p.getByRole('button', { name: 'Rename Kids' }).click(),
      },
      {
        name: 'settings:media:tag-remove',
        path: '/settings/media',
        act: (p) => p.getByRole('button', { name: 'Remove Kids' }).click(),
      },
      { name: 'settings:profiles', path: '/settings/profiles' },
      { name: 'settings:quality', path: '/settings/quality' },
      // 8c: the profile, format and size editors (the seeded HD 1080p and x265 presets)
      { name: 'settings:profiles:edit', path: '/settings/profiles/qp-hd' },
      {
        // A row grouped through its menu, as the Torznab entry does: an open Radix menu hides the
        // page behind it with aria-hidden, which axe reads as hidden focusable content
        name: 'settings:profiles:edit:grouped',
        path: '/settings/profiles/qp-hd',
        act: async (p) => {
          await p.getByRole('button', { name: 'More for WEB 1080p' }).click()
          await p.getByRole('menuitem', { name: 'Group with the one below' }).click()
        },
      },
      { name: 'settings:profiles:new', path: '/settings/profiles/new' },
      {
        name: 'settings:profiles:delete',
        path: '/settings/profiles/qp-hd',
        act: (p) => p.getByRole('button', { name: 'Delete' }).click(),
      },
      { name: 'settings:formats:edit', path: '/settings/profiles/formats/cf-x265' },
      { name: 'settings:formats:new', path: '/settings/profiles/formats/new' },
      { name: 'settings:quality:sizes', path: '/settings/quality/sizes' },
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
      // 8b: Network and remote access, and Security
      { name: 'settings:network', path: '/settings/network' },
      { name: 'settings:security', path: '/settings/security' },
      // 8b: General's Region, Updates and Diagnostics, and Backups
      { name: 'settings:backups', path: '/settings/backups' },
      // 8b: Connections, and its Add a connection dialog
      { name: 'settings:connections', path: '/settings/connections' },
      {
        name: 'settings:connections:add',
        path: '/settings/connections',
        act: (p) => p.getByRole('button', { name: 'Discord', exact: true }).click(),
      },
      { name: 'wanted', path: '/wanted' },
      { name: 'wanted:cutoff', path: '/wanted/cutoff' },
      { name: 'wanted:calendar', path: '/wanted/calendar' },
      // 8c: A11 Curation, both composers new and saved
      { name: 'curation', path: '/curation' },
      { name: 'curation:featured', path: '/curation/featured' },
      { name: 'curation:announcement:new', path: '/curation/announcements/new' },
      { name: 'curation:announcement:edit', path: `/curation/announcements/${notice.id}` },
      { name: 'curation:section:new', path: '/curation/featured/new' },
      { name: 'curation:section:edit', path: `/curation/featured/${picks.id}` },
      { name: 'curation:section:collection', path: `/curation/featured/${drawsOn.id}` },
      // 8d: A19 Collections, the editor with rules and a group, picked by hand, and empty
      { name: 'collections', path: '/collections' },
      { name: 'collections:new', path: '/collections/new' },
      { name: 'collections:edit', path: `/collections/${decade.id}` },
      { name: 'collections:edit:picked', path: `/collections/${handPicked.id}` },
      { name: 'collections:edit:empty', path: `/collections/${nothingYet.id}` },
      {
        // the field menu's groups, through a choice rather than left open (see above)
        name: 'collections:edit:composer',
        path: `/collections/${decade.id}`,
        act: async (p) => {
          await p.getByRole('combobox', { name: 'Condition 1: field' }).click()
          await p.getByRole('option', { name: 'Composer' }).click()
        },
      },
      {
        name: 'collections:delete',
        path: '/collections',
        act: (p) => p.getByRole('button', { name: 'Delete Blender picks' }).click(),
      },
      {
        // a section draws on it, so the server refuses and the toast says which
        name: 'collections:delete:in-use',
        path: '/collections',
        act: async (p) => {
          await p.getByRole('button', { name: 'Delete Blender picks' }).click()
          await p.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
          await p.getByText('Couldn’t delete the collection').first().waitFor()
        },
      },
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
      { name: 'system:health', path: '/system/health' },
      { name: 'system:tasks', path: '/system/tasks' },
      // 8b: Status (above), Logs, Events, Backups and Updates
      { name: 'system:logs', path: '/system/logs' },
      { name: 'system:events', path: '/system/events' },
      { name: 'system:backups', path: '/system/backups' },
      {
        name: 'system:backups:restore',
        path: '/system/backups',
        act: async (p) => {
          // a backup to restore, then the dialog that explains the restart
          await p.getByRole('button', { name: 'Back up now' }).click()
          // the "Backup made" toast would sit under the dialog's overlay, which axe misreads
          await p.getByRole('button', { name: 'Dismiss' }).click()
          await p
            .getByRole('button', { name: /^Restore the backup from/ })
            .first()
            .click()
        },
      },
      { name: 'system:updates', path: '/system/updates' },
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
      { name: 'admin:backups', path: '/settings/backups' },
      // System without its Backups tab, which is not found
      { name: 'admin:system', path: '/system' },
      { name: 'admin:system:backups', path: '/system/backups' },
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
