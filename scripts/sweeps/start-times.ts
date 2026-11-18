// SPDX-License-Identifier: AGPL-3.0-only
// How long a film takes to start (phase-5-real-use.md › A1's finding of 2026-11-17): a seeded
// server from the production build, a long, large film generated here (H.264 at a film's bitrate,
// keyframes about 10 s apart, 5.1 AC-3 and a subtitle track of its own, in MKV: a direct stream
// for both players), and each start timed from Play to the first frame at the right place:
// - in the web player in Chromium (hls.js), from the beginning on the film's first play, from the
//   beginning again, on a resume deep in, and on a resume with the film's own subtitle on;
// - in AVPlayer (scripts/sweeps/avplayer.swift), which the phone and the TV play with, under the
//   `ios` profile, from the beginning and on a resume.
// After each it prints the server's own timing lines for the session (System › Logs' `playback`).
// Both players reach the server through a small proxy here that sends at a set rate, as a home
// network or a phone's connection would, and notes what each start asked for and how much of it
// arrived before the first frame. Nothing here is a pass or a fail: it's for reading, before and
// after a change.
//
// `bun scripts/sweeps/start-times.ts [minutes] [seek|playlist]`: the film's length (120), and how
// AVPlayer reaches a resume (`playlist`, the app's way; `seek` is its way before the fix).
// START_TIMES_MBIT is the proxy's rate in megabits a second (40; 0 for no limit).
// START_TIMES_GOP is the frames between the film's keyframes (250, about 10 s; 48 is 2 s).
// START_TIMES_PORT moves it; START_TIMES_BUILT=1 skips the builds. The film is about 190 MB a
// minute and goes with the server's folder.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { ROOT } from './lib.ts'
import { boot, seed } from './seeded.ts'

const PORT = Number(process.env.START_TIMES_PORT ?? 3170)
const OWNER = { username: 'sweep', displayName: 'Sweep', password: 'sweep sweep sweep' }
/** Elephants Dream, which the recordings know and the seed leaves without a file. */
const FILM = 9761
const NAME = 'Elephants.Dream.2006.1080p.BluRay.x264-GRP'
const MINUTES = Number(process.argv[2] ?? 120)
const AVPLAYER_MODE = process.argv[3] === 'seek' ? 'seek' : 'playlist'
// a few seconds into a minute, so it's inside a stretch between keyframes, not on one
const RESUME = Math.round((MINUTES * 60) / 2) + 4
/** Frames between the film's keyframes, at 24 a second: 250 is x264's own limit, about 10 s. */
const GOP = process.env.START_TIMES_GOP ?? '250'
const MBIT = Number(process.env.START_TIMES_MBIT ?? 40)
const ffmpeg = process.env.HIGHSEA_FFMPEG ?? 'ffmpeg'

if (!process.env.START_TIMES_BUILT) {
  execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
  execFileSync('bun', ['run', 'export:web'], {
    cwd: join(ROOT, 'apps/client'),
    stdio: 'inherit',
    env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_HIGHSEA_MOCK: '' },
  })
}
// the timing lines are written at `info`
process.env.SWEEP_LOG_LEVEL = 'info'
const server = await boot(PORT, { production: true })
const rows: string[] = []
const link = slowLink(PORT + 5, PORT, MBIT)

try {
  const { token } = await seed(server, OWNER, 'Start times')
  const avplayer = buildAvplayer()
  const film = makeFilm()
  console.log(`The film: ${MINUTES} min, ${(statSync(film).size / 1e9).toFixed(1)} GB`)
  await importFolder(token, join(server.dataDir, 'downloads', NAME))
  await readAhead(token)

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    const page = await browser.newPage({ baseURL: link.base })
    await page.goto('/web/')
    await page.getByLabel('Username').fill(OWNER.username)
    await page.getByLabel('Password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('navigation', { name: 'Main' }).first().waitFor()

    await web(page, token, 'web, from the beginning, the film’s first play', 0)
    await web(page, token, 'web, from the beginning', 0)
    await web(page, token, `web, resuming at ${RESUME} s`, RESUME)
    await web(page, token, `web, resuming at ${RESUME} s, its own subtitle on`, RESUME, true)
    await web(page, token, `web, resuming at ${RESUME} s, its own subtitle on, again`, RESUME, true)
  } finally {
    await browser.close()
  }
  if (avplayer) {
    await native(avplayer, token, 'AVPlayer (ios), from the beginning', 0)
    await native(avplayer, token, `AVPlayer (ios), resuming at ${RESUME} s`, RESUME)
  } else console.log('AVPlayer: skipped, since swiftc isn’t here (a Mac with Xcode’s tools)')
} finally {
  link.stop()
  await server.stop()
}
console.log(`\nThrough ${MBIT || 'unlimited'} Mbit/s:\n${rows.join('\n')}`)

/**
 * A proxy to the server that sends each response's body at `mbit` megabits a second, shared by
 * the connections open at once as a link's rate is, and keeps what `/stream` was asked for: each
 * request's name, its bytes sent so far and when it started.
 */
function slowLink(port: number, to: number, mbit: number) {
  type Load = { name: string; bytes: number; at: number }
  let loads: Load[] = []
  // a token bucket filled every 20 ms: what the link may send in that time
  let tokens = 0
  const waiting: (() => void)[] = []
  const tick = setInterval(() => {
    tokens = (mbit * 1e6) / 8 / 50
    for (const w of waiting.splice(0)) w()
  }, 20)
  const take = async (want: number): Promise<number> => {
    if (!mbit) return want
    while (tokens <= 0) await new Promise<void>((r) => waiting.push(r))
    const n = Math.min(want, Math.ceil(tokens))
    tokens -= n
    return n
  }
  const proxy = createServer((req, res) => {
    const m = /\/stream\/(?:hls|subtitles)\/[^/]+\/(.+)$/.exec((req.url ?? '').split('?')[0] ?? '')
    const load = m ? { name: decodeURIComponent(m[1] as string), bytes: 0, at: Date.now() } : null
    if (load) loads.push(load)
    const up = httpRequest(
      { host: '127.0.0.1', port: to, method: req.method, path: req.url, headers: req.headers },
      async (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers)
        try {
          for await (const chunk of answer as AsyncIterable<Buffer>) {
            for (let sent = 0; sent < chunk.length; ) {
              const n = await take(chunk.length - sent)
              if (res.destroyed) return void answer.destroy()
              res.write(chunk.subarray(sent, sent + n))
              sent += n
              if (load) load.bytes += n
            }
          }
        } catch {}
        res.end()
      },
    )
    up.on('error', () => res.destroy())
    res.on('close', () => up.destroy())
    req.pipe(up)
  }).listen(port, '127.0.0.1')
  return {
    base: `http://localhost:${port}`,
    /** What was asked for since the last call, with the megabytes of each that had been sent. */
    take(): { summary: string; megabytes: number } {
      const was = loads
      loads = []
      const from = was[0]?.at ?? 0
      return {
        summary: was
          .slice(0, 8)
          .map((l) => `${l.name} ${(l.bytes / 1e6).toFixed(1)} MB at ${l.at - from} ms`)
          .join(', '),
        megabytes: was.reduce((n, l) => n + l.bytes, 0) / 1e6,
      }
    },
    stop() {
      clearInterval(tick)
      proxy.close()
      proxy.closeAllConnections()
    },
  }
}

/** The harness for AVPlayer, compiled into the server's folder; null where there's no Swift. */
function buildAvplayer(): string | null {
  const out = join(server.dir, 'avplayer')
  try {
    execFileSync('swiftc', ['-O', join(ROOT, 'scripts/sweeps/avplayer.swift'), '-o', out], {
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    return out
  } catch {
    return null
  }
}

/**
 * The film, in the downloads folder: a minute of 1080p H.264 with noise, so it has a film's
 * bitrate, a keyframe every 250 frames (x264's own default, https://trac.ffmpeg.org/wiki/Encode/H.264),
 * and 5.1 AC-3, then that minute copied end to end (`-stream_loop`,
 * https://ffmpeg.org/ffmpeg.html#Main-options) with an English SubRip track for the whole length.
 */
function makeFilm(): string {
  const folder = join(server.dataDir, 'downloads', NAME)
  mkdirSync(folder, { recursive: true })
  const clip = join(server.dir, 'minute.mkv')
  execFileSync(ffmpeg, [
    ...['-v', 'error', '-y'],
    ...['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=24,noise=alls=40:allf=t'],
    ...['-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '60'],
    ...['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '25M', '-maxrate', '30M'],
    ...['-bufsize', '60M', '-g', GOP, '-keyint_min', GOP, '-sc_threshold', '0'],
    ...['-pix_fmt', 'yuv420p', '-c:a', 'ac3', '-ac', '6', '-b:a', '640k', clip],
  ])
  const srt = join(server.dir, 'lines.srt')
  const time = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`
  writeFileSync(
    srt,
    Array.from({ length: MINUTES * 12 }, (_, i) => {
      const at = i * 5
      return `${i + 1}\n${time(at)} --> ${time(at + 4)}\nA line at ${at} seconds\n`
    }).join('\n'),
  )
  const film = join(folder, `${NAME}.mkv`)
  execFileSync(ffmpeg, [
    ...['-v', 'error', '-y', '-stream_loop', String(MINUTES - 1), '-i', clip, '-i', srt],
    ...['-map', '0', '-map', '1', '-c', 'copy', '-metadata:s:s:0', 'language=eng', film],
  ])
  return film
}

/** Scans the download's folder and imports the film, by hard link. */
async function importFolder(token: string, folder: string) {
  const found = await server.api<{ path: string; movieId: number | null; versionId: string }[]>(
    'POST',
    '/import/scan',
    { path: folder },
    token,
  )
  const files = found
    .filter((f) => f.movieId === FILM && f.path.endsWith('.mkv'))
    .map((f) => ({ path: f.path, movieId: FILM, versionId: f.versionId }))
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

type Session = { id: string; url: string | null; decision: { method: string } }

/** Leaves the film at `seconds` for the person, as a player's last report does. */
async function leaveAt(token: string, seconds: number) {
  const s = await server.api<Session>(
    'POST',
    `/items/movie/${FILM}/play`,
    { start: seconds, profile: 'web-chromium' },
    token,
  )
  await server.api(
    'POST',
    `/playback/sessions/${s.id}/progress`,
    { position: seconds, paused: true },
    token,
  )
  await server.api('DELETE', `/playback/sessions/${s.id}`, undefined, token)
}

/** The film's own subtitle, chosen or not, as the person's pick for the title. */
async function pickSubtitle(token: string, on: boolean) {
  type Detail = { versions: { playable: boolean; subtitles: { id: string }[] }[] }
  const detail = await server.api<Detail>('GET', `/items/movie/${FILM}`, undefined, token)
  const id = detail.versions.find((v) => v.playable)?.subtitles[0]?.id
  if (!id) throw new Error('the film has no subtitle track')
  await server.api('PUT', `/items/movie/${FILM}/prefs`, { subtitleId: on ? id : null }, token)
}

/** The web player: from its Play request to a frame playing at the right place. */
async function web(page: Page, token: string, name: string, start: number, subtitle = false) {
  await pickSubtitle(token, subtitle)
  if (start) await leaveAt(token, start)
  const asked = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith(`/items/movie/${FILM}/play`),
  )
  const answered = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith(`/items/movie/${FILM}/play`),
  )
  link.take()
  await page.goto(start ? `/web/play/${FILM}` : `/web/play/${FILM}/start`)
  await asked
  const from = Date.now()
  const session = (await (await answered).json()) as Session
  await page.waitForFunction(
    (at) => {
      const v = document.querySelector('video')
      return !!v && !v.paused && v.readyState >= 3 && v.currentTime > at + 0.05
    },
    start,
    { timeout: 180_000, polling: 'raf' },
  )
  const ms = Date.now() - from
  const loads = link.take()
  const cue = subtitle
    ? await page
        .waitForFunction(
          () =>
            Array.from(document.querySelector('video')?.textTracks ?? []).some(
              (t) => (t.cues?.length ?? 0) > 0,
            ),
          null,
          { timeout: 180_000 },
        )
        .then(() => Date.now() - from)
    : null
  await page.goto(`/web/movies/${FILM}`)
  await report(
    token,
    name,
    session,
    ms,
    `${loads.megabytes.toFixed(0)} MB sent before it: ${loads.summary}${cue === null ? '' : `; the subtitle’s lines after ${cue} ms`}`,
  )
}

/** AVPlayer under the `ios` profile: from the Play request to a frame at the right place. */
async function native(avplayer: string, token: string, name: string, start: number) {
  await pickSubtitle(token, false)
  link.take()
  const from = Date.now()
  const session = await server.api<Session>(
    'POST',
    `/items/movie/${FILM}/play`,
    { start, profile: 'ios' },
    token,
  )
  const out = await new Promise<string>((resolve) => {
    const child = spawn(avplayer, [`${link.base}${session.url}`, String(start), AVPLAYER_MODE])
    let text = ''
    child.stdout.on('data', (c: Buffer) => {
      text += c.toString()
    })
    child.on('exit', () => resolve(text.trim()))
  })
  const ms = Date.now() - from
  const loads = link.take()
  await report(
    token,
    name,
    session,
    ms,
    `AVPlayer (${AVPLAYER_MODE}): ${out}; ${loads.megabytes.toFixed(0)} MB sent before it: ${loads.summary}`,
  )
  await server.api('DELETE', `/playback/sessions/${session.id}`, undefined, token).catch(() => {})
}

/** A start's row, and the server's timing lines for its session. */
/** Waits for the read after the import (`media.ahead`), as a film played later than it was added. */
async function readAhead(token: string) {
  const from = Date.now()
  while (Date.now() - from < 120_000) {
    const { entries } = await server.api<{ entries: { fields?: Record<string, unknown> }[] }>(
      'GET',
      '/system/logs?search=read%20ahead%20of%20the%20first%20play&limit=20',
      undefined,
      token,
    )
    // the seed's clips are read too: the film is the one with a film's keyframes
    const film = entries.find((e) => Number(e.fields?.keyframes) > 100)
    if (film) return console.log(`Read after the import: ${JSON.stringify(film.fields)}`)
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('The read after the import didn’t finish in 2 minutes.')
}

async function report(token: string, name: string, session: Session, ms: number, note: string) {
  type Entry = { message: string; fields?: Record<string, unknown> }
  const { entries } = await server.api<{ entries: Entry[] }>(
    'GET',
    `/system/logs?search=${session.id}&limit=50`,
    undefined,
    token,
  )
  rows.push(`${(ms / 1000).toFixed(2).padStart(7)} s  ${name} (${session.decision.method})`)
  console.log(`\n${name}: ${ms} ms to the first frame (${session.decision.method}); ${note}`)
  for (const e of entries.reverse()) {
    const { session: _, ...fields } = e.fields ?? {}
    console.log(`  ${e.message} ${JSON.stringify(fields)}`)
  }
}
