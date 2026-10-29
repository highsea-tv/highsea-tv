// SPDX-License-Identifier: AGPL-3.0-only
// The player's state (ADR 0055): the stream's states, the chrome, reporting, Next up, subtitle
// cues with the offset, trickplay tiles and the browser's report. No DOM: the clock is passed in.
import { describe, expect, test } from 'bun:test'
import {
  BUFFERING_DELAY_MS,
  baseProfile,
  chromeShown,
  clampSeek,
  createPlayerText,
  cuesAt,
  cueText,
  deviceReport,
  HIDE_MS,
  initialPlayer,
  NUDGE_LIMIT_MS,
  nextChange,
  nextUpIn,
  nudged,
  type PlayerEvent,
  type PlayerState,
  playerReducer,
  REPORT_MS,
  reportDue,
  streamState,
  trickplayTile,
} from '../src/player/index.ts'

const run = (...events: PlayerEvent[]) => events.reduce(playerReducer, initialPlayer())
/** A film 100 s long, playing from 20 s, started at t=0. */
const playing = (method: PlayerState['method'] = 'direct-play') =>
  run(
    { type: 'start', at: 0 },
    { type: 'session', method: method ?? 'direct-play', start: 20, duration: 100, at: 0 },
    { type: 'ready' },
    { type: 'play' },
  )

describe('the stream’s states', () => {
  test('a stream the server makes is Getting it ready until the video can play', () => {
    for (const method of ['direct-stream', 'transcode'] as const) {
      const s = run(
        { type: 'start', at: 0 },
        { type: 'session', method, start: 0, duration: 100, at: 0 },
      )
      expect(streamState(s, 0, false)).toBe('preparing')
      expect(streamState(playerReducer(s, { type: 'ready' }), 5000, false)).toBe('normal')
    }
  })

  test('direct play waits quietly, then shows Buffering after a second', () => {
    const s = run(
      { type: 'start', at: 0 },
      { type: 'session', method: 'direct-play', start: 0, duration: 100, at: 0 },
    )
    expect(streamState(s, BUFFERING_DELAY_MS - 1, false)).toBe('normal')
    expect(nextChange(s, 10)).toBe(BUFFERING_DELAY_MS)
    expect(streamState(s, BUFFERING_DELAY_MS, false)).toBe('buffering')
  })

  test('asking for the session waits like a stall, never as Getting it ready', () => {
    const s = run({ type: 'start', at: 0 })
    expect(streamState(s, 500, false)).toBe('normal')
    expect(streamState(s, 1500, false)).toBe('buffering')
    expect(streamState(initialPlayer(), 9999, false)).toBe('normal')
  })

  test('a stall while playing is Buffering only after the delay, and clears when it plays', () => {
    const stalled = playerReducer(playing(), { type: 'waiting', at: 10_000 })
    expect(streamState(stalled, 10_500, false)).toBe('normal')
    expect(streamState(stalled, 11_000, false)).toBe('buffering')
    expect(nextChange(stalled, 10_500)).toBe(11_000)
    expect(nextChange(stalled, 11_500)).toBeNull()
    const again = playerReducer(stalled, { type: 'ready' })
    expect(streamState(again, 20_000, false)).toBe('normal')
    // a second `waiting` during the same stall keeps when it began
    expect(playerReducer(stalled, { type: 'waiting', at: 10_900 }).waitingSince).toBe(10_000)
  })

  test('pausing clears a stall', () => {
    const s = run(
      ...([
        { type: 'start', at: 0 },
        { type: 'session', method: 'direct-play', start: 0, duration: 100, at: 0 },
        { type: 'ready' },
        { type: 'waiting', at: 10 },
        { type: 'pause' },
      ] as PlayerEvent[]),
    )
    expect(streamState(s, 5000, false)).toBe('normal')
  })

  test('unplayable and errors are Didn’t start; Try again starts over', () => {
    const none = run(
      { type: 'start', at: 0 },
      { type: 'session', method: 'unplayable', start: 0, duration: null, at: 0 },
    )
    expect(streamState(none, 0, false)).toBe('failed')
    const broke = playerReducer(playing('transcode'), {
      type: 'error',
      message: 'fragParsingError',
    })
    expect(streamState(broke, 0, false)).toBe('failed')
    expect(broke.error).toBe('fragParsingError')
    expect(broke.playing).toBe(false)
    // a late `canplay` from the dead stream doesn't undo it
    expect(streamState(playerReducer(broke, { type: 'ready' }), 0, false)).toBe('failed')
    const retry = playerReducer(broke, { type: 'start', at: 50 })
    expect(retry.error).toBeNull()
    expect(streamState(retry, 60, false)).toBe('normal')
  })

  test('stopped from Now playing keeps who stopped it and why', () => {
    const s = playerReducer(playing(), {
      type: 'stopped',
      by: { name: 'Ines', message: 'Restarting in five minutes.' },
    })
    expect(streamState(s, 0, true)).toBe('stopped')
    expect(s.stoppedBy?.name).toBe('Ines')
    expect(s.playing).toBe(false)
  })
})

describe('Next up', () => {
  const end = (position: number) => playerReducer(playing(), { type: 'time', position })

  test('shows in the last ten seconds when there is a next film', () => {
    expect(streamState(end(89), 0, true)).toBe('normal')
    expect(streamState(end(90), 0, true)).toBe('next-up')
    expect(streamState(end(95), 0, false)).toBe('normal')
  })

  test('counts down with the film, so it pauses when the film does', () => {
    expect(nextUpIn(end(90))).toBe(10)
    expect(nextUpIn(end(95.4))).toBe(5)
    expect(nextUpIn(playerReducer(end(99), { type: 'ended' }))).toBe(0)
  })

  test('Cancel holds until the person seeks back out of the ending', () => {
    const cancelled = playerReducer(end(92), { type: 'cancel-next' })
    expect(streamState(cancelled, 0, true)).toBe('normal')
    expect(streamState(playerReducer(cancelled, { type: 'time', position: 96 }), 0, true)).toBe(
      'normal',
    )
    const back = playerReducer(cancelled, { type: 'seek', position: 40 })
    expect(back.nextCancelled).toBe(false)
    expect(streamState(playerReducer(back, { type: 'time', position: 91 }), 0, true)).toBe(
      'next-up',
    )
  })

  test('never before the length is known', () => {
    const s = run(
      { type: 'start', at: 0 },
      { type: 'session', method: 'direct-play', start: 0, duration: null, at: 0 },
      { type: 'ready' },
    )
    expect(streamState(s, 0, true)).toBe('normal')
    expect(
      playerReducer(s, { type: 'duration', duration: Number.POSITIVE_INFINITY }).duration,
    ).toBe(0)
    expect(playerReducer(s, { type: 'duration', duration: 88 }).duration).toBe(88)
  })
})

describe('the chrome', () => {
  test('hides HIDE_MS after the last input while playing', () => {
    const s = playerReducer(playing(), { type: 'input', at: 1000 })
    expect(chromeShown(s, 1000 + HIDE_MS - 1)).toBe(true)
    expect(chromeShown(s, 1000 + HIDE_MS)).toBe(false)
  })

  test('stays while paused, waiting, starting or a panel is open', () => {
    const s = playing()
    const later = 60_000
    expect(chromeShown(s, later)).toBe(false)
    expect(chromeShown(s, later, true)).toBe(true)
    expect(chromeShown(playerReducer(s, { type: 'pause' }), later)).toBe(true)
    expect(chromeShown(playerReducer(s, { type: 'waiting', at: 1 }), later)).toBe(true)
    expect(chromeShown(playerReducer(s, { type: 'start', at: 1 }), later)).toBe(true)
  })
})

describe('reporting the position', () => {
  test('first report at once, then every REPORT_MS while playing and moving', () => {
    let s = playerReducer(playing(), { type: 'time', position: 21 })
    expect(reportDue(s, 0)).toBe(true)
    s = playerReducer(s, { type: 'reported', position: 21, at: 0 })
    s = playerReducer(s, { type: 'time', position: 25 })
    expect(reportDue(s, REPORT_MS - 1)).toBe(false)
    expect(reportDue(s, REPORT_MS)).toBe(true)
  })

  test('not while paused, stalled in place or before it plays', () => {
    let s = playerReducer(playing(), { type: 'reported', position: 20, at: 0 })
    expect(reportDue(s, REPORT_MS * 3)).toBe(false) // hasn't moved
    s = playerReducer(playerReducer(s, { type: 'time', position: 40 }), { type: 'pause' })
    expect(reportDue(s, REPORT_MS * 3)).toBe(false)
    expect(reportDue(run({ type: 'start', at: 0 }), REPORT_MS)).toBe(false)
  })
})

test('seeking stays inside the film', () => {
  expect(clampSeek({ duration: 100 }, -5)).toBe(0)
  expect(clampSeek({ duration: 100 }, 130)).toBe(100)
  expect(clampSeek({ duration: 0 }, 130)).toBe(130)
})

describe('subtitles', () => {
  const cues = [
    { startTime: 10, endTime: 12, text: 'One' },
    { startTime: 11.5, endTime: 13, text: 'Two' },
  ]

  test('the cues showing at a time, overlapping ones together', () => {
    expect(cuesAt(cues, 9.99, 0)).toEqual([])
    expect(cuesAt(cues, 10, 0)).toEqual(['One'])
    expect(cuesAt(cues, 11.7, 0)).toEqual(['One', 'Two'])
    expect(cuesAt(cues, 13, 0)).toEqual([])
  })

  test('a positive offset shows them later, a negative one earlier', () => {
    expect(cuesAt(cues, 10.2, 250)).toEqual([])
    expect(cuesAt(cues, 10.25, 250)).toEqual(['One'])
    expect(cuesAt(cues, 9.5, -500)).toEqual(['One'])
  })

  test('cue text without WebVTT’s tags and entities', () => {
    expect(cueText('<i>Where</i> did you go, <c.yellow>Scales</c>?')).toBe(
      'Where did you go, Scales?',
    )
    expect(cueText('Tom &amp; Jerry &lt;3')).toBe('Tom & Jerry <3')
  })

  test('nudges in 50 ms steps, inside the server’s limit', () => {
    expect(nudged(0, 1)).toBe(50)
    expect(nudged(100, -1)).toBe(50)
    expect(nudged(350, 0)).toBe(0)
    expect(nudged(NUDGE_LIMIT_MS, 1)).toBe(NUDGE_LIMIT_MS)
    expect(nudged(-NUDGE_LIMIT_MS, -1)).toBe(-NUDGE_LIMIT_MS)
  })

  test('the nudge in words', () => {
    const p = createPlayerText('en')
    expect(p.offsetLabel(0)).toBe('On time')
    expect(p.offsetLabel(150)).toBe('+150 ms')
    expect(p.offsetLabel(-50)).toBe('−50 ms')
    expect(p.offsetHint(0)).toBe('Subtitles match the audio track’s timing.')
    expect(p.offsetHint(200)).toBe('Subtitles appear 200 ms later.')
    expect(p.offsetHint(-200)).toBe('Subtitles appear 200 ms earlier.')
  })
})

describe('trickplay', () => {
  const m = { interval: 10, width: 320, height: 180, columns: 10, rows: 10, count: 150, sheets: 2 }

  test('the tile for a time, across then down, then the next sheet', () => {
    expect(trickplayTile(m, 0)).toEqual({ sheet: 0, x: 0, y: 0, width: 320, height: 180 })
    expect(trickplayTile(m, 129)).toMatchObject({ sheet: 0, x: 2 * 320, y: 1 * 180 })
    expect(trickplayTile(m, 1000)).toMatchObject({ sheet: 1, x: 0, y: 0 })
  })

  test('past the end shows the last thumbnail; an empty manifest none', () => {
    expect(trickplayTile(m, 99_999)).toMatchObject({ sheet: 1, x: 9 * 320, y: 4 * 180 })
    expect(trickplayTile({ ...m, count: 0 }, 5)).toBeNull()
  })
})

describe('the browser’s report', () => {
  test('the built-in profile from the user agent', () => {
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    expect(
      baseProfile(`${mac} AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15`),
    ).toBe('web-safari')
    expect(
      baseProfile(`${mac} AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36`),
    ).toBe('web-chromium-macos')
    expect(
      baseProfile('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0'),
    ).toBe('web-firefox')
    expect(
      baseProfile('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'),
    ).toBe('web-chromium')
  })

  test('only what the browser says it decodes', () => {
    const yes = new Set([
      'video/mp4; codecs="avc1.640028"',
      'video/mp4; codecs="hvc1.1.6.L120.90"',
      'audio/mp4; codecs="mp4a.40.2"',
      'audio/mp4; codecs="ec-3"',
    ])
    const r = deviceReport('web-safari', (t) => yes.has(t))
    expect(r.video?.map((v) => v.codec)).toEqual(['h264', 'hevc'])
    expect(r.video?.[1]).toEqual({ codec: 'hevc', profiles: ['main'], bitDepths: [8], tag: 'hvc1' })
    expect(r.audio).toEqual([
      { codec: 'aac', maxChannels: 8 },
      { codec: 'eac3', maxChannels: 8 },
    ])
    expect(r.hdr).toEqual({ formats: [], dolbyVision: [] })
    expect(deviceReport('web-chromium', (t) => yes.has(t)).video?.[1]).not.toHaveProperty('tag')
  })
})
