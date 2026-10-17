// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  checkSoundPack,
  defaultSoundPack,
  expandVoices,
  measure,
  renderEvent,
  type SoundPack,
} from '../src/index.ts'

/** Audible lengths measured in the browser on the signed-off board (docs/brand/direction.md#sound). */
const MEASURED_MS = {
  navigate: 17,
  select: 38,
  back: 44,
  success: 265,
  error: 178,
  notify: 356,
  arrival: 1027,
}

const withEvent = (event: keyof SoundPack['events'], voices: SoundPack['events']['navigate']) => ({
  ...defaultSoundPack,
  events: { ...defaultSoundPack.events, [event]: voices },
})

describe('default pack', () => {
  test('passes every loudness and length rule', () => {
    const report = checkSoundPack(defaultSoundPack)
    expect(report.issues).toEqual([])
    expect(report.pass).toBe(true)
  })

  test.each(Object.entries(MEASURED_MS))('%s renders as long as the browser measured', (e, ms) => {
    const { audibleMs } = measure(renderEvent(defaultSoundPack, e as keyof typeof MEASURED_MS))
    expect(Math.abs(audibleMs - ms)).toBeLessThan(3)
  })

  test('rendering is deterministic', () => {
    const a = renderEvent(defaultSoundPack, 'select').samples
    const b = renderEvent(defaultSoundPack, 'select').samples
    expect(a).toEqual(b)
  })
})

describe('rules', () => {
  test('a glide is rejected', () => {
    const pack = withEvent('back', [
      { wave: 'triangle', freq: 400, freqEnd: 200, dur: 0.05, gain: 0.1 },
    ])
    expect(checkSoundPack(pack).issues.join()).toMatch(/pitch moves 400 → 200/)
  })

  test('the room bus is only for notify and arrival', () => {
    const pack = withEvent('select', [
      { wave: 'triangle', freq: 560, dur: 0.05, gain: 0.1, room: true },
    ])
    expect(checkSoundPack(pack).issues.join()).toMatch(/only notify and arrival/)
  })

  test('a long interaction sound is rejected', () => {
    const pack = withEvent('select', [{ wave: 'triangle', freq: 560, dur: 0.4, gain: 0.1 }])
    expect(checkSoundPack(pack).issues.join()).toMatch(/select: \d+ ms audible; limit 60 ms/)
  })

  test('navigate must stay the quietest', () => {
    const pack = withEvent('navigate', [{ wave: 'triangle', freq: 1180, dur: 0.02, gain: 0.2 }])
    expect(checkSoundPack(pack).issues.join()).toMatch(/navigate must be the quietest/)
  })

  test('peaks outside −32…−16 dBFS are rejected', () => {
    const pack = { ...defaultSoundPack, gain: 2 }
    expect(checkSoundPack(pack).issues.join()).toMatch(/must be between −32 and −16/)
  })

  test('malformed packs fail validation before rendering', () => {
    const report = checkSoundPack({ ...defaultSoundPack, events: { navigate: [] } })
    expect(report.pass).toBe(false)
    expect(report.events).toEqual([])
  })
})

test('partials add copies on top of the fundamental', () => {
  const [note] = defaultSoundPack.events.success
  const voices = expandVoices([note as NonNullable<typeof note>])
  expect(voices.map((v) => v.freq)).toEqual([523.25, 1046.5])
  expect(voices[1]?.gain).toBeCloseTo(0.08 * 0.18)
})
