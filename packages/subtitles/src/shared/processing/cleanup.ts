// SPDX-License-Identifier: AGPL-3.0-only
// Cleanup (checkpoint 7, Processing, step 4).
// - **Ads** are always removed: whole cues that only advertise a site or a subtitler, from the
//   short list below. Every line of the cue must be ad text, so dialogue that mentions a website
//   is never cut. Bazarr's `common` mod removes the same kind of line (`CM_crap`).
// - **SDH text** is removed for the Without SDH fallback: bracketed and parenthesised
//   descriptions, speaker labels before a colon, and music-only lines, then lines left empty and a
//   lone line's dangling dash. That is the documented behaviour of Bazarr's `remove_HI` mod and
//   Subtitle Edit's "Remove text for hearing impaired"
//   (https://subtitleedit.github.io/subtitleedit/features/remove-text-hi.html), written fresh:
//   Bazarr's code is GPL-3.0 and isn't copied (ADR 0031's practice).
// - Empty cues are dropped, overlapping cues kept, and cues sorted by start.
import type { Cue } from './time.ts'

/** Sites that host subtitles and release groups that stamp them. */
const SITES = String.raw`(?:open\s?subtitles(?:\.(?:org|com))?|subscene(?:\.com)?|yify(?:subtitles)?|yts(?:\.(?:mx|am|lt|ag))?|addic7ed(?:\.com)?|subdl(?:\.com)?|subsource(?:\.net)?|podnapisi(?:\.net)?)`

const AD_LINES: RegExp[] = [
  // Credits: "Subtitles by …", "Synced and corrected by …", "Ripped by …", "Resync by …".
  /^(?:subtitles?|subs|captions?|captioning|subtitled|translated|translation|transcribed|transcript|ripped|encoded|corrected|corrections|edited|timed|timing|re-?synced|re-?sync|synced|sync|synchroni[sz]ed|improved)(?:\s*(?:and|&|\/|,)\s*(?:corrected|corrections|synced|sync|edited|improved|timed|encoded|translated))*\s+by\b/i,
  // "Subtitles: …", "Subs - …".
  /^(?:subtitles?|subs|captions?)\s*[:-]/i,
  /^downloaded\s+from\b/i,
  /advertise your product or brand here/i,
  /support us and become vip member/i,
  /remove all ads/i,
  // A site's name or address standing alone, perhaps with "www." and punctuation.
  new RegExp(String.raw`^[\W_]*(?:https?:\/\/)?(?:www\.)?${SITES}[\W_]*$`, 'i'),
  // A site named alongside the words of a plug: "Get subtitles at OpenSubtitles.com".
  new RegExp(
    String.raw`(?=.*\b${SITES}).*(?:\bsubtitles?\b|\bsubs\b|\bdownload|\bvisit\b|\bbrought to you\b|\bpresents?\b|www\.|https?:)`,
    'i',
  ),
]

const stripMarkup = (line: string): string => line.replace(/<[^>]*>|\{[^}]*\}/g, '').trim()

/** True when every line of the cue is advertising. */
export function isAdCue(text: string): boolean {
  const lines = text.split('\n').map(stripMarkup).filter(Boolean)
  if (lines.length === 0) return false
  return lines.every((line) => AD_LINES.some((pattern) => pattern.test(line)))
}

/** Tags and a dash at the start of a line: what a speaker label or music note follows. */
const LEAD = String.raw`^((?:\s*<[^>]+>)*\s*(?:-\s*)?(?:<[^>]+>\s*)*)`
/** "[John]:", a bracketed name standing as a label. */
const BRACKET_LABEL = new RegExp(String.raw`${LEAD}[\[(][^\])\n]*[\])]\s*:(?=\s|$)\s*`, 'u')
/** "JOHN:", "MAN 2:", "DR. SMITH:", in capitals. */
const UPPER_LABEL = new RegExp(String.raw`${LEAD}\p{Lu}[\p{Lu}\p{N} .'&#-]*:(?=\s|$)\s*`, 'u')
/**
 * "John:", "Old Man:", "Man 2:", "Dr. Smith:": up to three words, each capitalised or a number, so
 * "He said: go" and "at 10:30" stay.
 */
const NAME_LABEL = new RegExp(
  String.raw`${LEAD}\p{Lu}[\p{L}.'-]*(?: (?:\p{Lu}[\p{L}.'-]*|\p{N}+)){0,2}:(?=\s|$)\s*`,
  'u',
)
/** A dash left at the start of a lone line, after any tags. */
const DANGLING_DASH = /^((?:\s*<[^>]+>)*\s*)-\s*/u
/** A line sung or scored: it opens or closes with ♪, ♫ or a lone #, or is only those. */
const MUSIC = /^(?:[-\s]*[♪♫]|[-\s]*#(?=\s|$))|(?:[♪♫]|(?:^|\s)#)\s*$/u

export function removeHearingImpaired(text: string): string {
  let lines = text.split('\n')
  // Labels first, so "[John]:" goes as a label rather than leaving its colon behind.
  lines = lines.map((line) =>
    line.replace(BRACKET_LABEL, '$1').replace(UPPER_LABEL, '$1').replace(NAME_LABEL, '$1'),
  )
  // Descriptions, which may run across lines.
  let joined = lines.join('\n')
  joined = joined.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '')
  lines = joined.split('\n')
  // A label that followed a description ("(whispering) JOHN: …") is at the start now.
  lines = lines.map((line) => line.replace(UPPER_LABEL, '$1'))
  lines = lines.filter((line) => !MUSIC.test(stripMarkup(line)))
  lines = lines
    .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
    .filter((line) => !/^[-:\s]*$/.test(stripMarkup(line)))
  if (lines.length === 1) lines = [(lines[0] ?? '').replace(DANGLING_DASH, '$1')]
  return lines.join('\n').trim()
}

/** One cue's text after cleanup, or null when nothing of it is kept. */
export function cleanText(text: string, options: { removeHi: boolean }): string | null {
  if (isAdCue(text)) return null
  const cleaned = options.removeHi ? removeHearingImpaired(text) : text
  return stripMarkup(cleaned.replace(/\n/g, ' ')) === '' ? null : cleaned
}

export function cleanCues(cues: Cue[], options: { removeHi: boolean }): Cue[] {
  const kept: Cue[] = []
  for (const cue of cues) {
    const text = cleanText(cue.text, options)
    if (text !== null) kept.push({ ...cue, text })
  }
  // Array.prototype.sort is stable (ECMAScript 2019), so cues starting together keep their order.
  return kept.sort((a, b) => a.start - b.start)
}
