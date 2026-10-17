// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { COMPRESSOR, defaultSoundPack, expandVoices, NAVIGATE_THROTTLE_MS } from '@highsea/tokens'
import { createSoundPlayer, dbToGain } from '../src/sound/player.ts'

type Call = [method: string, ...args: number[]]

/** A recording stand-in for AudioContext: enough of the API to see what gets scheduled. */
class FakeParam {
  value = 0
  calls: Call[] = []
  setValueAtTime(v: number, t: number) {
    this.calls.push(['set', v, t])
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(['linear', v, t])
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.calls.push(['exp', v, t])
  }
}

class FakeNode {
  outputs: FakeNode[] = []
  constructor(
    readonly kind: string,
    readonly ctx: FakeContext,
  ) {
    ctx.nodes.push(this)
  }
  connect(to: FakeNode) {
    this.outputs.push(to)
    return to
  }
}

class FakeContext {
  nodes: FakeNode[] = []
  currentTime = 1
  sampleRate = 48000
  state = 'running'
  destination = new FakeNode('destination', this)
  closed = false
  gain() {
    return Object.assign(new FakeNode('gain', this), { gain: new FakeParam() })
  }
  createGain() {
    return this.gain()
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode('compressor', this), {
      threshold: new FakeParam(),
      ratio: new FakeParam(),
    })
  }
  createDelay() {
    return Object.assign(new FakeNode('delay', this), { delayTime: new FakeParam() })
  }
  createBiquadFilter() {
    return Object.assign(new FakeNode('filter', this), {
      type: '',
      frequency: new FakeParam(),
      Q: new FakeParam(),
    })
  }
  createBuffer(_c: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  source(kind: string) {
    return Object.assign(new FakeNode(kind, this), {
      started: -1,
      stopped: -1,
      start(t: number) {
        this.started = t
      },
      stop(t: number) {
        this.stopped = t
      },
    })
  }
  createBufferSource() {
    return Object.assign(this.source('noise'), { buffer: null })
  }
  createOscillator() {
    return Object.assign(this.source('osc'), { type: '', frequency: new FakeParam() })
  }
  resume() {
    return Promise.resolve()
  }
  close() {
    this.closed = true
    return Promise.resolve()
  }
  of(kind: string) {
    return this.nodes.filter((n) => n.kind === kind)
  }
}

function setup(enabled = true) {
  const ctx = new FakeContext()
  const player = createSoundPlayer({
    enabled,
    createContext: () => ctx as unknown as AudioContext,
  })
  return { ctx, player }
}

const sources = (ctx: FakeContext) => [...ctx.of('osc'), ...ctx.of('noise')]

describe('sound player', () => {
  test('stays silent while off, unless forced', () => {
    const { ctx, player } = setup(false)
    player.play('select')
    expect(ctx.nodes.length).toBe(1) // only the destination: no graph built
    player.play('select', { force: true })
    expect(sources(ctx).length).toBe(expandVoices(defaultSoundPack.events.select).length)
  })

  test('builds the master chain the offline renderer mirrors', () => {
    const { ctx, player } = setup()
    player.play('select')
    const [comp] = ctx.of('compressor') as unknown as {
      threshold: FakeParam
      ratio: FakeParam
      outputs: FakeNode[]
    }[]
    expect(comp?.threshold.value).toBe(COMPRESSOR.threshold)
    expect(comp?.ratio.value).toBe(COMPRESSOR.ratio)
    expect(comp?.outputs[0]).toBe(ctx.destination)
    const delay = ctx.of('delay')[0] as unknown as { delayTime: FakeParam }
    expect(delay.delayTime.value).toBe(defaultSoundPack.room?.time as number)
  })

  test('schedules each voice with a linear attack and an exponential decay', () => {
    const { ctx, player } = setup()
    player.play('back')
    const voices = expandVoices(defaultSoundPack.events.back)
    const first = voices[0]
    if (!first) throw new Error('no voices')
    // envelopes are the gains created after the master, room bus and per-play bus
    const envelopes = (ctx.of('gain') as unknown as { gain: FakeParam }[]).filter((g) =>
      g.gain.calls.some((c) => c[0] === 'exp'),
    )
    expect(envelopes.length).toBe(voices.length)
    const start = 1 + 0.01 + (first.at ?? 0)
    const attack = first.attack ?? 0.003
    expect(envelopes[0]?.gain.calls).toEqual([
      ['set', 0.0001, start],
      ['linear', first.gain, start + attack],
      ['exp', 0.0001, start + attack + first.dur],
    ])
  })

  test('throttles navigate to one every 80ms', () => {
    const { ctx, player } = setup()
    const per = expandVoices(defaultSoundPack.events.navigate).length
    player.play('navigate')
    ctx.currentTime += (NAVIGATE_THROTTLE_MS - 10) / 1000
    player.play('navigate')
    expect(sources(ctx).length).toBe(per)
    ctx.currentTime += 20 / 1000
    player.play('navigate')
    expect(sources(ctx).length).toBe(per * 2)
  })

  test('a new event cuts a different one still sounding, but not notify', () => {
    const { ctx, player } = setup()
    player.play('success')
    const successBus = ctx.of('gain').at(-1 - expandVoices(defaultSoundPack.events.success).length)
    ctx.currentTime += 0.05
    player.play('select')
    const bus = successBus as unknown as { gain: FakeParam }
    expect(bus.gain.calls.at(-1)?.[0]).toBe('linear')
    expect(bus.gain.calls.at(-1)?.[1]).toBe(0)

    const fresh = setup()
    fresh.player.play('select')
    const selectBus = fresh.ctx
      .of('gain')
      .at(-1 - expandVoices(defaultSoundPack.events.select).length) as unknown as {
      gain: FakeParam
    }
    fresh.player.play('notify')
    expect(selectBus.gain.calls).toEqual([])
  })

  test('volume scales the master gain', () => {
    const { ctx, player } = setup()
    player.play('select')
    player.setVolume(dbToGain(-6))
    const master = ctx.of('gain')[0] as unknown as { gain: FakeParam }
    expect(master.gain.value).toBeCloseTo(defaultSoundPack.gain * 0.501, 3)
  })

  test('dispose closes the context', () => {
    const { ctx, player } = setup()
    player.play('select')
    player.dispose()
    expect(ctx.closed).toBe(true)
  })
})
