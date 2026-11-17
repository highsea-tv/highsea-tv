// SPDX-License-Identifier: AGPL-3.0-only
// The sound pair (src/native/sound.ts and sound.web.ts): Web Audio on the web, silent elsewhere.
import { describe, expect, test } from 'bun:test'
import { defaultSoundPack, expandVoices } from '@highsea-tv/tokens'
import * as native from '../../src/native/sound.ts'
import * as web from '../../src/native/sound.web.ts'

/** Just enough of AudioContext to count what's scheduled. */
function fakeContext() {
  const made: string[] = []
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  })
  const node = (kind: string, extra: object = {}) => {
    made.push(kind)
    return { connect: (to: unknown) => to, ...extra }
  }
  const source = (kind: string, extra: object) => node(kind, { start() {}, stop() {}, ...extra })
  const ctx = {
    currentTime: 1,
    sampleRate: 8000,
    state: 'running',
    destination: node('destination'),
    createGain: () => node('gain', { gain: param() }),
    createDynamicsCompressor: () => node('compressor', { threshold: param(), ratio: param() }),
    createDelay: () => node('delay', { delayTime: param() }),
    createBiquadFilter: () => node('filter', { frequency: param(), Q: param() }),
    createBuffer: (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) }),
    createBufferSource: () => source('noise', { buffer: null }),
    createOscillator: () => source('osc', { frequency: param() }),
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
  }
  return { ctx, made }
}

describe('sound pair', () => {
  test('the two sides export the same values', () => {
    expect(Object.keys(web).sort()).toEqual(Object.keys(native).sort())
    expect(web.dbToGain(-6)).toBe(native.dbToGain(-6))
  })

  test('on the web, a forced preview plays the pack even while sound is off', () => {
    const { ctx, made } = fakeContext()
    const player = web.createSoundPlayer({ enabled: false, createContext: () => ctx })
    player.play('select')
    expect(made).toEqual(['destination'])
    player.play('select', { force: true })
    const voices = made.filter((k) => k === 'osc' || k === 'noise').length
    expect(voices).toBe(expandVoices(defaultSoundPack.events.select).length)
  })

  test('elsewhere, the player keeps its setting and plays nothing', () => {
    const player = native.createSoundPlayer({ enabled: true })
    expect(player.enabled).toBe(true)
    player.setEnabled(false)
    expect(player.enabled).toBe(false)
    expect(() => player.play('select', { force: true })).not.toThrow()
  })
})
