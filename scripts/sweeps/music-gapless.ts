// SPDX-License-Identifier: AGPL-3.0-only
// The music player's joins and levels in the browser (HT-117; ADR 0065 › Gapless and loudness).
// It doesn't pass or fail: it measures, for the PR and for reading. It builds the server and the web
// app (`--no-build` uses what's built), boots the seeded server on port 3180 (MUSIC_GAPLESS_PORT),
// and adds two albums made by ffmpeg to its music folder:
// - "One Tone": a single unbroken 440 Hz sine cut into three FLAC songs at sample boundaries
//   (https://ffmpeg.org/ffmpeg-filters.html#atrim, `start_sample`/`end_sample`), so the album played
//   through should sound as one tone, and any silence between songs is the player's;
// - "Two Levels": a 1 kHz sine at about -9.5 LUFS and the same at about -19.5, 10 dB apart. The
//   quiet one is 1.5 dB under highsea's -18 LUFS, which the player's 80 % volume leaves room for:
//   a gain is the volume times the level's, at most 1, so a quieter song couldn't be brought all
//   the way up (ADR 0065 › Gapless and loudness).
// ffmpeg's `sine` source has an amplitude of 1/8 (-18 dBFS, https://ffmpeg.org/ffmpeg-filters.html#sine),
// so the volumes below are on top of that.
// It waits for the loudness job to measure both, signs in on /web in Chromium, plays One Tone with
// Play and Two Levels with Shuffle (track mode), and records what the page plays: every audio
// element is routed through one AudioContext into an AudioWorklet that copies the samples out
// (https://webaudio.github.io/web-audio-api/#AudioWorklet). Same origin, so the elements aren't
// silenced as a cross-origin one would be. Then it prints each silence of a millisecond or more
// between the first sound and the last, and each song's level in dBFS.
//
// HIGHSEA_WEB_DIR points the server at another web export, an earlier commit's for a "before".
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Page } from 'playwright-core'
import { ROOT } from './lib.ts'
import { boot, seed } from './seeded.ts'

const PORT = Number(process.env.MUSIC_GAPLESS_PORT ?? 3180)
const OWNER = { username: 'sweep', displayName: 'Sweep', password: 'sweep sweep sweep' }
const RATE = 48_000
/** Each of One Tone's three songs, in samples: 6 s. */
const SONG = 6 * RATE
/** A sample this close to 0 is silence (−60 dBFS)... */
const QUIET = 0.001
/** ...and a run of them this long is a gap: One Tone's 440 Hz sine is never that near 0 that long. */
const GAP_SAMPLES = Math.round(RATE / 1000)
const ffmpeg = process.env.HIGHSEA_FFMPEG ?? 'ffmpeg'

if (!process.argv.includes('--no-build')) {
  execFileSync('bun', ['run', 'build'], { cwd: join(ROOT, 'apps/server'), stdio: 'inherit' })
  if (!process.env.HIGHSEA_WEB_DIR)
    execFileSync('bun', ['run', 'export:web'], {
      cwd: join(ROOT, 'apps/client'),
      stdio: 'inherit',
      env: { ...process.env, EXPO_NO_TELEMETRY: '1', EXPO_PUBLIC_HIGHSEA_MOCK: '' },
    })
}
const server = await boot(PORT, { production: true })

try {
  const { token } = await seed(server, OWNER, 'Music gapless')
  const api = <T>(method: string, path: string, body?: unknown) =>
    server.api<T>(method, path, body, token)
  const root = join(server.dataDir, 'music', 'Sweep Tones')
  const tool = (args: string[]) =>
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-nostdin', ...args], { timeout: 60_000 })
  const tags = (album: string, title: string, n: number, of: number) => [
    ...['-metadata', `title=${title}`, '-metadata', 'artist=Sweep Tones'],
    ...['-metadata', 'album_artist=Sweep Tones', '-metadata', `album=${album}`],
    ...['-metadata', 'date=2026', '-metadata', `track=${n}/${of}`],
  ]
  const tone = join(root, 'One Tone (2026)')
  mkdirSync(tone, { recursive: true })
  for (const [i, title] of ['First', 'Second', 'Third'].entries())
    tool([
      ...['-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=${RATE}:duration=20`],
      ...['-af', `volume=12dB,atrim=start_sample=${i * SONG}:end_sample=${(i + 1) * SONG}`],
      ...['-ac', '2', ...tags('One Tone', title, i + 1, 3)],
      join(tone, `0${i + 1} ${title}.flac`),
    ])
  const levels = join(root, 'Two Levels (2026)')
  mkdirSync(levels, { recursive: true })
  for (const [i, [title, db]] of (
    [
      ['Loud', 11.6],
      ['Quiet', 1.6],
    ] as const
  ).entries())
    tool([
      ...['-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=${RATE}:duration=6`],
      ...['-af', `volume=${db}dB`, '-ac', '2', ...tags('Two Levels', title, i + 1, 2)],
      join(levels, `0${i + 1} ${title}.flac`),
    ])
  const folders = await api<{ id: string; kind: string }[]>('GET', '/rootfolders')
  const music = folders.find((f) => f.kind === 'music')
  if (!music) throw new Error('the seed has no music folder')
  await api('POST', `/rootfolders/${music.id}/scan`)

  type Album = { id: string; title: string }
  type Detail = { songs: { id: string; title: string }[] }
  const albums: Record<string, Album> = {}
  for (let i = 0; !albums['One Tone'] || !albums['Two Levels']; i++) {
    for (const a of await api<Album[]>('GET', '/albums')) albums[a.title] = a
    if (i > 240) throw new Error('the scan didn’t find the two albums')
    await Bun.sleep(250)
  }
  // the loudness job: an ahead play (off Now playing, ended unheard) says each song's level
  const measured: Record<string, number> = {}
  for (const name of ['One Tone', 'Two Levels']) {
    const id = albums[name]?.id ?? ''
    const { songs } = await api<Detail>('GET', `/music/albums/${id}`)
    for (const s of songs)
      for (let i = 0; ; i++) {
        type Play = { id: string; level: { track: { lufs: number } | null } }
        const p = await api<Play>('POST', `/music/tracks/${s.id}/play`, { ahead: true })
        await api('DELETE', `/music/plays/${p.id}`)
        if (p.level.track) {
          measured[`${name} › ${s.title}`] = p.level.track.lufs
          break
        }
        if (i > 240) throw new Error(`${s.title} wasn’t measured`)
        await Bun.sleep(500)
      }
  }
  for (const [song, lufs] of Object.entries(measured))
    console.log(`measured: ${song} ${lufs.toFixed(1)} LUFS`)

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  try {
    // the page's policy allows no blob: script, which the recording's worklet is
    // (https://playwright.dev/docs/api/class-browser#browser-new-page-option-bypass-csp)
    const page = await browser.newPage({ baseURL: server.base, bypassCSP: true })
    page.on('pageerror', (e) => console.error(`page: ${e.message}`))
    await page.addInitScript(record)
    await page.goto('/web/')
    await page.getByLabel('Username').fill(OWNER.username)
    await page.getByLabel('Password').fill(OWNER.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByRole('navigation', { name: 'Main' }).first().waitFor()

    // One Tone, played through
    const oneTone = await listen(page, albums['One Tone']?.id ?? '', 'Play', 3 * 6 + 3)
    const gaps = silences(oneTone)
    console.log(
      `One Tone: ${(oneTone.length / RATE).toFixed(2)} s recorded, ${gaps.length} silences of 1 ms or more between the first sound and the last`,
    )
    for (const g of gaps)
      console.log(`  at ${(g.at / RATE).toFixed(3)} s: ${((g.length / RATE) * 1000).toFixed(1)} ms`)

    // Two Levels, shuffled: track mode
    const two = await listen(page, albums['Two Levels']?.id ?? '', 'Shuffle', 2 * 6 + 5)
    const windows = levelsEvery(two, 0.5)
    console.log(
      `Two Levels: ${(two.length / RATE).toFixed(2)} s recorded; the level every half second, in dBFS RMS (silence left out):`,
    )
    console.log(`  ${windows.map((l) => l.toFixed(1)).join(' ')}`)
    await page.close()
  } finally {
    await browser.close()
  }
} finally {
  await server.stop()
}

/**
 * In the page, before the app: every audio element is sent through one AudioContext into a
 * worklet that posts its samples back, kept in `window.__heard` (left channel).
 */
function record() {
  const w = window as unknown as {
    __heard: Float32Array[]
    __ctx?: AudioContext
    __ready?: Promise<AudioWorkletNode>
  }
  w.__heard = []
  const module = `registerProcessor('tap', class extends AudioWorkletProcessor {
    process(inputs) { const c = inputs[0] && inputs[0][0]; if (c) this.port.postMessage(c.slice(0)); return true }
  })`
  const ready = () => {
    if (w.__ready) return w.__ready
    const ctx = new AudioContext({ sampleRate: 48_000 })
    w.__ctx = ctx
    w.__ready = ctx.audioWorklet
      .addModule(URL.createObjectURL(new Blob([module], { type: 'text/javascript' })))
      .then(() => {
        const tap = new AudioWorkletNode(ctx, 'tap', { numberOfInputs: 1, numberOfOutputs: 1 })
        tap.port.onmessage = (e) => w.__heard.push(e.data as Float32Array)
        tap.connect(ctx.destination)
        return tap
      })
    return w.__ready
  }
  const routed = new WeakSet<HTMLMediaElement>()
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    if (!routed.has(this)) {
      routed.add(this)
      void ready().then((tap) => {
        const ctx = w.__ctx as AudioContext
        ctx.createMediaElementSource(this).connect(tap)
        void ctx.resume()
      })
    }
    return play.call(this)
  }
}

/** Opens an album, presses `button`, records for `seconds`, and gives back what was heard. */
async function listen(page: Page, album: string, button: string, seconds: number) {
  await page.evaluate((path) => {
    history.pushState(null, '', path)
    dispatchEvent(new PopStateEvent('popstate', { state: null }))
  }, `/web/music/albums/${album}`)
  // the album's own button, with its word: the player's Shuffle is an icon with the same name
  await page
    .getByRole('button', { name: button, exact: true })
    .filter({ hasText: button })
    .first()
    .click()
  // the worklet is made with the first play: start the recording clean from here
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    ;(window as unknown as { __heard: Float32Array[] }).__heard = []
  })
  await page.waitForTimeout(seconds * 1000)
  // what the page showed, for reading (MUSIC_GAPLESS_SHOTS names a folder)
  if (process.env.MUSIC_GAPLESS_SHOTS)
    await page.screenshot({ path: join(process.env.MUSIC_GAPLESS_SHOTS, `${button}.png`) })
  const chunks = await page.evaluate(() =>
    (window as unknown as { __heard: Float32Array[] }).__heard.map((c) => Array.from(c)),
  )
  return Float32Array.from(chunks.flat())
}

/** The runs of silence a millisecond or longer, between the first sound and the last. */
function silences(x: Float32Array) {
  let first = 0
  while (first < x.length && Math.abs(x[first] ?? 0) < QUIET) first++
  let last = x.length - 1
  while (last > first && Math.abs(x[last] ?? 0) < QUIET) last--
  const out: { at: number; length: number }[] = []
  let run = 0
  for (let i = first; i <= last; i++) {
    if (Math.abs(x[i] ?? 0) < QUIET) run++
    else {
      if (run >= GAP_SAMPLES) out.push({ at: i - run, length: run })
      run = 0
    }
  }
  return out
}

/** The RMS level in dBFS of each `seconds`-long window that has sound. */
function levelsEvery(x: Float32Array, seconds: number) {
  const n = Math.round(seconds * RATE)
  const out: number[] = []
  for (let a = 0; a + n <= x.length; a += n) {
    let sum = 0
    for (let j = a; j < a + n; j++) sum += (x[j] ?? 0) ** 2
    const db = 10 * Math.log10(sum / n)
    if (db > -60) out.push(db)
  }
  return out
}
