// SPDX-License-Identifier: AGPL-3.0-only
// Playback in browsers (phase-4-checkpoint-2.md › Tests, 4.2b): the seeded server from the
// production build, with ADR 0040's generated clips, and the web player in Chromium and Firefox.
// In each, signed in on /web, Big Buck Bunny's MP4 plays directly and Sintel's MKV as HLS (a direct
// stream); Sintel's English subtitle is turned on and a cue is drawn, the film seeks far ahead and
// plays on, and leaving keeps the place and ends the session. Since 4.3a (phase-4-checkpoint-3.md ›
// Tests), Elephants Dream's PGS subtitle is drawn into the picture by a transcode, its timing hidden
// with the line saying why, and staff stop Sintel from Now playing with a message the player shows.
// Safari is tried by hand at each review (the plan's answer 7). `bun scripts/sweeps/playback.ts [chromium|firefox]`; PLAYBACK_PORT moves it.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pgsBox } from '@highsea-tv/stream/testing'
import { sintel } from '@highsea-tv/subtitles/testing'
import { type BrowserType, chromium, firefox, type Page } from 'playwright-core'
import { ROOT } from './lib.ts'
import { boot, seed } from './seeded.ts'

const PORT = Number(process.env.PLAYBACK_PORT ?? 3140)
const OWNER = { username: 'sweep', displayName: 'Sweep', password: 'sweep sweep sweep' }
const BUNNY = 10378
const SINTEL = 45745
const ELEPHANTS = 9761
const STOP_MESSAGE = 'Back in five minutes.'
// far ahead on the clips' 600 s timeline: past what a direct stream has made, so it starts again there
const AHEAD = 480
const ffmpeg = process.env.HIGHSEA_FFMPEG ?? 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE ?? 'ffprobe'
const browsers: Record<string, BrowserType> = { chromium, firefox }
const only = process.argv[2]
if (only && !browsers[only]) throw new Error(`No browser called ${only}: chromium or firefox`)

execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/web'), stdio: 'inherit' })
const server = await boot(PORT, { production: true })
const problems: string[] = []

try {
  const { token } = await seed(server, OWNER, 'Playback script')
  await importMp4(token)
  await importPgs(token)

  for (const [name, type] of Object.entries(browsers)) {
    if (only && only !== name) continue
    const started = Date.now()
    // a person presses Play to get to the player, which lets it play with sound; the run opens it
    // by its address, so each browser is told to allow that without a gesture
    // (https://developer.chrome.com/blog/autoplay#developer_switches,
    // https://support.mozilla.org/kb/block-autoplay: media.autoplay.default 0 allows it)
    const browser = await type.launch(
      name === 'firefox'
        ? { firefoxUserPrefs: { 'media.autoplay.default': 0 } }
        : { args: ['--autoplay-policy=no-user-gesture-required'] },
    )
    try {
      await inBrowser(name, await browser.newPage({ baseURL: server.base }), token)
    } catch (e) {
      problems.push(`${name}: ${(e as Error).message.split('\n')[0]}`)
    } finally {
      await browser.close()
    }
    console.log(`${name}: ${((Date.now() - started) / 1000).toFixed(0)} s`)
  }
} finally {
  await server.stop()
}

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`)
  process.exit(1)
}
console.log(
  'Playback: every film played in every browser, the PGS subtitle was burned in, leaving kept the place and Stop was shown.',
)

/**
 * Big Buck Bunny from the seed's feature clip, remuxed into MP4 (H.264 and AAC, the moov atom first,
 * https://ffmpeg.org/ffmpeg-formats.html#Options-11), which every browser plays as it is.
 */
async function importMp4(token: string) {
  const name = 'Big.Buck.Bunny.2008.1080p.WEB-DL.H264-GRP'
  const folder = join(server.dataDir, 'downloads', name)
  mkdirSync(folder, { recursive: true })
  execFileSync(ffmpeg, [
    ...['-v', 'error', '-y', '-i', join(server.dir, 'feature.mkv')],
    ...['-map', '0:v', '-map', '0:a', '-c', 'copy', '-movflags', '+faststart'],
    join(folder, `${name}.mp4`),
  ])
  await importFolder(token, folder, BUNNY)
}

/**
 * Elephants Dream from the same clip, with an English PGS track (`pgsBox`, a white box across the
 * lower third for the whole clip) that no browser can draw, so choosing it burns it in (ADR 0052's
 * 4.3a section).
 */
async function importPgs(token: string) {
  const name = 'Elephants.Dream.2006.1080p.BluRay.x264-GRP'
  const folder = join(server.dataDir, 'downloads', name)
  mkdirSync(folder, { recursive: true })
  const feature = join(server.dir, 'feature.mkv')
  const [width = 0, height = 0] = execFileSync(ffprobe, [
    ...['-v', 'error', '-select_streams', 'v:0'],
    ...['-show_entries', 'stream=width,height', '-of', 'csv=p=0', feature],
  ])
    .toString()
    .trim()
    .split(',')
    .map(Number)
  const sup = join(folder, 'box.sup')
  const w = Math.max(64, Math.round(width * 0.6))
  writeFileSync(
    sup,
    pgsBox({
      width,
      height,
      x: Math.round((width - w) / 2),
      y: Math.round(height * 0.75),
      w,
      h: Math.round(height * 0.1),
      from: 0,
      to: 590,
    }),
  )
  execFileSync(ffmpeg, [
    ...['-v', 'error', '-y', '-i', feature, '-i', sup],
    ...['-map', '0:v', '-map', '0:a', '-map', '1:0', '-c', 'copy'],
    ...['-metadata:s:s:0', 'language=eng'],
    join(folder, `${name}.mkv`),
  ])
  await importFolder(token, folder, ELEPHANTS)
}

/** Scans a download's folder and imports what matched `movieId`, by hard link. */
async function importFolder(token: string, folder: string, movieId: number) {
  const found = await server.api<{ path: string; movieId: number | null; versionId: string }[]>(
    'POST',
    '/import/scan',
    { path: folder },
    token,
  )
  const files = found
    .filter((f) => f.movieId === movieId && /\.(mp4|mkv)$/.test(f.path))
    .map((f) => ({ path: f.path, movieId, versionId: f.versionId }))
  if (!files.length) throw new Error(`${folder} wasn't matched: ${JSON.stringify(found)}`)
  const ran = await server.api<{ results: { ok: boolean; message: string }[] }>(
    'POST',
    '/import',
    { files, mode: 'hardlink' },
    token,
  )
  const refused = ran.results.filter((r) => !r.ok)
  if (refused.length) throw new Error(`not imported: ${JSON.stringify(refused)}`)
}

async function inBrowser(name: string, page: Page, token: string) {
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`))
  await page.goto('/web/')
  await page.getByLabel('Username').fill(OWNER.username)
  await page.getByLabel('Password').fill(OWNER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('navigation', { name: 'Main' }).first().waitFor()

  // direct play: the file itself, by byte ranges
  await play(page, BUNNY, 'direct-play')
  const src = await page.evaluate(() => document.querySelector('video')?.currentSrc ?? '')
  if (!src.includes('/stream/files/')) problems.push(`${name}: direct play loaded ${src}`)
  await leave(page, BUNNY)

  // HLS: Sintel's MKV remuxed on demand, its English subtitle drawn by the player
  await play(page, SINTEL, 'direct-stream')
  await page.getByRole('button', { name: 'Audio and subtitles' }).click()
  // the release's sidecar, which speaks with the clip; the clip's own forced track says one line
  type Detail = {
    versions: {
      playable: boolean
      subtitles: { id: string; forced: boolean; language: string }[]
    }[]
  }
  const detail = (await page.request
    .get(`/api/v1/items/movie/${SINTEL}`)
    .then((r) => r.json())) as Detail
  const tracks = detail.versions.find((v) => v.playable)?.subtitles ?? []
  const sidecar = tracks.findIndex((t) => !t.forced && t.language === 'en')
  if (sidecar < 0) throw new Error(`Sintel has no English sidecar: ${JSON.stringify(tracks)}`)
  // after Off
  await page
    .locator('[role=radiogroup][aria-labelledby=p-subs] label')
    .nth(sidecar + 1)
    .click()
  await page.keyboard.press('Escape')
  const lines = sintel.cues().map((c) => (c.text ?? '').replace(/\s+/g, ' ').trim())
  await until(
    page,
    'a subtitle cue',
    (texts) => {
      const shown = document.body.innerText.replace(/\s+/g, ' ')
      return texts.some((t) => shown.includes(t))
    },
    lines,
  )

  await page.evaluate((t) => {
    const v = document.querySelector('video')
    if (v) v.currentTime = t
  }, AHEAD)
  await until(
    page,
    `playing past ${AHEAD + 2} s`,
    (t) => {
      const v = document.querySelector('video')
      return !!v && !v.paused && v.currentTime > t + 2
    },
    AHEAD,
  )
  await leave(page, SINTEL)
  const kept = await page.request
    .get(`/api/v1/items/movie/${SINTEL}`)
    .then((r) => r.json() as Promise<{ item: { position: number } }>)
  if (!(kept.item.position > AHEAD)) {
    problems.push(`${name}: Sintel kept ${kept.item.position} s, not past ${AHEAD} s`)
  }

  // burned in: the PGS track can't be drawn by the browser, so choosing it transcodes with it in
  // the picture, and the panel says why its timing can't be changed. The server remembers the
  // person's choice, so in the second browser the film starts with it chosen
  const first = await play(page, ELEPHANTS, null)
  await page.getByRole('button', { name: 'Audio and subtitles' }).click()
  // after Off, the one subtitle
  const pgs = page.locator('[role=radiogroup][aria-labelledby=p-subs] label').nth(1)
  if (first !== 'transcode') {
    const restarted = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith(`/items/movie/${ELEPHANTS}/play`),
    )
    await pgs.click()
    const burned = (await (await restarted).json()) as { decision: { method: string } }
    if (burned.decision.method !== 'transcode') {
      throw new Error(`the PGS subtitle was decided ${burned.decision.method}, not transcode`)
    }
  } else if (!(await pgs.locator('input').isChecked())) {
    throw new Error('Elephants Dream was transcoded without its PGS subtitle chosen')
  }
  await page
    .getByText('This subtitle is drawn into the picture, so its timing can’t be changed.')
    .waitFor()
  await page.keyboard.press('Escape')
  await until(
    page,
    'the burned-in film to play',
    () => {
      const v = document.querySelector('video')
      return !!v && !v.paused && v.currentTime > 1
    },
    null,
  )
  await leave(page, ELEPHANTS)

  // stopped from Now playing, with a message the player shows with who stopped it
  await play(page, SINTEL, 'direct-stream')
  type Live = { sessions: { id: string; item: { tmdbId: number | null } }[] }
  const live = await server.api<Live>('GET', '/sessions', undefined, token)
  const stream = live.sessions.find((s) => s.item.tmdbId === SINTEL)
  if (!stream) throw new Error(`Now playing doesn't list Sintel: ${JSON.stringify(live)}`)
  await server.api('POST', `/sessions/${stream.id}/stop`, { message: STOP_MESSAGE }, token)
  const notice = page.getByRole('alertdialog', { name: `${OWNER.displayName} stopped this stream` })
  await notice.waitFor()
  if (!(await notice.getByText(STOP_MESSAGE).isVisible())) {
    problems.push(`${name}: the stop's message wasn't shown`)
  }
}

/** Waits for `check` in the page; on a timeout, says what it waited for and the video's state. */
async function until<A>(page: Page, what: string, check: (arg: A) => boolean, arg: A) {
  try {
    await page.waitForFunction(check as (a: unknown) => boolean, arg as unknown, {
      timeout: 60_000,
    })
  } catch {
    const video = await page.evaluate(() => {
      const v = document.querySelector('video')
      return v
        ? `at ${v.currentTime.toFixed(1)} s, ${v.paused ? 'paused' : 'playing'}, ready ${v.readyState}, error ${v.error?.code ?? 'none'} ${v.error?.message ?? ''}`
        : 'no video'
    })
    const shown = await page.evaluate(() =>
      document.body.innerText.replace(/\s+/g, ' ').slice(0, 200),
    )
    throw new Error(`timed out waiting for ${what}: the video ${video}; the page says “${shown}”`)
  }
}

/**
 * Opens the player from the start, checks the server's decision (any, when `method` is null), and
 * waits for it to play. Returns the decision's method.
 */
async function play(page: Page, id: number, method: string | null) {
  const answered = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/items/movie/${id}/play`),
  )
  await page.goto(`/web/play/${id}/start`)
  const session = (await (await answered).json()) as { decision: { method: string } }
  if (method && session.decision.method !== method) {
    throw new Error(`${id} was decided ${session.decision.method}, not ${method}`)
  }
  await until(
    page,
    `${id} to play`,
    () => {
      const v = document.querySelector('video')
      return !!v && !v.paused && v.currentTime > 1
    },
    null,
  )
  return session.decision.method
}

/** Back to the title's page: the last report, paused, then the session's end. */
async function leave(page: Page, id: number) {
  const reported = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && /\/playback\/sessions\/[^/]+\/progress$/.test(r.url()),
  )
  const ended = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/playback\/sessions\/[^/]+$/.test(r.url()),
  )
  // the chrome hides after 3 s while playing; moving the pointer brings it back, as for a person
  await page.mouse.move(200, 200)
  await page.mouse.move(240, 220)
  await page.getByRole('button', { name: 'Back to details' }).click()
  for (const r of [await reported, await ended]) {
    if (!r.ok()) throw new Error(`${r.request().method()} ${r.url()}: ${r.status()}`)
  }
  await page.waitForURL(`**/web/movies/${id}`)
}
