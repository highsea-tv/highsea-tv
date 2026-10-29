// SPDX-License-Identifier: AGPL-3.0-only
// Hardware acceleration (checkpoint 4.3b, ADR 0056, playback-settings.md): what the host has, the
// check that decides whether a path is used, and the path each transcode takes.
//
// - **Detection**, at boot and again before each check: the render nodes in `/dev/dri` and the
//   driver ffmpeg opens on the first (VAAPI, and QSV for Intel's iHD driver), a CUDA device
//   (NVENC), VideoToolbox on a Mac outside Docker, and ffmpeg's own encoders and filters.
// - **The check** transcodes a short HDR10 clip, made once into the data folder's `hardware/`, on
//   the path: Intel's low-power encoder first, then without it; then again with the path's tone
//   mapping. Only a check passing puts a path to use (an unchecked one never is), and a check is
//   forgotten when its device or driver changes. At boot every path found without a check is
//   checked in the background (`checkNew`), so a new install uses its chip with nothing to press.
// - **A run that fails mid-film** marks its path's check failed; the film goes on on the processor
//   (`@highsea-tv/stream/hls`'s runner).
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { PathStatus, PlaybackSettings } from '@highsea-tv/api-contract'
import { PLAYBACK_SETTINGS_TOPICS } from '@highsea-tv/api-contract'
import { AppError, type Clock, type EventBus, type Logger } from '@highsea-tv/core'
import { type Db, readSetting, writeSetting } from '@highsea-tv/db'
import {
  type Accel,
  type AccelPath,
  CHECK_FRAMES,
  CPU_TONE_MAP_FILTERS,
  checkArgs,
  choosePath,
  clipArgs,
  ENCODERS,
  FILTERS,
  hardwareT,
  PATHS,
  parseList,
  parseVaapiDriver,
  probeArgs,
  renderNodes,
  type Vendor,
} from '@highsea-tv/stream/hardware'
import type { Hardware } from '@highsea-tv/stream/hls'

export const HARDWARE_KEY = 'playback.hardware'
/** A check's transcode that takes longer than this has failed. */
const CHECK_TIMEOUT_MS = 120_000
/** The lines of ffmpeg's output a failure keeps for System › Logs. */
const LOG_LINES = 20

/** The tone mapping each path's check tries, besides its scaler: none of them may be missing. */
const TONE_MAP_FILTERS: Record<AccelPath, (vendor: Vendor) => string[]> = {
  vaapi: (v) => (v === 'amd' ? ['libplacebo', 'hwmap'] : ['tonemap_vaapi']),
  qsv: () => ['vpp_qsv'],
  nvenc: () => ['libplacebo', 'hwdownload'],
  videotoolbox: () => ['scale_vt'],
}

const PCI = '/sys/bus/pci/devices'
const nvidiaCard = (d: { vendor: string; class: string }) =>
  d.vendor === '0x10de' && d.class.startsWith('0x03')

export type Ran = { code: number | null; stdout: string; stderr: string; ms: number }

/** How highsea looks at the host: the real one, or a test's. */
export type Host = {
  platform: NodeJS.Platform
  /** Docker's marker file (https://docs.docker.com/engine/containers/run/): VideoToolbox isn't there. */
  inContainer: () => boolean
  /** The names in `/dev/dri`; none when it isn't there. */
  dri: () => string[]
  /** Each PCI device's vendor and class from sysfs (`0x10de`, `0x030000`); none off Linux. */
  pci: () => { vendor: string; class: string }[]
  run: (command: string, args: string[], timeoutMs: number) => Promise<Ran>
}

/** A Linux host with no GPU, whose every command fails: tests that aren't about hardware. */
export const bareHost = (): Host => ({
  platform: 'linux',
  inContainer: () => true,
  dri: () => [],
  pci: () => [],
  run: async () => ({ code: 1, stdout: '', stderr: '', ms: 0 }),
})

export const realHost = (): Host => ({
  platform: process.platform,
  inContainer: () => existsSync('/.dockerenv'),
  dri: () => {
    try {
      return readdirSync('/dev/dri')
    } catch {
      return []
    }
  },
  // sysfs lists every PCI device, inside a container too (https://docs.kernel.org/PCI/sysfs-pci.html)
  pci: () => {
    try {
      return readdirSync(PCI).map((d) => ({
        vendor: readFileSync(join(PCI, d, 'vendor'), 'utf8').trim(),
        class: readFileSync(join(PCI, d, 'class'), 'utf8').trim(),
      }))
    } catch {
      return []
    }
  },
  run: (command, args, timeoutMs) =>
    new Promise((resolve) => {
      const started = performance.now()
      execFile(
        command,
        args,
        { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) =>
          resolve({
            code: error ? (typeof error.code === 'number' ? error.code : null) : 0,
            stdout: String(stdout),
            stderr:
              String(stderr) || (error && typeof error.code !== 'number' ? error.message : ''),
            ms: performance.now() - started,
          }),
      )
    }),
})

/** What detection found for a path. */
type Found = {
  device: string | null
  name: string | null
  vendor: Vendor
  unavailable: string | null
}

/** A check as it's kept: what the API shows, and what a run needs. */
type Stored = {
  result: 'pass' | 'fail'
  fps: number | null
  detail: string
  at: number
  lowPower: boolean
  toneMap: boolean
  /** The device and driver it ran on: a check on another is forgotten. */
  fingerprint: string
}

const fingerprint = (f: Found) => `${f.device ?? ''}|${f.name ?? ''}`
const lastLine = (stderr: string) =>
  stderr
    .trim()
    .split('\n')
    .map((l) => l.replace(/^\[[^\]]+\]\s*/, '').trim())
    .filter(Boolean)
    .pop()
    ?.slice(0, 200) ?? ''

export function createHardware(deps: {
  db: Db
  clock: Clock
  events: EventBus
  logger: Logger
  dataDir: string
  ffmpeg: string
  settings: () => Pick<PlaybackSettings, 'acceleration' | 'toneMapping'>
  host?: Host
}) {
  const { db, clock, events, ffmpeg } = deps
  const host = deps.host ?? realHost()
  const log = deps.logger.child('hardware')
  const t = hardwareT()
  const changed = () => events.emit({ topic: PLAYBACK_SETTINGS_TOPICS.updated, ids: [] })

  let encoders = new Set<string>()
  let filters = new Set<string>()
  const none = (reason: string): Found => ({
    device: null,
    name: null,
    vendor: 'other',
    unavailable: reason,
  })
  let found: Record<AccelPath, Found> = {
    vaapi: none(t('unavailable.dri')),
    qsv: none(t('unavailable.dri')),
    nvenc: none(t('unavailable.nvidia')),
    videotoolbox: none(t('unavailable.mac')),
  }
  const checking = new Set<AccelPath>()

  const stored = () => readSetting<Partial<Record<AccelPath, Stored>>>(db, HARDWARE_KEY, {})
  const keep = (path: AccelPath, check: Stored) =>
    writeSetting(db, HARDWARE_KEY, { ...stored(), [path]: check }, clock.now())
  /** A path's check, unless it ran on another device or driver. */
  const checkOf = (path: AccelPath): Stored | null => {
    const s = stored()[path]
    return s && s.fingerprint === fingerprint(found[path]) ? s : null
  }

  /** Looks at the host again. */
  async function detect() {
    const [enc, fil] = await Promise.all([
      host.run(ffmpeg, ['-hide_banner', '-encoders'], 15_000),
      host.run(ffmpeg, ['-hide_banner', '-filters'], 15_000),
    ])
    encoders = parseList(enc.stdout)
    filters = parseList(fil.stdout)
    const next = { ...found }
    const encoder = (path: AccelPath, f: Found): Found =>
      !f.unavailable && !encoders.has(ENCODERS[path])
        ? { ...f, unavailable: t('unavailable.encoder', { encoder: ENCODERS[path] }) }
        : f

    // VAAPI and QSV: the first render node, and its driver as ffmpeg opens it
    if (host.platform !== 'linux') {
      next.vaapi = none(t('unavailable.linux'))
      next.qsv = none(t('unavailable.linux'))
    } else {
      const node = renderNodes(host.dri())[0] ?? null
      if (!node) {
        next.vaapi = none(t('unavailable.dri'))
        next.qsv = none(t('unavailable.dri'))
      } else {
        const opened = await host.run(ffmpeg, probeArgs('vaapi', node), 15_000)
        const driver = parseVaapiDriver(opened.stderr)
        // a node ffmpeg can't open is there all the same: its check says why
        const vaapi: Found = {
          device: node,
          name: driver?.name ?? null,
          vendor: driver?.vendor ?? 'other',
          unavailable: null,
        }
        next.vaapi = encoder('vaapi', vaapi)
        next.qsv = encoder(
          'qsv',
          driver?.driver === 'i965'
            ? { ...vaapi, unavailable: t('unavailable.i965') }
            : driver && driver.vendor !== 'intel'
              ? { ...vaapi, unavailable: t('unavailable.notIntel', { name: driver.name }) }
              : vaapi,
        )
      }
    }

    // NVENC: a CUDA device ffmpeg can open, which NVIDIA's container toolkit gives the container
    if (host.platform !== 'linux') next.nvenc = none(t('unavailable.linux'))
    else {
      const cuda = await host.run(ffmpeg, probeArgs('nvenc', null), 15_000)
      // a card on the bus that ffmpeg can't open means the host step is missing (install-
      // simplicity.md › A): NVIDIA is vendor 0x10de, and class 0x03 a display controller
      if (cuda.code !== 0)
        next.nvenc = none(
          t(host.pci().some(nvidiaCard) ? 'unavailable.nvidiaHost' : 'unavailable.nvidia'),
        )
      else {
        const smi = await host.run(
          'nvidia-smi',
          ['--query-gpu=name', '--format=csv,noheader'],
          10_000,
        )
        const name = (smi.code === 0 && smi.stdout.trim().split('\n')[0]?.trim()) || 'NVIDIA GPU'
        next.nvenc = encoder('nvenc', {
          device: 'cuda:0',
          name,
          vendor: 'nvidia',
          unavailable: null,
        })
      }
    }

    // VideoToolbox: macOS, outside Docker (4.3's answer 4)
    if (host.platform !== 'darwin' || host.inContainer())
      next.videotoolbox = none(t('unavailable.mac'))
    else {
      const vt = await host.run(ffmpeg, probeArgs('videotoolbox', null), 15_000)
      const chip = await host.run('sysctl', ['-n', 'machdep.cpu.brand_string'], 5_000)
      next.videotoolbox = encoder(
        'videotoolbox',
        vt.code === 0
          ? {
              device: null,
              name: chip.stdout.trim() || 'This Mac',
              vendor: 'apple',
              unavailable: null,
            }
          : none(t('unavailable.mac')),
      )
    }
    found = next
    log.info('hardware found', {
      paths: PATHS.map((p) => `${p}: ${found[p].unavailable ?? found[p].name ?? found[p].device}`),
    })
  }

  /** The check's clip, made once. */
  async function clip(): Promise<string | null> {
    const dir = join(deps.dataDir, 'hardware')
    const path = join(dir, 'check-hdr10.mkv')
    if (existsSync(path)) return path
    mkdirSync(dir, { recursive: true })
    const part = join(dir, 'check-hdr10.part.mkv')
    const made = await host.run(ffmpeg, clipArgs(part), 5 * 60_000)
    if (made.code !== 0) {
      log.warn('the hardware check’s clip couldn’t be made', { log: lastLine(made.stderr) })
      return null
    }
    await rename(part, path)
    return path
  }

  /** What went wrong, in words, from what ffmpeg wrote. */
  function failure(path: AccelPath, ran: Ran): string {
    const text = ran.stderr
    if (ran.code === null && /timed? ?out|ETIMEDOUT|SIGTERM/i.test(text)) return t('check.timedOut')
    if (path === 'nvenc' && /libcuda|CUDA_ERROR_NO_DEVICE|cuInit|No device available/i.test(text))
      return t('check.nvidia')
    // MFX_ERR_NOT_FOUND (-9): oneVPL has no runtime for this chip. Its GPU runtime starts at Tiger
    // Lake (https://github.com/intel/vpl-gpu-rt), and Media SDK's, for older chips, isn't in trixie.
    if (path === 'qsv' && /creating a MFX session: -9\b/.test(text)) return t('check.qsvOlder')
    if (path === 'qsv' && /MFX|mfx|libvpl|Error creating a QSV device|qsv/i.test(text))
      return t('check.mediaDriver')
    if (
      (path === 'vaapi' || path === 'qsv') &&
      /Failed to (open|initialise) VAAPI|No such file|Permission denied|Device creation failed/i.test(
        text,
      )
    )
      return t('check.openDri', { device: found[path].device ?? '/dev/dri' })
    return t('check.failed', { line: lastLine(text) || `code ${ran.code}` })
  }

  /** The check running now, finishing in the background. */
  let running: Promise<void> | null = null

  /**
   * Checks a path: the clip transcoded on it, Intel's low-power encoder first, then again with
   * its tone mapping. Runs in the background; `playback.updated` says when it's done.
   */
  async function check(path: AccelPath) {
    if (checking.size) throw new AppError('conflict', 'A check is already running.')
    checking.add(path)
    changed()
    try {
      await detect()
      const f = found[path]
      if (f.unavailable) throw new AppError('conflict', f.unavailable, { reason: 'unavailable' })
      running = run(path, f)
        .catch((e: Error) =>
          log.error('a hardware check failed to run', { path, error: e.message }),
        )
        .finally(() => {
          checking.delete(path)
          running = null
          changed()
        })
    } catch (e) {
      checking.delete(path)
      changed()
      throw e
    }
  }

  /**
   * Checks, one at a time, every path this host has that has no check on its device and driver:
   * at a new install's first boot, and after a new chip or driver. So highsea starts using the
   * graphics chip on its own, and Settings › Playback is only for changing it (the owner,
   * 2026-10-28). A failed check isn't run again by itself.
   */
  async function checkNew() {
    // a check pressed meanwhile is waited for: it sets `checking` at once, `running` once it starts
    const idle = async () => {
      while (checking.size) await (running ?? new Promise((r) => setTimeout(r, 50)))
    }
    for (const path of PATHS) {
      await idle()
      if (found[path].unavailable || checkOf(path)) continue
      log.info('checking hardware acceleration found on this host', { path })
      try {
        await check(path)
      } catch (e) {
        // a check pressed in the meantime, or the path gone since: the next one goes on
        log.warn('couldn’t check hardware acceleration', { path, error: (e as Error).message })
      }
    }
    await idle()
  }

  async function run(path: AccelPath, f: Found) {
    const at = clock.now()
    const fp = fingerprint(f)
    const fail = (detail: string, ran?: Ran) => {
      log.warn('a hardware check failed', {
        path,
        device: f.device,
        name: f.name,
        detail,
        log: ran?.stderr.trim().split('\n').slice(-LOG_LINES).join('\n'),
      })
      keep(path, {
        result: 'fail',
        fps: null,
        detail,
        at,
        lowPower: false,
        toneMap: false,
        fingerprint: fp,
      })
    }
    const missing = FILTERS[path].filter((n) => !filters.has(n))
    if (missing.length)
      return fail(t('check.failed', { line: `this ffmpeg has no ${missing.join(', ')}` }))
    const source = await clip()
    if (!source) return fail(t('check.noClip'))
    const accel = (lowPower: boolean, toneMap: boolean): Accel => ({
      path,
      vendor: f.vendor,
      device: f.device,
      lowPower,
      toneMap,
    })
    // Intel's low-power encoder first, which the check answers instead of a switch (the spec's
    // open question)
    const tries =
      (path === 'vaapi' || path === 'qsv') && f.vendor === 'intel' ? [true, false] : [false]
    let passed: { lowPower: boolean; ran: Ran } | null = null
    let last: Ran | null = null
    for (const lowPower of tries) {
      const ran = await host.run(
        ffmpeg,
        checkArgs(source, accel(lowPower, false), false),
        CHECK_TIMEOUT_MS,
      )
      if (ran.code === 0) {
        passed = { lowPower, ran }
        break
      }
      last = ran
    }
    if (!passed) return fail(failure(path, last as Ran), last as Ran)
    // then its tone mapping, where this ffmpeg has the filters
    let toneMap = false
    if (TONE_MAP_FILTERS[path](f.vendor).every((n) => filters.has(n))) {
      const mapped = await host.run(
        ffmpeg,
        checkArgs(source, accel(passed.lowPower, true), true),
        CHECK_TIMEOUT_MS,
      )
      toneMap = mapped.code === 0
      if (!toneMap)
        log.info('a path’s tone mapping failed its check, so HDR is tone mapped elsewhere', {
          path,
          log: lastLine(mapped.stderr),
        })
    }
    const fps = Math.round(CHECK_FRAMES / (passed.ran.ms / 1000))
    const cpu = cpuToneMap()
    keep(path, {
      result: 'pass',
      fps,
      detail: t('check.passed', {
        lowPower: String(passed.lowPower),
        toneMap: toneMap ? 'gpu' : cpu ? 'cpu' : 'none',
      }),
      at,
      lowPower: passed.lowPower,
      toneMap,
      fingerprint: fp,
    })
    log.info('a hardware check passed', {
      path,
      name: f.name,
      fps,
      lowPower: passed.lowPower,
      toneMap,
    })
  }

  /** A film's run failed on the path: its check is marked failed, and Automatic stops using it. */
  function failedPlaying(path: AccelPath, lines: string[]) {
    const f = found[path]
    keep(path, {
      result: 'fail',
      fps: null,
      detail: t('check.failedPlaying'),
      at: clock.now(),
      lowPower: false,
      toneMap: false,
      fingerprint: fingerprint(f),
    })
    log.warn('a path failed while a film played, and is no longer used', {
      path,
      log: lines.slice(-LOG_LINES).join('\n'),
    })
    changed()
  }

  const cpuToneMap = () => CPU_TONE_MAP_FILTERS.every((n) => filters.has(n))

  /** The path transcodes take now, and tone mapping, as the runner reads them for each run. */
  function current(): Hardware {
    const s = deps.settings()
    const paths = PATHS.flatMap((path) => {
      const c = found[path].unavailable ? null : checkOf(path)
      return c ? [{ path, passed: c.result === 'pass', check: c }] : []
    })
    const chosen = choosePath(s.acceleration, paths)
    return {
      accel: chosen
        ? {
            path: chosen.path,
            vendor: found[chosen.path].vendor,
            device: found[chosen.path].device,
            lowPower: chosen.check.lowPower,
            toneMap: chosen.check.toneMap,
          }
        : null,
      toneMapping: s.toneMapping,
      cpuToneMap: cpuToneMap(),
    }
  }

  /** Each path as Settings › Playback shows it. */
  function paths(): PathStatus[] {
    return PATHS.map((id) => {
      const f = found[id]
      const c = f.unavailable ? null : checkOf(id)
      return {
        id,
        device: f.device,
        name: f.name,
        check: c
          ? { result: c.result, fps: c.fps, detail: c.detail, at: new Date(c.at).toISOString() }
          : null,
        unavailable: f.unavailable,
        checking: checking.has(id),
      }
    })
  }

  return {
    detect,
    /** At boot: looks, and tells Settings › Playback what it found. */
    start: async () => {
      await detect()
      changed()
    },
    check,
    checkNew,
    current,
    paths,
    /** System › Health's line when an NVIDIA card is in the computer but not the container. */
    issues: (): { id: string; message: string }[] =>
      found.nvenc.unavailable === t('unavailable.nvidiaHost')
        ? [{ id: 'nvidia-host', message: found.nvenc.unavailable }]
        : [],
    inUse: () => current().accel?.path ?? null,
    failedPlaying,
  }
}

export type HardwareService = ReturnType<typeof createHardware>
