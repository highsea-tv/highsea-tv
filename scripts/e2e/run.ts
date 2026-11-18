// SPDX-License-Identifier: AGPL-3.0-only
// The end-to-end run through the container (phase-3-checkpoint-9.md › Tests (9a)): the production
// image, started by compose.yaml beside this file, with the fixtures service (fixtures.ts) on a
// network with no way out, driven through the browser with Playwright:
//
// 1. the setup wizard, adding the catalog's public test indexer with one click;
// 2. adding Sintel (2010) from Discover, and grabbing its 1080p release from Interactive search;
// 3. its progress on Activity, then the file in /data/media/movies and History, through
//    `docker exec` and the API;
// 4. the `.en.srt` the import found at Subdl's fake, marked Synced on the movie's Subtitles tab;
// 5. a custom theme and a dashboard layout, the same after signing out and in, and in another
//    browser;
// 6. an announcement for Admins, on an Admin's dashboard and not in a User's announcements;
// 7. Sintel played through `/stream` (phase-4-checkpoint-1.md › Tests, 4.1b): the play API, the
//    HLS playlists, a segment far ahead on the film’s timeline, and the subtitle’s rendition
//    playlist with a WebVTT segment holding its first line;
// 8. signing in on `/web` and playing Sintel in the browser's player (phase-4-checkpoint-2.md ›
//    Tests, 4.2b), the stream on the admin's Now playing (phase-4-checkpoint-3.md › Tests, 4.3a),
//    then leaving, which ends the session;
// 9. the artwork at a host name other than localhost, as an owner browses their server: Home's
//    backdrop and the library's posters on `/web`, and a poster in the admin, each drawn from the
//    server's own /api/v1/images (TMDB's replay at the fixtures serves the pictures).
// 10. an error in the web app, reported to its server (ADR 0066), listed in System › Logs and in
//    Download logs.
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
const COMPOSE = ['compose', '-f', join(ROOT, 'scripts', 'e2e', 'compose.yaml')]
// localhost, the fixtures' proxy to the server (scripts/e2e/compose.yaml)
const BASE = 'http://localhost:3000'
// the same proxy by another name, as an owner reaches their NAS (`http://<NAS>:3000`): Chromium
// resolves it to 127.0.0.1 (its --host-resolver-rules switch,
// https://www.chromium.org/developers/design-documents/network-stack/socks-proxy/), so nothing
// outside the browser changes; `.test` is reserved for this (RFC 6761 § 6.2)
const HOST = 'harbor.test'
const ELSEWHERE = `http://${HOST}:3000`
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
async function until<T>(
  what: string,
  check: () => Promise<T> | T,
  ms = 60_000,
): Promise<NonNullable<T>> {
  const start = Date.now()
  for (;;) {
    const value = await check()
    if (value) return value as NonNullable<T>
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

const IMAGES = '/api/v1/images/'
/**
 * Checks that the page drew artwork of `kind` from the server's /api/v1/images, and that every
 * picture on it loaded: each `<img>` (expo-image's on the web, packages/ui/src/native/image.tsx) has
 * a source and decoded to a width, and each artwork address, an `<img>`'s or a CSS background's,
 * answers 200 with an image. An element alone isn't enough: 0.4.1's web client drew its frames and
 * no picture in them (HT-35).
 */
async function artwork(page: Page, where: string, kind: string, refused: string[]) {
  type Seen = { src: string; complete: boolean; width: number }[]
  const look = () =>
    page.evaluate((images) => {
      const imgs: Seen = [...document.querySelectorAll('img')].map((i) => ({
        src: i.getAttribute('src') ?? '',
        complete: i.complete,
        width: i.naturalWidth,
      }))
      const backgrounds = [...document.querySelectorAll<HTMLElement>('body *')]
        .map((e) => /url\("?([^")]+)"?\)/.exec(getComputedStyle(e).backgroundImage)?.[1] ?? '')
        .filter((u) => u.includes(images))
      return { imgs, backgrounds }
    }, IMAGES)
  const wanted = new RegExp(`${IMAGES}\\w+/\\d+/${kind}/`)
  // drawn, and every picture done loading (or failed), as a person would wait for the page
  const seen = await until(
    `${where}: a ${kind} from ${IMAGES}`,
    async () => {
      const now = await look()
      const drawn = [...now.imgs.map((i) => i.src), ...now.backgrounds].some((u) => wanted.test(u))
      return drawn && now.imgs.every((i) => !i.src || i.complete) ? now : undefined
    },
    30_000,
  ).catch(async (error) => {
    const now = await look()
    throw new Error(
      `${(error as Error).message}. The page has ${now.imgs.length} image(s)${
        now.imgs.length ? `: ${now.imgs.map((i) => i.src || '(no source)').join(', ')}` : ''
      }`,
    )
  })
  const broken = seen.imgs.filter((i) => !i.src || i.width === 0)
  if (broken.length)
    throw new Error(
      `${where}: ${broken.length} image(s) drew nothing: ${broken.map((i) => i.src || '(no source)').join(', ')}`,
    )
  const addresses = new Set(
    [...seen.imgs.map((i) => i.src), ...seen.backgrounds].filter((u) => u.includes(IMAGES)),
  )
  // asked again from the page, as its own <img> asked: the browser's cookie and its name for the
  // host (Playwright's page.request resolves outside Chromium, so not harbor.test)
  const answers = await page.evaluate(
    (urls) =>
      Promise.all(
        urls.map(async (url) => {
          const res = await fetch(url)
          return { url, status: res.status, type: res.headers.get('content-type') ?? '' }
        }),
      ),
    [...addresses],
  )
  for (const a of answers)
    if (a.status !== 200 || !a.type.startsWith('image/'))
      throw new Error(`${where}: ${a.url} answered ${a.status} ${a.type || 'no content type'}`)
  if (refused.length) throw new Error(`${where}: artwork refused:\n${refused.join('\n')}`)
}

// ---------------------------------------------------------------- the stack

console.log(`The end-to-end run, against ${IMAGE}`)
docker([...COMPOSE, 'down', '--volumes', '--remove-orphans'], true)
docker([...COMPOSE, 'up', '--detach', '--wait', '--wait-timeout', '300'])

let failed: unknown
try {
  browser = await launch({ args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] })
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
    // /data is empty, so setup takes highsea's own folders and asks only for the owner, then
    // Review (install-simplicity.md B); TMDB answers with the key scripts/e2e/compose.yaml gives the image
    await page.getByLabel('Server name').fill('Harbor')
    await page.getByLabel('Your name').fill(OWNER.name)
    await page.getByLabel('Username').fill(OWNER.username)
    await page.getByLabel('Password', { exact: true }).fill(OWNER.password)
    await page.getByLabel('Confirm password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('heading', { name: 'Check and finish' }).waitFor()
    // the catalog's public starters, from the fixtures' signed catalog: only the test indexer
    await page.getByRole('button', { name: 'Change indexers' }).click()
    const harbor = page.getByRole('checkbox', { name: 'Harbor Test Indexer' })
    await harbor.waitFor()
    for (const box of await page.getByRole('checkbox').all())
      if (
        (await box.isChecked()) !==
        (await box.evaluate((b, h) => b === h, await harbor.elementHandle()))
      )
        await box.click()
    await page.getByRole('button', { name: 'Done with indexers' }).click()
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
    await dialog.getByRole('button', { name: 'Quality profile' }).click()
    await owner.getByRole('menuitemradio', { name: 'HD 1080p' }).click()
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

  await step(
    '7. Sintel through /stream: the playlist, a segment far ahead, the subtitle',
    async () => {
      type Session = {
        id: string
        url: string | null
        decision: { method: string }
        subtitles: { id: string; url: string | null }[]
      }
      // Chrome won't play Matroska (and the clip's audio is FLAC), so the server makes HLS of it
      const session = await api<Session>(
        'POST',
        `/items/movie/${SINTEL}/play`,
        { profile: 'web-chromium' },
        token,
      )
      if (session.decision.method === 'direct-play' || !session.url?.endsWith('/main.m3u8'))
        throw new Error(`Sintel would be played by ${session.decision.method}, not HLS`)
      const get = async (path: string) => {
        const res = await fetch(`${BASE}${path}`)
        if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
        return res
      }
      const base = session.url.replace(/main\.m3u8$/, '')
      if (!(await (await get(session.url)).text()).includes('video.m3u8'))
        throw new Error('The multivariant playlist names no media playlist')
      const media = await (await get(`${base}video.m3u8`)).text()
      const last = media
        .split('\n')
        .filter((l) => /^\d+\.m4s$/.test(l))
        .at(-1)
      if (!last || !media.includes('#EXT-X-ENDLIST')) throw new Error(`No segments in:\n${media}`)
      const segment = Buffer.from(await (await get(`${base}${last}`)).arrayBuffer())
      // its fragment's decode time (ISO/IEC 14496-12 § 8.8.12) is far into the film, not at 0
      const at = segment.indexOf('tfdt')
      const time =
        segment[at + 4] === 1
          ? Number(segment.readBigUInt64BE(at + 8))
          : segment.readUInt32BE(at + 8)
      if (at < 0 || time <= 0) throw new Error(`The last segment starts at ${time}, not far ahead`)
      // the `.en.srt` step 4 found, as a player reads a stream's text track (ADR 0051, HT-49):
      // its rendition playlist, then a segment of WebVTT
      const subtitle = session.subtitles.find((t) => t.url)
      if (!subtitle?.url) throw new Error('The session lists no text subtitle')
      if (!subtitle.url.split('?')[0]?.endsWith('.m3u8'))
        throw new Error(`The stream's subtitle is ${subtitle.url}, not a rendition playlist`)
      const rendition = await (await get(subtitle.url)).text()
      const uris = rendition.split('\n').filter((l) => l.trim() && !l.startsWith('#'))
      if (!rendition.startsWith('#EXTM3U') || !rendition.includes('#EXT-X-ENDLIST'))
        throw new Error(`The subtitle's playlist isn't a whole HLS playlist:\n${rendition}`)
      // "segment boundaries at the same points in time" as the picture's (Apple's HLS authoring
      // specification, 8.22): one WebVTT segment for each of the picture's
      const pictures = media.split('\n').filter((l) => /^\d+\.m4s$/.test(l)).length
      if (uris.length !== pictures)
        throw new Error(`The subtitle has ${uris.length} segments, the picture ${pictures}`)
      // its URIs are relative to the playlist (RFC 8216 § 4.1)
      const first = new URL(uris[0] as string, `${BASE}${subtitle.url}`)
      // a segment the session hasn't read yet is a 503 with Retry-After (RFC 9110 § 15.6.4), in
      // seconds or as a date (§ 10.2.3): asked again, as the players do, for up to a minute
      const ask = Date.now()
      let vtt = ''
      for (;;) {
        const res = await fetch(first)
        if (res.status === 503 && Date.now() - ask < 60_000) {
          const after = res.headers.get('retry-after') ?? ''
          const wait = /^\d+$/.test(after)
            ? Number(after) * 1000
            : Date.parse(after) - Date.now() || 2000
          await Bun.sleep(Math.min(Math.max(wait, 500), 10_000))
          continue
        }
        if (!res.ok) throw new Error(`GET ${first.pathname}: ${res.status} ${await res.text()}`)
        vtt = await res.text()
        break
      }
      // the header's timestamp map (RFC 8216 § 3.5; Apple's specification, 5.3), and the clip's
      // first line, which the sync moved but didn't change
      const line = sintel.cues()[0]?.text ?? ''
      if (
        !vtt.startsWith('WEBVTT') ||
        !/^X-TIMESTAMP-MAP=/m.test(vtt) ||
        !vtt.includes('-->') ||
        !line ||
        !vtt.includes(line)
      )
        throw new Error(
          `The subtitle's first segment isn't WebVTT with "${line}":\n${vtt.slice(0, 300)}`,
        )
      await api('DELETE', `/playback/sessions/${session.id}`, undefined, token)
      if ((await fetch(`${BASE}${base}video.m3u8`)).status !== 404)
        throw new Error('The stream outlived its session')
    },
  )

  await step(
    '8. Sintel in the web player: signed in on /web, playing, on Now playing, then Back',
    async () => {
      const context = await (browser as Browser).newContext()
      const page = await context.newPage()
      current = page
      await page.goto(`${BASE}/web/`)
      await page.getByLabel('Username').fill(OWNER.username)
      await page.getByLabel('Password').fill(OWNER.password)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('navigation', { name: 'Main' }).first().waitFor()
      await page.goto(`${BASE}/web/play/${SINTEL}/start`)
      await page.waitForFunction(
        () => {
          const v = document.querySelector('video')
          return !!v && !v.paused && v.currentTime > 2
        },
        null,
        { timeout: 90_000 },
      )
      // the same session, signed in, in the admin while it plays
      const admin = await context.newPage()
      await admin.goto(`${BASE}/now-playing`)
      await admin.getByRole('listitem', { name: /, Sintel$/ }).waitFor({ timeout: 30_000 })
      await admin.close()
      const ended = page.waitForResponse(
        (r) => r.request().method() === 'DELETE' && /\/playback\/sessions\/[^/]+$/.test(r.url()),
      )
      // the chrome hides after 3 s while playing; moving the pointer brings it back, as for a person
      await page.mouse.move(200, 200)
      await page.mouse.move(240, 220)
      await page.getByRole('button', { name: 'Back to details' }).click()
      if (!(await ended).ok()) throw new Error('Leaving the player didn’t end its session')
      await page.waitForURL(`${BASE}/web/movies/${SINTEL}`)
      await context.close()
    },
  )

  await step('9. Artwork at another host name: Home, the library and the admin', async () => {
    const context = await (browser as Browser).newContext()
    const page = await context.newPage()
    current = page
    // every answer for artwork the page asked for, whatever drew it
    const refused: string[] = []
    page.on('response', (r) => {
      const { pathname } = new URL(r.url())
      if (!pathname.startsWith(IMAGES)) return
      const type = r.headers()['content-type'] ?? ''
      if (r.status() !== 200 || !type.startsWith('image/'))
        refused.push(`${pathname}: ${r.status()} ${type || 'no content type'}`)
    })
    await page.goto(`${ELSEWHERE}/web/`)
    await page.getByLabel('Username').fill(OWNER.username)
    await page.getByLabel('Password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('navigation', { name: 'Main' }).first().waitFor()
    await artwork(page, 'Home on /web', 'backdrop', refused)
    await page.goto(`${ELSEWHERE}/web/movies`)
    await artwork(page, 'The library on /web', 'poster', refused)
    // the admin draws with the same library but its own pages (Next), signed in by the same cookie
    await page.goto(`${ELSEWHERE}/movies`)
    await artwork(page, 'The admin’s Movies', 'poster', refused)
    await context.close()
  })

  await step('10. An error in the web app, reported to the server and listed in Logs', async () => {
    // kept whatever General › Diagnostics' crash reports switch says (HT-56)
    const context = await (browser as Browser).newContext()
    const page = await context.newPage()
    current = page
    await page.goto(`${BASE}/web/`)
    await page.getByLabel('Username').fill(OWNER.username)
    await page.getByLabel('Password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('navigation', { name: 'Main' }).first().waitFor()
    // an error nothing handles, as a bug in the app would throw it: the page's `error` event
    const sent = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/system/client-reports'),
    )
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error('the end-to-end run’s error')
      }, 0)
    })
    if ((await sent).status() !== 204) throw new Error('The server didn’t take the app’s report')
    type Report = { id: string; app: string; screen: string; message: string }
    const [report] = await api<Report[]>('GET', '/system/client-reports', undefined, token)
    if (report?.app !== 'web' || !report.message.includes('the end-to-end run’s error'))
      throw new Error(`The report kept isn’t the app’s: ${JSON.stringify(report)}`)
    // the admin lists it beside the crash reports, and Download logs ends with it
    await page.goto(`${BASE}/system/logs`)
    await page
      .getByRole('list', { name: 'Reports from the apps' })
      .getByText('the end-to-end run’s error')
      .waitFor({ timeout: 30_000 })
    const logs = await fetch(`${BASE}/api/v1/system/logs/download`, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!(await logs.text()).includes(report.id))
      throw new Error('Download logs doesn’t include the app’s report')
    await context.close()
  })

  // the server's network has no way out (scripts/e2e/compose.yaml): everything above came from the fixtures
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
