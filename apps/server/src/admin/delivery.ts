// SPDX-License-Identifier: AGPL-3.0-only
// How a stream is sent, in the words Now playing and the dashboard's widget share (the
// prototype's now-playing/delivery.ts; docs/product/now-playing.md#how-its-sent). The labels are in
// now-playing-messages.ts; this holds the tones, icons and the sums.
import type { ClientType, DeliveryMethod, StreamSession } from '@highsea-tv/api-contract'
import type { BadgeTone, IconName } from '@highsea-tv/ui-web'

export const methodTone: Record<DeliveryMethod, BadgeTone> = {
  'direct-play': 'success',
  'direct-stream': 'info',
  transcode: 'warning',
}

export const clientIcon: Record<ClientType, IconName> = {
  admin: 'laptop',
  web: 'laptop',
  desktop: 'laptop',
  ios: 'phone',
  android: 'phone',
  tvos: 'tv',
  androidtv: 'tv',
  webos: 'tv',
  tizen: 'tv',
}

/** A transcode below real time can't keep up: the player waits for it. */
export const behind = (s: StreamSession) =>
  s.method === 'transcode' &&
  s.kind === 'stream' &&
  !s.stopped &&
  s.state === 'playing' &&
  s.speed !== null &&
  s.speed < 1

export const mbps = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} Mbps`

/** 1:02:07 or 6:52, for a position in a film. */
export function timecode(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
