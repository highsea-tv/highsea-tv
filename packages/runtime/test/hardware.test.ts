// SPDX-License-Identifier: AGPL-3.0-only
// Hardware acceleration (checkpoint 4.3b, ADR 0056) over a fake host, so no GPU or ffmpeg is
// needed: what detection finds on each kind of host, a check passing (Intel's low-power encoder
// first), failing in words, forgotten when the driver changes, one at a time, run by itself at
// boot, and a path that fails while a film plays stopping being used.
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlaybackSettings } from '@highsea-tv/api-contract'
import { createEventBus, createFakeClock, type ServerEvent, silentLogger } from '@highsea-tv/core'
import { migrate, openDatabase } from '@highsea-tv/db'
import { createHardware, type Host, type Ran } from '../src/hardware.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const ok = (stdout = '', stderr = '', ms = 4000): Ran => ({ code: 0, stdout, stderr, ms })
const failed = (stderr: string): Ran => ({ code: 1, stdout: '', stderr, ms: 50 })
const list = (names: string[]) => names.map((n) => ` V....D ${n}  something`).join('\n')
const ENCODERS = list(['libx264', 'h264_vaapi', 'h264_qsv', 'h264_nvenc', 'h264_videotoolbox'])
const FILTERS = list([
  'scale',
  'scale_vaapi',
  'tonemap_vaapi',
  'vpp_qsv',
  'hwmap',
  'hwupload',
  'hwdownload',
  'scale_cuda',
  'libplacebo',
  'scale_vt',
  'zscale',
  'tonemap',
])
const IHD =
  '[AVHWDeviceContext @ 0x5] VAAPI driver: Intel iHD driver for Intel(R) Gen Graphics - 24.1.0 ().\n'
const I965 =
  '[AVHWDeviceContext @ 0x5] VAAPI driver: Intel i965 driver for Intel(R) Coffee Lake - 2.4.1.\n'
const AMD =
  '[AVHWDeviceContext @ 0x5] VAAPI driver: Mesa Gallium driver 24.2.8-1 for AMD Radeon RX 6600 (radeonsi, navi23, LLVM 19.1.4).\n'

/** A host whose commands answer from `answer`; anything it doesn't answer fails. */
function fakeHost(over: Partial<Host> & { answer?: (args: string[]) => Ran | undefined } = {}) {
  const calls: string[][] = []
  const host: Host = {
    platform: 'linux',
    inContainer: () => true,
    dri: () => ['card0', 'renderD128'],
    run: async (command, args) => {
      calls.push([command, ...args])
      if (args.includes('-encoders')) return ok(ENCODERS)
      if (args.includes('-filters')) return ok(FILTERS)
      // the check's clip: written where it was asked for
      if (args.includes('libx265')) {
        writeFileSync(args[args.length - 1] as string, 'clip')
        return ok()
      }
      return over.answer?.(args) ?? failed('No device available')
    },
    ...over,
  }
  return { host, calls }
}

function setup(host: Host, settings: Partial<PlaybackSettings> = {}) {
  const database = openDatabase(':memory:')
  migrate(database.raw)
  const clock = createFakeClock()
  const events = createEventBus({ now: clock.now })
  const seen: ServerEvent[] = []
  events.subscribe((e) => seen.push(e))
  const dataDir = mkdtempSync(join(tmpdir(), 'highsea-hw-'))
  dirs.push(dataDir)
  const now = { acceleration: 'auto' as const, toneMapping: true, ...settings }
  const hardware = createHardware({
    db: database.db,
    clock,
    events,
    logger: silentLogger,
    dataDir,
    ffmpeg: 'ffmpeg',
    settings: () => now,
    host,
  })
  return { hardware, seen, now }
}

/** Waits for the background check to finish. */
async function settled(hardware: ReturnType<typeof createHardware>) {
  for (let i = 0; i < 100 && hardware.paths().some((p) => p.checking); i++) await Bun.sleep(5)
}

/** Opening the render node with VAAPI (detection's probe). */
const opens = (args: string[]) =>
  args.includes('color=black:s=64x64:d=0.1') && args.join(' ').includes('vaapi=va:')
const lowPower = (args: string[]) => args.join(' ').includes('-low_power 1')
const toneMaps = (args: string[]) => /tonemap|libplacebo/.test(args.join(' '))

describe('hardware acceleration (4.3b)', () => {
  test('an Intel iHD host: VAAPI and QSV there, NVENC and VideoToolbox not', async () => {
    const { host } = fakeHost({
      answer: (args) =>
        opens(args) && args.includes('vaapi=va:/dev/dri/renderD128') ? ok('', IHD) : undefined,
    })
    const { hardware, seen } = setup(host)
    await hardware.start()
    const paths = hardware.paths()
    expect(paths.map((p) => [p.id, p.name, p.device, p.unavailable])).toEqual([
      ['vaapi', 'Intel graphics (iHD 24.1.0)', '/dev/dri/renderD128', null],
      ['qsv', 'Intel graphics (iHD 24.1.0)', '/dev/dri/renderD128', null],
      ['nvenc', null, null, 'No NVIDIA GPU in the container.'],
      ['videotoolbox', null, null, 'Only when highsea runs on a Mac, outside Docker.'],
    ])
    expect(seen.map((e) => e.topic)).toContain('playback.updated')
    // nothing is used until a check passes
    expect(hardware.current().accel).toBeNull()
    expect(hardware.inUse()).toBeNull()
  })

  test('QSV only with Intel’s media driver, and only on Intel', async () => {
    for (const [log, why] of [
      [I965, 'Only with Intel’s media driver (iHD). This chip has the older i965 driver.'],
      [AMD, 'Only on Intel graphics. This is AMD Radeon RX 6600.'],
    ] as const) {
      const { host } = fakeHost({ answer: (args) => (opens(args) ? ok('', log) : undefined) })
      const { hardware } = setup(host)
      await hardware.detect()
      const [vaapi, qsv] = hardware.paths()
      expect(vaapi?.unavailable).toBeNull()
      expect(qsv?.unavailable).toBe(why)
    }
  })

  test('no /dev/dri, an ffmpeg without the encoder, and a Mac', async () => {
    const bare = setup(fakeHost({ dri: () => [] }).host).hardware
    await bare.detect()
    expect(bare.paths()[0]?.unavailable).toBe('No /dev/dri in the container.')

    const { host } = fakeHost({
      run: async (_, args) => {
        if (args.includes('-encoders')) return ok(list(['libx264', 'h264_vaapi']))
        if (args.includes('-filters')) return ok(FILTERS)
        return opens(args) ? ok('', IHD) : failed('')
      },
    })
    const noQsv = setup(host).hardware
    await noQsv.detect()
    expect(noQsv.paths()[1]?.unavailable).toBe('This ffmpeg can’t encode with h264_qsv.')

    const mac = setup(
      fakeHost({
        platform: 'darwin',
        inContainer: () => false,
        run: async (command, args) => {
          if (args.includes('-encoders')) return ok(ENCODERS)
          if (args.includes('-filters')) return ok(FILTERS)
          if (command === 'sysctl') return ok('Apple M2 Max\n')
          return args.includes('videotoolbox=vt') ? ok() : failed('')
        },
      }).host,
    ).hardware
    await mac.detect()
    expect(mac.paths().map((p) => [p.id, p.name, p.unavailable])).toEqual([
      ['vaapi', null, 'Only when highsea runs on Linux.'],
      ['qsv', null, 'Only when highsea runs on Linux.'],
      ['nvenc', null, 'Only when highsea runs on Linux.'],
      ['videotoolbox', 'Apple M2 Max', null],
    ])
  })

  test('a check passes on Intel’s low-power encoder first, with its tone mapping, and is used', async () => {
    const { host, calls } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_vaapi')) return ok('', '', 2000)
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('vaapi')
    expect(hardware.paths()[0]?.checking).toBe(true)
    await settled(hardware)
    const checks = calls.filter((c) => c.includes('h264_vaapi'))
    expect(checks.map((c) => [lowPower(c), toneMaps(c)])).toEqual([
      [true, false],
      [true, true],
    ])
    const vaapi = hardware.paths()[0]
    expect(vaapi?.check).toMatchObject({
      result: 'pass',
      fps: 120,
      detail:
        'Decodes 10-bit HEVC and encodes H.264 in low-power mode. Tone maps HDR on the graphics chip.',
    })
    expect(hardware.current().accel).toEqual({
      path: 'vaapi',
      vendor: 'intel',
      device: '/dev/dri/renderD128',
      lowPower: true,
      toneMap: true,
    })
    expect(hardware.inUse()).toBe('vaapi')
  })

  test('without low power, and a tone mapping that fails goes to the processor', async () => {
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_qsv') && !lowPower(args) && !toneMaps(args)) return ok()
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('qsv')
    await settled(hardware)
    expect(hardware.paths()[1]?.check).toMatchObject({
      result: 'pass',
      detail: 'Decodes 10-bit HEVC and encodes H.264. HDR is tone mapped on the processor.',
    })
    expect(hardware.current().accel).toMatchObject({ path: 'qsv', lowPower: false, toneMap: false })
  })

  test('a failed check says why in words, and isn’t used', async () => {
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_vaapi'))
          return failed(
            '[AVHWDeviceContext @ 0x5] Failed to initialise VAAPI connection: -1 (unknown libva error).',
          )
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('vaapi')
    await settled(hardware)
    expect(hardware.paths()[0]?.check).toMatchObject({
      result: 'fail',
      fps: null,
      detail:
        'highsea couldn’t open /dev/dri/renderD128. Pass /dev/dri through to the container, as the install guide shows.',
    })
    expect(hardware.current().accel).toBeNull()
  })

  test('Quick Sync on a chip older than oneVPL’s runtime says so', async () => {
    // What the DS1520+'s Celeron J4125 (Gemini Lake) wrote, 2026-10-28
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_qsv'))
          return failed(
            '[AVHWDeviceContext @ 0x5630b971b6c0] Error creating a MFX session: -9.\nDevice creation failed: -1313558101.',
          )
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('qsv')
    await settled(hardware)
    expect(hardware.paths()[1]?.check).toMatchObject({
      result: 'fail',
      detail:
        'Quick Sync needs Intel graphics from Tiger Lake (2020) on, and these are older. VAAPI works on them.',
    })
  })

  test('one check at a time, and none on a path this host can’t use', async () => {
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_vaapi')) return ok()
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('vaapi')
    await expect(hardware.check('qsv')).rejects.toMatchObject({ code: 'conflict' })
    await settled(hardware)
    await expect(hardware.check('nvenc')).rejects.toMatchObject({
      code: 'conflict',
      message: 'No NVIDIA GPU in the container.',
    })
  })

  test('at boot, every path found without a check is checked by itself, and the first that passed is used', async () => {
    const { host, calls } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_vaapi')) return ok()
        // QSV fails: VAAPI is still used
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.checkNew()
    expect(hardware.paths().map((p) => [p.id, p.check?.result ?? null, p.checking])).toEqual([
      ['vaapi', 'pass', false],
      ['qsv', 'fail', false],
      ['nvenc', null, false],
      ['videotoolbox', null, false],
    ])
    expect(hardware.inUse()).toBe('vaapi')
    // at the next boot, nothing checked already on this driver is checked again, failed or not
    const before = calls.length
    await hardware.checkNew()
    expect(
      calls.slice(before).some((c) => c.includes('h264_vaapi') || c.includes('h264_qsv')),
    ).toBe(false)
  })

  test('a check pressed during boot’s checks is waited for, not skipped', async () => {
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_vaapi') || args.includes('h264_qsv')) return ok()
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('qsv')
    await hardware.checkNew()
    expect(hardware.paths().map((p) => p.check?.result ?? null)).toEqual([
      'pass',
      'pass',
      null,
      null,
    ])
  })

  test('a check is forgotten when the driver changes', async () => {
    let log = IHD
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', log)
        if (args.includes('h264_vaapi')) return ok()
      },
    })
    const { hardware } = setup(host)
    await hardware.start()
    await hardware.check('vaapi')
    await settled(hardware)
    expect(hardware.paths()[0]?.check?.result).toBe('pass')
    log = IHD.replace('24.1.0', '25.2.0')
    await hardware.detect()
    expect(hardware.paths()[0]?.check).toBeNull()
    expect(hardware.current().accel).toBeNull()
  })

  test('Use: Off and a named path; a failure while playing stops Automatic using it', async () => {
    const { host } = fakeHost({
      answer: (args) => {
        if (opens(args)) return ok('', IHD)
        if (args.includes('h264_vaapi') || args.includes('h264_qsv')) return ok()
      },
    })
    const { hardware, now, seen } = setup(host)
    await hardware.start()
    for (const path of ['vaapi', 'qsv'] as const) {
      await hardware.check(path)
      await settled(hardware)
    }
    expect(hardware.inUse()).toBe('vaapi')
    Object.assign(now, { acceleration: 'qsv' })
    expect(hardware.inUse()).toBe('qsv')
    Object.assign(now, { acceleration: 'off' })
    expect(hardware.inUse()).toBeNull()
    expect(hardware.current().toneMapping).toBe(true)
    expect(hardware.current().cpuToneMap).toBe(true)

    Object.assign(now, { acceleration: 'auto' })
    const before = seen.length
    hardware.failedPlaying('vaapi', ['[h264_vaapi @ 0x5] Failed to end picture encode issue: 23'])
    expect(seen.length).toBe(before + 1)
    expect(hardware.paths()[0]?.check).toMatchObject({
      result: 'fail',
      detail:
        'A film’s transcode failed on it, so the film went on on the processor. System › Logs has ffmpeg’s output.',
    })
    expect(hardware.inUse()).toBe('qsv')
  })
})
