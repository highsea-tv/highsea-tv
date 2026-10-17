// SPDX-License-Identifier: AGPL-3.0-only
import {
  defaultSoundPack,
  MAX_AUDIBLE_MS,
  measure,
  NAVIGATE_THROTTLE_MS,
  PEAK_RANGE_DB,
  renderEvent,
  SOUND_EVENTS,
  type SoundEvent,
} from '@highsea/tokens'
import { Badge, Button, createSoundPlayer, dbToGain, Kbd } from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Page, Section } from './page.tsx'

const meta = { title: 'Foundations/Sound', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const fires: Record<SoundEvent, string> = {
  navigate: 'Focus moves by D-pad or arrow keys',
  select: 'A control is activated (OK, Enter, Space, tap)',
  back: 'Back or Escape leaves a level',
  success: 'A user action completes (added, saved, grabbed)',
  error: 'A user action fails, or input is rejected',
  notify: 'An announcement or notification arrives',
  arrival: 'A client launches and connects to its server',
}

const keys: Record<SoundEvent, string> = {
  navigate: '1',
  select: '2',
  back: '3',
  success: '4',
  error: '5',
  notify: '6',
  arrival: '7',
}

/** The event's offline render, drawn as a min/max envelope. */
function Waveform({ event }: { event: SoundEvent }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rendered = useMemo(() => renderEvent(defaultSoundPack, event), [event])
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { samples } = rendered
    const w = canvas.clientWidth * devicePixelRatio
    const h = canvas.clientHeight * devicePixelRatio
    canvas.width = w
    canvas.height = h
    const color = getComputedStyle(canvas).color
    ctx.fillStyle = color
    let peak = 0
    for (const s of samples) peak = Math.max(peak, Math.abs(s))
    const step = samples.length / w
    for (let x = 0; x < w; x++) {
      let lo = 0
      let hi = 0
      for (let i = Math.floor(x * step); i < Math.floor((x + 1) * step); i++) {
        const s = (samples[i] ?? 0) / peak
        lo = Math.min(lo, s)
        hi = Math.max(hi, s)
      }
      ctx.fillRect(x, h / 2 - (hi * h) / 2, 1, Math.max(1, ((hi - lo) * h) / 2))
    }
  }, [rendered])
  return <canvas ref={ref} aria-hidden className="h-14 w-full text-accent" />
}

export const Board: StoryObj = {
  name: 'Sound board',
  render: function Render() {
    const player = useMemo(() => createSoundPlayer({ enabled: true }), [])
    const [volume, setVolume] = useState(1)
    const [last, setLast] = useState<SoundEvent | null>(null)
    useEffect(() => () => player.dispose(), [player])
    useEffect(() => player.setVolume(volume), [player, volume])
    const play = (e: SoundEvent) => {
      player.play(e)
      setLast(e)
    }
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        const ev = SOUND_EVENTS.find((s) => keys[s] === e.key)
        if (ev && !e.metaKey && !e.ctrlKey) play(ev)
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    })
    const reports = useMemo(
      () =>
        Object.fromEntries(SOUND_EVENTS.map((e) => [e, measure(renderEvent(defaultSoundPack, e))])),
      [],
    )
    return (
      <Page
        title="Sound"
        lead={`Seven events, synthesized live with Web Audio from the "${defaultSoundPack.name}" pack — the same recipes native clients play as WAV. Short, soft and low; off by default everywhere except TV.`}
        doc="docs/design-language/sound.md"
      >
        <div className="flex flex-wrap items-center gap-4 rounded-lg bg-s1 p-4">
          <label className="flex items-center gap-3 text-ui">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="accent-(--color-accent)"
            />
          </label>
          <Button size="sm" variant="ghost" onClick={() => setVolume(dbToGain(-6))}>
            Admin level (−6 dB)
          </Button>
          <span className="text-caption text-text-3">
            Keys <Kbd>1</Kbd>–<Kbd>7</Kbd> play each event. Hold <Kbd>1</Kbd> to hear the{' '}
            {NAVIGATE_THROTTLE_MS}ms navigate throttle.
          </span>
        </div>
        <Section
          title="Events"
          note={`Rendered offline and measured: audible length (to −40 dB) and peak, which must sit between ${PEAK_RANGE_DB[0]} and ${PEAK_RANGE_DB[1]} dBFS.`}
        >
          <div className="grid gap-4 medium:grid-cols-2 wide:grid-cols-3">
            {SOUND_EVENTS.map((e) => {
              const r = reports[e] as { audibleMs: number; peakDb: number }
              return (
                <button
                  type="button"
                  key={e}
                  onClick={() => play(e)}
                  className="grid cursor-pointer gap-3 rounded-lg border border-line bg-s1 p-4 text-start transition-press hover:bg-s2 motion-safe:active:scale-[0.98] data-[last=true]:border-accent"
                  data-last={last === e}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-ui">{e}</span>
                    <Kbd>{keys[e]}</Kbd>
                  </span>
                  <Waveform event={e} />
                  <span className="text-caption text-text-2">{fires[e]}</span>
                  <span className="flex flex-wrap gap-2">
                    <Badge dot={false}>{Math.round(r.audibleMs)} ms</Badge>
                    <Badge dot={false}>{r.peakDb.toFixed(1)} dB</Badge>
                    <Badge tone={r.audibleMs <= MAX_AUDIBLE_MS[e] ? 'success' : 'danger'}>
                      max {MAX_AUDIBLE_MS[e]} ms
                    </Badge>
                  </span>
                </button>
              )
            })}
          </div>
        </Section>
      </Page>
    )
  },
}
