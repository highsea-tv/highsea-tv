// SPDX-License-Identifier: AGPL-3.0-only
// Which text format a subtitle is, by its content rather than its name (checkpoint 7, Processing,
// step 1). WebVTT starts with `WEBVTT` (https://www.w3.org/TR/webvtt1/#file-structure); ASS and SSA
// open with `[Script Info]` and say which they are in `ScriptType` (`v4.00+` is ASS, `v4.00` SSA)
// or by their styles section's name (`[V4+ Styles]`, `[V4 Styles]`); SRT is known by its timing
// line (https://www.matroska.org/technical/subtitles.html), with a dot for the comma tolerated.
import type { TextFormat } from '../types.ts'

export const SRT_TIMING =
  /^[ \t]*(\d{1,3}):(\d{1,2}):(\d{1,2})(?:[,.:](\d{1,3}))?[ \t]*-+>[ \t]*(\d{1,3}):(\d{1,2}):(\d{1,2})(?:[,.:](\d{1,3}))?/

export function detectFormat(text: string): TextFormat | null {
  const body = text.replace(/^﻿/, '')
  if (/^WEBVTT(?:[ \t\n]|$)/.test(body)) return 'vtt'
  if (/^[ \t]*\[Script Info\][ \t]*$/im.test(body)) {
    const type = /^[ \t]*ScriptType[ \t]*:[ \t]*v?([\d.]+)(\+?)/im.exec(body)
    if (type) return type[2] === '+' ? 'ass' : 'ssa'
    if (/^[ \t]*\[V4\+ Styles\]/im.test(body)) return 'ass'
    if (/^[ \t]*\[V4 Styles\]/im.test(body)) return 'ssa'
    return 'ass'
  }
  for (const line of body.split('\n')) {
    if (SRT_TIMING.test(line)) return 'srt'
  }
  return null
}
