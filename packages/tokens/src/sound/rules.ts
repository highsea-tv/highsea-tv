// SPDX-License-Identifier: AGPL-3.0-only
// docs/design-language/sound.md#loudness-and-length-rules
import { z } from 'zod'
import { SOUND_EVENTS, type SoundEvent, type SoundPack } from './pack.ts'
import { measure, renderEvent } from './render.ts'

/** Longest allowed audible length per event, ms. */
export const MAX_AUDIBLE_MS: Record<SoundEvent, number> = {
  navigate: 60,
  select: 60,
  back: 60,
  success: 300,
  error: 300,
  notify: 400,
  arrival: 1500,
}
export const PEAK_RANGE_DB = [-32, -16] as const
/** A natural pitch drop of up to 10% is allowed; anything else is a glide. */
export const MAX_PITCH_DROP = 0.1
export const ROOM_EVENTS: readonly SoundEvent[] = ['notify', 'arrival']
/** Held D-pad keys: `navigate` sounds at most this often, ms. */
export const NAVIGATE_THROTTLE_MS = 80

const positive = z.number().positive().finite()
const voiceSchema = z.strictObject({
  wave: z.enum(['sine', 'triangle', 'square', 'sawtooth', 'noise']).optional(),
  freq: positive.max(20000).optional(),
  freqEnd: positive.max(20000).optional(),
  glide: positive.max(2).optional(),
  at: z.number().min(0).max(2).optional(),
  attack: positive.max(1).optional(),
  dur: positive.max(2),
  gain: positive.max(1),
  lowpass: positive.max(24000).optional(),
  highpass: positive.max(24000).optional(),
  bandpass: positive.max(24000).optional(),
  q: z.number().min(0.0001).max(40).optional(),
  room: z.boolean().optional(),
  partials: z
    .array(z.tuple([positive.max(16), positive.max(1), positive.max(4).optional()]))
    .max(8)
    .optional(),
})

export const soundPackSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  name: z.string().trim().min(1).max(60),
  gain: positive.max(2),
  room: z
    .strictObject({
      time: positive.max(0.2),
      feedback: z.number().min(0).max(0.5),
      mix: z.number().min(0).max(0.5),
      lowpass: positive.max(24000),
    })
    .optional(),
  events: z.strictObject(
    Object.fromEntries(SOUND_EVENTS.map((e) => [e, z.array(voiceSchema).min(1).max(12)])) as Record<
      SoundEvent,
      z.ZodArray<typeof voiceSchema>
    >,
  ),
})

export type EventReport = { event: SoundEvent; audibleMs: number; peakDb: number }
export type PackReport = { pass: boolean; events: EventReport[]; issues: string[] }

/** Validates a pack's shape, then renders every event offline and checks the rules. */
export function checkSoundPack(input: unknown): PackReport {
  const parsed = soundPackSchema.safeParse(input)
  if (!parsed.success)
    return {
      pass: false,
      events: [],
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    }
  const pack = parsed.data as SoundPack
  const issues: string[] = []
  const events = SOUND_EVENTS.map((event): EventReport => {
    for (const v of pack.events[event]) {
      if (v.freqEnd !== undefined && v.freq !== undefined) {
        const drop = (v.freq - v.freqEnd) / v.freq
        if (drop < 0 || drop > MAX_PITCH_DROP)
          issues.push(
            `${event}: pitch moves ${v.freq} → ${v.freqEnd} Hz; only a drop of ≤ 10% is allowed`,
          )
      }
      if (v.room && !ROOM_EVENTS.includes(event))
        issues.push(`${event}: only notify and arrival may use the room bus`)
    }
    return { event, ...measure(renderEvent(pack, event)) }
  })
  for (const r of events) {
    if (r.audibleMs > MAX_AUDIBLE_MS[r.event])
      issues.push(
        `${r.event}: ${Math.round(r.audibleMs)} ms audible; limit ${MAX_AUDIBLE_MS[r.event]} ms`,
      )
    if (r.peakDb < PEAK_RANGE_DB[0] || r.peakDb > PEAK_RANGE_DB[1])
      issues.push(`${r.event}: peak ${r.peakDb.toFixed(1)} dBFS; must be between −32 and −16`)
  }
  const nav = events.find((r) => r.event === 'navigate')
  const louder = events.filter((r) => r.event !== 'navigate' && nav && r.peakDb < nav.peakDb)
  for (const r of louder) issues.push(`navigate must be the quietest event; ${r.event} is quieter`)
  return { pass: issues.length === 0, events, issues }
}
