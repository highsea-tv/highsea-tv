// SPDX-License-Identifier: AGPL-3.0-only
// How long a film's keyframes take to read, and how much of the file that reads (HT-48; ADR 0051's
// section of 2026-11-17): from every packet, as ffprobe lists them, and from the container's index
// (`readKeyframesFrom` in packages/stream/src/hls/runner.ts), on the same generated film as
// start-times.ts (H.264 at 25 Mbit/s, keyframes about 10 s apart, 5.1 AC-3 and a subtitle), in MKV
// and remuxed to MP4. Each read is timed and its bytes counted through a small file server here,
// as HT-46 counted them: ffprobe reads the film by HTTP from it, and the index reader's own reads
// are counted as it makes them. The two lists of keyframes are compared. Nothing here is a pass or
// a fail: it's for reading, before and after a change.
//
// `bun scripts/sweeps/keyframe-times.ts [minutes] [folder]`: the film's length (120, about 23 GB
// a container), and where to make it (a new temporary folder, removed after; a folder given is
// kept, and a film already in it is used again). KEYFRAME_TIMES_GOP is the frames between
// keyframes (250).
import { execFile, execFileSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  agrees,
  fileReader,
  fromFilmStart,
  indexProbeArgs,
  keyframeArgs,
  matroskaKeyframes,
  mp4Keyframes,
  parseIndexProbe,
  parseKeyframes,
  parseWindow,
  readKeyframesFrom,
  windowArgs,
  windows,
} from '../../packages/stream/src/hls/index.ts'

const MINUTES = Number(process.argv[2] ?? 120)
const kept = process.argv[3]
const GOP = process.env.KEYFRAME_TIMES_GOP ?? '250'
const ffmpeg = process.env.HIGHSEA_FFMPEG ?? 'ffmpeg'
const ffprobe = process.env.HIGHSEA_FFPROBE ?? 'ffprobe'
const dir = kept ?? mkdtempSync(join(tmpdir(), 'highsea-keyframe-times-'))
mkdirSync(dir, { recursive: true })

/** Serves the folder with byte ranges, counting what it sends. */
let sent = 0
const server = createServer((req, res) => {
  const file = join(dir, decodeURIComponent((req.url ?? '/').slice(1)))
  const size = statSync(file).size
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '')
  const start = m ? Number(m[1]) : 0
  const end = m?.[2] ? Number(m[2]) : size - 1
  res.writeHead(m ? 206 : 200, {
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
    ...(m ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
  })
  const stream = createReadStream(file, { start, end, highWaterMark: 256 * 1024 })
  stream.on('data', (chunk) => {
    sent += chunk.length
  })
  stream.pipe(res)
  res.on('close', () => stream.destroy())
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`

/** ffprobe, run without blocking: this process serves it the film. */
const probe = (args: string[]) =>
  new Promise<string>((resolve, reject) =>
    execFile(ffprobe, args, { maxBuffer: 1024 * 1024 * 1024 }, (e, out) =>
      e ? reject(e) : resolve(String(out)),
    ),
  )

/** The same film as start-times.ts's, made once. */
function makeFilm(): { mkv: string; mp4: string } {
  const mkv = join(dir, 'film.mkv')
  const mp4 = join(dir, 'film.mp4')
  if (!existsSync(mkv)) {
    const clip = join(dir, 'minute.mkv')
    execFileSync(ffmpeg, [
      ...['-v', 'error', '-y'],
      ...['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=24,noise=alls=40:allf=t'],
      ...['-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '60'],
      ...['-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '25M', '-maxrate', '30M'],
      ...['-bufsize', '60M', '-g', GOP, '-keyint_min', GOP, '-sc_threshold', '0'],
      ...['-pix_fmt', 'yuv420p', '-c:a', 'ac3', '-ac', '6', '-b:a', '640k', clip],
    ])
    const srt = join(dir, 'lines.srt')
    const time = (s: number) =>
      `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')},000`
    writeFileSync(
      srt,
      Array.from({ length: MINUTES * 12 }, (_, i) => {
        const at = i * 5
        return `${i + 1}\n${time(at)} --> ${time(at + 4)}\nA line at ${at} seconds\n`
      }).join('\n'),
    )
    execFileSync(ffmpeg, [
      ...['-v', 'error', '-y', '-stream_loop', String(MINUTES - 1), '-i', clip, '-i', srt],
      ...['-map', '0', '-map', '1', '-c', 'copy', '-metadata:s:s:0', 'language=eng', mkv],
    ])
    rmSync(clip)
  }
  if (!existsSync(mp4))
    execFileSync(ffmpeg, [
      ...['-v', 'error', '-y', '-i', mkv, '-map', '0', '-c', 'copy', '-c:s', 'mov_text', mp4],
    ])
  return { mkv, mp4 }
}

/** The index's way, step by step as `readKeyframesFrom` takes it, with ffprobe reading by HTTP. */
async function byIndex(file: string, name: string) {
  const url = base + name
  const p = parseIndexProbe(await probe(indexProbeArgs(url)), 0)
  if (!p?.container) throw new Error('no container')
  const reader = await fileReader(file)
  const keys =
    p.container === 'matroska'
      ? await matroskaKeyframes(reader, p.nth)
      : await mp4Keyframes(reader, p.id, p.nth)
  await reader.close()
  const sorted = [...new Set(keys)].sort((a, b) => a - b)
  for (const w of windows(sorted) ?? [])
    if (!agrees(sorted, parseWindow(await probe(windowArgs(url, 0, w.interval))), w.edge))
      throw new Error(`disagrees at the ${w.edge}`)
  return { times: fromFilmStart(sorted, p.start), own: reader.bytes }
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`
try {
  const film = makeFilm()
  for (const [kind, file] of Object.entries(film)) {
    const name = file.slice(dir.length + 1)
    console.log(`\n${kind.toUpperCase()}, ${mb(statSync(file).size)}`)

    sent = 0
    let from = Date.now()
    const full = parseKeyframes(await probe(keyframeArgs(base + name, 0)))
    console.log(
      `  every packet: ${full.length} keyframes, ${Date.now() - from} ms, ${mb(sent)} read`,
    )

    sent = 0
    from = Date.now()
    const index = await byIndex(file, name)
    console.log(
      `  the index:    ${index.times.length} keyframes, ${Date.now() - from} ms, ${mb(sent + index.own)} read (${mb(index.own)} of it the index itself)`,
    )

    // as the server reads it, from the disk: the time and where the keyframes came from
    from = Date.now()
    const local = await readKeyframesFrom(ffprobe, file, 0)
    console.log(`  readKeyframesFrom, from the disk: from ${local.from}, ${Date.now() - from} ms`)

    const same = JSON.stringify(full) === JSON.stringify(index.times)
    const local_ = JSON.stringify(full) === JSON.stringify(local.times)
    console.log(`  the same keyframes: ${same && local_ ? 'yes' : 'NO'}`)
    if (!same)
      console.log(
        `  only in every packet: ${full.filter((t) => !index.times.includes(t)).join(', ')}; only in the index: ${index.times.filter((t) => !full.includes(t)).join(', ')}`,
      )
  }
} finally {
  server.close()
  if (!kept) rmSync(dir, { recursive: true, force: true })
}
