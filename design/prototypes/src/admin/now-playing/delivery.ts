// SPDX-License-Identifier: AGPL-3.0-only
// How a stream is sent, in the words the page and the dashboard's widget share
// (docs/product/now-playing.md#how-its-sent).
import type { BadgeTone, IconName } from '@highsea-tv/ui-web'
import { pathLabel } from '../../mock/playback.ts'
import type { DeliveryMethod, SessionView } from '../../mock/sessions.ts'
import type { ClientType } from '../../mock/types.ts'

export const methods: Record<DeliveryMethod, { label: string; tone: BadgeTone; line: string }> = {
  'direct-play': {
    label: 'Direct play',
    tone: 'success',
    line: 'The file as it is: the device plays it unchanged.',
  },
  'direct-stream': {
    label: 'Direct stream',
    tone: 'info',
    line: 'The picture as it is, with the audio or container changed.',
  },
  transcode: {
    label: 'Transcode',
    tone: 'warning',
    line: 'Made again for the device, as it plays.',
  },
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
export const behind = (s: SessionView) =>
  s.method === 'transcode' && s.kind === 'stream' && !s.stopped && s.speed < 1

/** "VAAPI, 2.4× real time" or "the processor, 0.7× real time". */
export const transcodedBy = (s: SessionView) =>
  `${s.hardware ? pathLabel(s.hardware) : 'The processor'}, ${s.speed.toFixed(1)}× real time`

export const mbps = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} Mbps`

/** 1:02:07 or 6:52, for a position in a film. */
export function timecode(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
