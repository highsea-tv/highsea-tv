// SPDX-License-Identifier: AGPL-3.0-only
// The end-to-end run through the container (phase-3-checkpoint-9.md › Tests (9a)): the production
// image, started by compose.e2e.yaml beside the fixtures service (scripts/e2e/fixtures.ts) on a
// network with no way out, driven through the browser with Playwright:
//
// 1. the setup wizard, adding the catalog's public test indexer with one click;
// 2. adding Sintel (2010) from Discover, and grabbing its 1080p release from Interactive search;
// 3. its progress on Activity, then the file in /data/media/movies and History, through
//    `docker exec` and the API;
// 4. the `.en.srt` the import found at Subdl's fake, marked Synced on the movie's Subtitles tab;
// 5. a custom theme and a dashboard layout, the same after signing out and in, and in another
//    browser;
// 6. an announcement for Admins, on an Admin's dashboard and not in a User's announcements.
//
//   HIGHSEA_IMAGE=highsea:ci bun scripts/e2e/run.ts
//
// E2E_ARTIFACTS=<folder> keeps a screenshot and the containers' logs when a step fails;
// E2E_KEEP=1 leaves the stack running afterwards.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { FAKE_ACCOUNTS } from '@highsea-tv/subtitles/fake'
import { sintel } from '@highsea-tv/subtitles/testing'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { launch, ROOT } from '../sweeps/lib.ts'

const IMAGE = process.env.HIGHSEA_IMAGE ?? 'highsea:ci'
const ARTIFACTS = process.env.E2E_ARTIFACTS
const COMPOSE = ['compose', '-f', join(ROOT, 'compose.e2e.yaml')]
// localhost, the fixtures' proxy to the server (compose.e2e.yaml)
const BASE = 'http://localhost:3000'
const OWNER = { name: 'Ines', username: 'ines', password: 'harbor harbor harbor' }
const ADMIN = { name: 'Ruth', password: 'ruth ruth ruth' }
const USER = { name: 'Theo', password: 'theo theo theo' }
const SINTEL = 45745
const RELEASE = 'Sintel.2010.1080p.BluRay.x264-GRP'
const MOVIE_DIR = '/data/media/movies/Sintel (2010)'
const MOVIE_FILE = `${MOVIE_DIR}/Sintel (2010) Bluray-1080p.mkv`
const THEME = 'Lighthouse'
const NOTICE = 'Admins: the library moves to the new disk on Sunday'

const docker = (args: string[], quiet = false) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, HIGHSEA_IMAGE: IMAGE },
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'inherit'],
  })
const inServer = (command: string) =>
  docker([...COMPOSE, 'exec', '-T', 'highsea', 'sh', '-c', command], true).trim()

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
const signInApi = async (username: string, password: string) =>
  (
    await api<{ token: string }>('POST', '/auth/sign-in', {
      username,
      password,
      device: { name: 'End-to-end run', client: 'desktop', appVersion: '1.0.0' },
    })
  ).token

/** Waits for `check` to come back truthy, every half second. */
async function until<T>(what: string, check: () => Promise<T> | T, ms = 60_000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value
    if (Date.now() - start > ms) throw new Error(`Timed out after ${ms / 1000} s: ${what}`)
    await Bun.sleep(500)
  }
}

let browser: Browser | undefined
let current: Page | undefined
const timings: string[] = []
async function step(name: string, run: () => Promise<void>) {
  const start = Date.now()
  process.stdout.write(`${name} … `)
  await run()
  const took = `${((Date.now() - start) / 1000).toFixed(1)} s`
  timings.push(`${name}: ${took}`)
  console.log(took)
}

async function signIn(context: BrowserContext, username: string, password: string) {
  const page = await context.newPage()
  current = page
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL(`${BASE}/`)
  return page
}

// ---------------------------------------------------------------- the stack

console.log(`The end-to-end run, against ${IMAGE}`)
docker([...COMPOSE, 'down', '--volumes', '--remove-orphans'], true)
docker([...COMPOSE, 'up', '--detach', '--wait', '--wait-timeout', '300'])

let failed: unknown
try {
  browser = await launch()
  const ownerContext = await browser.newContext()
  let token = ''

  await step('   The fixtures’ catalog, installed', async () => {
    // the catalog's first check is a minute after boot (packages/catalog › schedule); its version
    // is 2099.1.1, newer than the seed's
    await until(
      'the catalog from the fixtures',
      () => docker([...COMPOSE, 'logs', 'highsea'], true).includes('"version":"2099.1.1"'),
      120_000,
    )
  })

  await step('1. Setup, with the test indexer in one click', async () => {
    const page = await ownerContext.newPage()
    current = page
    await page.goto(`${BASE}/setup`)
    const next = () => page.getByRole('button', { name: 'Continue' }).click()
    await page.getByLabel('Server name').fill('Harbor')
    await next()
    await page.getByLabel('Your name').fill(OWNER.name)
    await page.getByLabel('Username').fill(OWNER.username)
    await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
    await page.getByLabel('Confirm password').fill(OWNER.password)
    await next()
    // TMDB answers from the recordings at the fixtures, which take any key
    await page.getByLabel('TMDB API key or Read Access Token').fill('e2e-tmdb-key')
    await next()
    await page.getByRole('heading', { name: 'Choose your folders' }).waitFor()
    await next()
    // the catalog's public starters, from the fixtures' signed catalog: only the test indexer
    await page.getByRole('heading', { name: 'Add indexers' }).waitFor()
    const harbor = page.getByRole('checkbox', { name: 'Harbor Test Indexer' })
    await harbor.waitFor()
    for (const box of await page.getByRole('checkbox').all())
      if (
        (await box.isChecked()) !==
        (await box.evaluate((b, h) => b === h, await harbor.elementHandle()))
      )
        await box.click()
    await next()
    await page.getByRole('heading', { name: 'Subtitle languages' }).waitFor()
    await next()
    await page.getByRole('heading', { name: 'Watching away from home' }).waitFor()
    await next()
    await page.getByRole('heading', { name: 'Link to highsea cloud' }).waitFor()
    await next()
    await page.getByRole('heading', { name: 'Check and finish' }).waitFor()
    await page.getByRole('button', { name: 'Finish setup' }).click()
    // setup signs the owner in and opens the dashboard
    await page.waitForURL(`${BASE}/`)

    token = await signInApi(OWNER.username, OWNER.password)
    const indexers = await api<{ name: string }[]>('GET', '/indexers', undefined, token)
    if (indexers.map((i) => i.name).join() !== 'Harbor Test Indexer')
      throw new Error(`Setup added ${JSON.stringify(indexers.map((i) => i.name))}`)
  })

  await step('   The account the run needs', async () => {
    // a new server asks two-step of the owner and admins; the run signs in with passwords
    const security = await api<Record<string, unknown>>(
      'GET',
      '/settings/security',
      undefined,
      token,
    )
    await api('PUT', '/settings/security', { ...security, twoFactor: false }, token)
    // Subdl's account at its fake, and the minimum confidence the 52-second clip can earn
    await api('PUT', '/subtitles/providers/subdl', FAKE_ACCOUNTS.subdl, token)
    await api('PATCH', '/subtitles/providers/subdl', { enabled: true }, token)
    await api('PATCH', '/settings/subtitles', { minConfidence: sintel.minConfidence }, token)
  })

  const owner = current as Page

  await step('2. Add Sintel from Discover, and grab it from Interactive search', async () => {
    await owner.goto(`${BASE}/discover`)
    // as TMDB's recording has it (packages/metadata/test/fixtures/tmdb)
    await owner.getByLabel('Search for a movie').fill('sintel')
    await owner.getByRole('button', { name: 'Add Sintel' }).first().click()
    const dialog = owner.getByRole('dialog')
    // the release is 1080p, so the HD profile rather than the dialog's first
    await dialog.getByRole('combobox', { name: 'Quality profile' }).click()
    await owner.getByRole('option', { name: 'HD 1080p' }).click()
    // the run grabs by hand, from Interactive search, rather than letting Search now pick for it
    await dialog.getByRole('checkbox', { name: 'Search now' }).uncheck()
    await dialog.getByRole('button', { name: 'Add movie' }).click()
    await dialog.waitFor({ state: 'hidden' })
    await owner.goto(`${BASE}/movies/${SINTEL}`)
    await owner.getByRole('tab', { name: 'Search' }).click()
    await owner.getByRole('button', { name: 'Interactive search' }).click()
    await owner.getByRole('button', { name: `Grab ${RELEASE}`, exact: true }).click()
    // exact, so the toast's live announcement ("Notification …") isn't matched as well
    await owner
      .getByText(`${RELEASE} is downloading. Follow it in Activity.`, { exact: true })
      .waitFor()
  })

  await step('3. Activity, then the file and History', async () => {
    await owner.goto(`${BASE}/activity`)
    await owner.getByText(RELEASE).first().waitFor()
    await until(
      'the import',
      () => inServer(`test -f "${MOVIE_FILE}" && echo yes || true`) === 'yes',
      180_000,
    )
    // a hardlink of the download: one inode, two names
    const links = inServer(`stat -c %h "${MOVIE_FILE}"`)
    if (links !== '2') throw new Error(`The import isn't a hardlink: ${links} link(s)`)
    // imported, and seeding on until the seeding rules say stop (ADR 0038)
    await until('Seeding on Activity', async () => {
      await owner.goto(`${BASE}/activity`)
      return owner
        .getByText('Seeding', { exact: true })
        .waitFor({ timeout: 2000 })
        .then(
          () => true,
          () => false,
        )
    })
    await owner.getByRole('tab', { name: 'History' }).click()
    await owner.getByText(RELEASE).first().waitFor()
    const history = await api<{ items: { type: string }[] }>(
      'GET',
      `/movies/${SINTEL}/history`,
      undefined,
      token,
    )
    for (const type of ['grabbed', 'imported'])
      if (!history.items.some((h) => h.type === type)) throw new Error(`History has no ${type}`)
  })

  await step('4. The subtitle, found and synced', async () => {
    await until(
      'the subtitle',
      () =>
        inServer(`test -f "${MOVIE_DIR}/Sintel (2010) Bluray-1080p.en.srt" && echo yes || true`) ===
        'yes',
      120_000,
    )
    await until(
      'Synced on the Subtitles tab',
      async () => {
        await owner.goto(`${BASE}/movies/${SINTEL}`)
        await owner.getByRole('tab', { name: 'Subtitles' }).click()
        return owner
          .getByText('Synced', { exact: true })
          .first()
          .waitFor({ timeout: 2000 })
          .then(
            () => true,
            () => false,
          )
      },
      120_000,
    )
  })

  await step('5. A theme and a layout, kept across sessions and browsers', async () => {
    await owner.goto(`${BASE}/settings/appearance`)
    await owner.getByRole('button', { name: 'New theme' }).click()
    // the editor's Name, after the server identity's
    await owner.getByRole('textbox', { name: 'Name', exact: true }).last().fill(THEME)
    await owner.getByRole('button', { name: 'Add theme' }).click()
    await owner.getByText(`${THEME} saved`, { exact: true }).waitFor()
    await owner.getByRole('radio', { name: THEME }).click()
    await owner.getByRole('button', { name: 'Save', exact: true }).click()
    await owner.getByText('Appearance saved', { exact: true }).waitFor()

    await owner.goto(`${BASE}/`)
    await owner.getByRole('button', { name: 'Customize' }).click()
    await owner.getByRole('button', { name: 'Remove Network' }).click()
    await owner.getByRole('button', { name: 'Done' }).click()
    await owner.getByText('Dashboard saved', { exact: true }).waitFor()

    const check = async (page: Page, where: string) => {
      // the person's own layout, not the role's default the page shows while it loads
      // (dashboard.tsx renders `roleDefault(role)` until the layout arrives)
      const loaded = page.waitForResponse(
        (r) => new URL(r.url()).pathname === '/api/v1/me/dashboard' && r.ok(),
      )
      await page.goto(`${BASE}/`)
      await loaded
      await page.getByRole('heading', { name: 'Storage' }).waitFor()
      // the layout renders after its response, so wait for Network to go rather than counting it
      // at once: count() doesn't wait (https://playwright.dev/docs/api/class-locator#locator-count)
      await page
        .getByRole('heading', { name: 'Network' })
        .waitFor({ state: 'detached', timeout: 5_000 })
        .catch(() => {
          throw new Error(`${where}: the dashboard has Network again`)
        })
      await page.goto(`${BASE}/settings/appearance`)
      if (!(await page.getByRole('radio', { name: THEME }).isChecked()))
        throw new Error(`${where}: ${THEME} isn't the default theme`)
    }
    // signed out and in again, in the same browser
    // Your account is a sheet over the page
    await owner.getByRole('button', { name: 'Your account' }).click()
    await owner.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click()
    await owner.waitForURL(/\/login/)
    await check(
      await signIn(ownerContext, OWNER.username, OWNER.password),
      'After signing in again',
    )
    // another browser, with nothing of the first one's
    const other = await (browser as Browser).newContext()
    await check(await signIn(other, OWNER.username, OWNER.password), 'In another browser')
    await other.close()
  })

  await step('6. An announcement for Admins: an Admin sees it, a User doesn’t', async () => {
    const invite = async (displayName: string, role: string, password: string) => {
      const { link } = await api<{ link: string }>(
        'POST',
        '/users/invites',
        { displayName, email: null, role, libraries: 'all' },
        token,
      )
      const code = new URL(link).pathname.split('/').pop()
      await api('POST', `/links/${code}/accept`, { password })
      const users = await api<{ displayName: string; username: string }[]>(
        'GET',
        '/users',
        undefined,
        token,
      )
      return users.find((u) => u.displayName === displayName)?.username ?? displayName.toLowerCase()
    }
    const admin = await invite(ADMIN.name, 'admin', ADMIN.password)
    const user = await invite(USER.name, 'user', USER.password)
    await api(
      'POST',
      '/curation/announcements',
      {
        title: NOTICE,
        body: 'Downloads pause from 9 am to noon.',
        image: null,
        cta: null,
        severity: 'notice',
        placements: ['banner', 'card'],
        acknowledgement: 'dismiss',
        audience: { kind: 'roles', roles: ['admin'] },
        schedule: { start: new Date(Date.now() - 60_000).toISOString(), end: null },
        draft: false,
      },
      token,
    )
    const adminContext = await (browser as Browser).newContext()
    const page = await signIn(adminContext, admin, ADMIN.password)
    await page.getByText(NOTICE).first().waitFor()
    await adminContext.close()
    // a User has no admin (ADR 0032): their apps ask the client API
    const theirs = await api<{ title: string }[]>(
      'GET',
      '/announcements?client=web',
      undefined,
      await signInApi(user, USER.password),
    )
    if (theirs.some((a) => a.title === NOTICE))
      throw new Error('A User was shown the Admins’ announcement')
    const admins = await api<{ title: string }[]>(
      'GET',
      '/announcements?client=web',
      undefined,
      await signInApi(admin, ADMIN.password),
    )
    if (!admins.some((a) => a.title === NOTICE))
      throw new Error('The client API left the Admin out')
  })

  // the server's network has no way out (compose.e2e.yaml): everything above came from the fixtures
  const offline = inServer(
    "node -e \"fetch('https://example.com').then(()=>console.log('online'),()=>console.log('offline'))\"",
  )
  if (offline !== 'offline') throw new Error('The server could reach the internet')
} catch (error) {
  failed = error
  console.log('failed')
  if (ARTIFACTS) {
    mkdirSync(ARTIFACTS, { recursive: true })
    await current
      ?.screenshot({ path: join(ARTIFACTS, 'failure.png'), fullPage: true })
      .catch(() => {})
    writeFileSync(join(ARTIFACTS, 'logs.txt'), docker([...COMPOSE, 'logs', '--no-color'], true))
  } else console.log(docker([...COMPOSE, 'logs', '--no-color', '--tail', '80'], true))
} finally {
  await browser?.close()
  if (process.env.E2E_KEEP !== '1') docker([...COMPOSE, 'down', '--volumes'], true)
}

if (failed) {
  console.error(failed)
  process.exit(1)
}
console.log(`\nThe end-to-end run passed.\n${timings.join('\n')}`)
