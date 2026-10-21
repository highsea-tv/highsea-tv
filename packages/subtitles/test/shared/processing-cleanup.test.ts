// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { cleanCues, isAdCue, removeHearingImpaired } from '../../src/shared/processing/index.ts'

describe('isAdCue', () => {
  test('whole cues that advertise a site or a subtitler', () => {
    for (const text of [
      'Subtitles by explosiveskull',
      'Synced and corrected by VitoSilans',
      '<font color="#ffff00">Sync & corrections by n17t01</font>',
      'Resync by GoldenBeard',
      'Ripped by someone\nEncoded by someone else',
      'Downloaded from\nYTS.MX',
      'Advertise your product or brand here\ncontact www.OpenSubtitles.org today',
      'Support us and become VIP member\nto remove all ads from www.OpenSubtitles.org',
      'www.opensubtitles.org',
      'OpenSubtitles.com',
      'Subscene',
      '- YIFY -',
      'addic7ed.com',
      'Subtitles: Subdl',
      'Get more subtitles at SubSource.net',
      'Translated by Anna K.',
      'Corrected by M.',
    ]) {
      expect({ text, ad: isAdCue(text) }).toEqual({ text, ad: true })
    }
  })

  test('dialogue is never an ad, even when it mentions a website', () => {
    for (const text of [
      'Check out www.example.com, he said.',
      'I read the subtitles by myself, thanks.',
      'Downloaded from the server?\nNo, from the archive.',
      'Subscene\nWhat about it?',
      'We are in New York City',
      '',
    ]) {
      expect({ text, ad: isAdCue(text) }).toEqual({ text, ad: false })
    }
  })
})

describe('removeHearingImpaired', () => {
  const cases: [string, string][] = [
    ['[door slams]', ''],
    ['(sighs) I know.', 'I know.'],
    ['I know. [laughs]', 'I know.'],
    ['Hello (quietly) there', 'Hello there'],
    ['[thunder rumbling\ncontinues]', ''],
    ['JOHN: Where were you?', 'Where were you?'],
    ['MAN 2: Over here.', 'Over here.'],
    ['DR. SMITH: Sit down.', 'Sit down.'],
    ['[John]: Wait for me.', 'Wait for me.'],
    ['Old Man: Too late.', 'Too late.'],
    ['- JOHN: Ready?\n- MARY: Yes.', '- Ready?\n- Yes.'],
    ['- [gasps]\n- What was that?', 'What was that?'],
    ['<i>- (whispering) Quiet.</i>\n<i>- [footsteps]</i>', '<i>Quiet.</i>'],
    ['♪ Somewhere over the rainbow ♪', ''],
    ['♪♪', ''],
    ['# Happy birthday to you #\nBlow out the candles.', 'Blow out the candles.'],
    ['♫ la la la', ''],
    ['Meet me at 10:30, by the bridge.', 'Meet me at 10:30, by the bridge.'],
    ['10:30 is too early.', '10:30 is too early.'],
    ['He said: go home.', 'He said: go home.'],
    ['Visit http://example.com today.', 'Visit http://example.com today.'],
    ['We’re number #1.', 'We’re number #1.'],
    ['Plain   dialogue  with spaces', 'Plain dialogue with spaces'],
    ['- Hello.\n- Hi.', '- Hello.\n- Hi.'],
  ]
  for (const [input, output] of cases) {
    test(JSON.stringify(input), () => {
      expect(removeHearingImpaired(input)).toBe(output)
    })
  }
})

describe('cleanCues', () => {
  const cues = [
    { start: 5000, end: 6000, text: 'Second' },
    { start: 0, end: 1000, text: 'Subtitles by someone' },
    { start: 1000, end: 7000, text: '[wind howling]' },
    { start: 1000, end: 2000, text: 'First, overlapping the wind' },
    { start: 1000, end: 3000, text: 'Also at one second' },
    { start: 8000, end: 9000, text: '   ' },
  ]

  test('drops ads and empty cues, keeps overlaps, sorts by start stably', () => {
    expect(cleanCues(cues, { removeHi: false })).toEqual([
      { start: 1000, end: 7000, text: '[wind howling]' },
      { start: 1000, end: 2000, text: 'First, overlapping the wind' },
      { start: 1000, end: 3000, text: 'Also at one second' },
      { start: 5000, end: 6000, text: 'Second' },
    ])
  })

  test('removes SDH text when asked, dropping cues left empty', () => {
    expect(cleanCues(cues, { removeHi: true }).map((cue) => cue.text)).toEqual([
      'First, overlapping the wind',
      'Also at one second',
      'Second',
    ])
  })
})
