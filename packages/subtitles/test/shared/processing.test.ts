// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MAX_SUBTITLE_BYTES,
  processSubtitle,
  renderSubtitle,
} from '../../src/shared/processing/index.ts'

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:02,000',
  'Subtitles by someone',
  '',
  '2',
  '00:00:03,000 --> 00:00:04,000',
  '[door creaks]',
  'JOHN: Who’s there?',
  '',
  '3',
  '00:00:05,000 --> 00:00:06,000',
  '♪ soft music ♪',
  '',
  '4',
  '00:00:07,000 --> 00:00:08,500',
  'Only the wind.',
  '',
].join('\r\n')

describe('processSubtitle', () => {
  test('decodes, keeps the original before cleanup, and cleans', () => {
    const result = processSubtitle(encode(SRT), { removeHi: false })
    expect(result).toEqual({
      ok: true,
      format: 'srt',
      encoding: 'utf-8',
      original: SRT.replace(/\r\n/g, '\n'),
      text: [
        '1',
        '00:00:03,000 --> 00:00:04,000',
        '[door creaks]',
        'JOHN: Who’s there?',
        '',
        '2',
        '00:00:05,000 --> 00:00:06,000',
        '♪ soft music ♪',
        '',
        '3',
        '00:00:07,000 --> 00:00:08,500',
        'Only the wind.',
        '',
      ].join('\n'),
      cues: 3,
    })
  })

  test('without SDH', () => {
    const result = processSubtitle(encode(SRT), { removeHi: true })
    expect(result.ok && result.text).toBe(
      '1\n00:00:03,000 --> 00:00:04,000\nWho’s there?\n\n2\n00:00:07,000 --> 00:00:08,500\nOnly the wind.\n',
    )
    expect(result.ok && result.cues).toBe(2)
  })

  test('a legacy encoding is decoded and written as UTF-8', () => {
    const bytes = readFileSync(join(import.meta.dir, 'fixtures', 'processing', 'ru.cp1251.srt'))
    const result = processSubtitle(bytes, { removeHi: false })
    expect(result.ok && result.encoding).toBe('windows-1251')
    expect(result.ok && result.text).toContain('Доброе утро. Вы не видели мою собаку?')
    expect(result.ok && result.cues).toBe(6)
  })

  test('refuses a file over 2 MB', () => {
    const big = new Uint8Array(MAX_SUBTITLE_BYTES + 1).fill(0x41)
    expect(processSubtitle(big, { removeHi: false })).toEqual({
      ok: false,
      reason: 'too-large',
      message: 'The subtitle is larger than 2 MB.',
    })
  })

  test('refuses what isn’t a subtitle', () => {
    const refused = {
      ok: false,
      reason: 'not-subtitle',
      message: "This file isn't a subtitle highsea can read: SRT, WebVTT or ASS.",
    } as const
    expect(
      processSubtitle(encode('Release notes\n\nThis is a plain text file.\n'), { removeHi: false }),
    ).toEqual(refused)
    expect(
      processSubtitle(
        encode('<!doctype html>\n<html><head><title>Download</title></head><body></body></html>\n'),
        {
          removeHi: false,
        },
      ),
    ).toEqual(refused)
    expect(
      processSubtitle(new Uint8Array([0x00, 0xff, 0x13, 0x88, 0x42]), { removeHi: false }),
    ).toEqual(refused)
  })

  test('a subtitle with nothing left is empty', () => {
    expect(
      processSubtitle(encode('1\n00:00:01,000 --> 00:00:02,000\nwww.opensubtitles.org\n'), {
        removeHi: false,
      }),
    ).toEqual({
      ok: false,
      reason: 'empty',
      message: 'The subtitle has no lines.',
    })
  })
})

describe('renderSubtitle', () => {
  const plusTwo = (ms: number): number => ms + 2500

  test('SRT, shifted and clamped at zero', () => {
    const original =
      '1\n00:00:01,000 --> 00:00:02,000\nEarly\n\n2\n00:00:05,000 --> 00:00:06,000\nLater\n'
    expect(renderSubtitle(original, { removeHi: false, shift: plusTwo }).text).toBe(
      '1\n00:00:03,500 --> 00:00:04,500\nEarly\n\n2\n00:00:07,500 --> 00:00:08,500\nLater\n',
    )
    expect(renderSubtitle(original, { removeHi: false, shift: (ms) => ms - 1500 })).toEqual({
      format: 'srt',
      text: '1\n00:00:00,000 --> 00:00:00,500\nEarly\n\n2\n00:00:03,500 --> 00:00:04,500\nLater\n',
      cues: 2,
    })
  })

  test('WebVTT stays WebVTT, with its header, settings and NOTE blocks', () => {
    const original = [
      'WEBVTT',
      'Kind: captions',
      '',
      'NOTE made by hand',
      '',
      'intro',
      '00:00:01.000 --> 00:00:02.000 align:start line:0',
      '[music playing]',
      '',
      '00:00:03.000 --> 00:00:04.000',
      'Subtitles by someone',
      '',
      '00:00:05.000 --> 00:00:06.000',
      'Hello.',
      '',
    ].join('\n')
    expect(renderSubtitle(original, { removeHi: false, shift: plusTwo })).toEqual({
      format: 'vtt',
      text: [
        'WEBVTT',
        'Kind: captions',
        '',
        'NOTE made by hand',
        '',
        'intro',
        '00:00:03.500 --> 00:00:04.500 align:start line:0',
        '[music playing]',
        '',
        '00:00:07.500 --> 00:00:08.500',
        'Hello.',
        '',
      ].join('\n'),
      cues: 2,
    })
    expect(renderSubtitle(original, { removeHi: true }).cues).toBe(1)
  })

  test('ASS stays ASS: times move, tags stay, ads and SDH-only lines go', () => {
    const original = [
      '[Script Info]',
      'ScriptType: v4.00+',
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:00.50,0:00:01.00,Default,,0,0,0,,Subtitles by someone',
      'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}[thunder]{\\i0}',
      'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,(sighs) Fine.',
      'Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,{\\b1}Run{\\b0}, now.',
      '',
    ].join('\n')
    expect(renderSubtitle(original, { removeHi: true, shift: plusTwo })).toEqual({
      format: 'ass',
      text: [
        '[Script Info]',
        'ScriptType: v4.00+',
        '',
        '[Events]',
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        'Dialogue: 0,0:00:05.50,0:00:06.50,Default,,0,0,0,,Fine.',
        'Dialogue: 0,0:00:07.50,0:00:08.50,Default,,0,0,0,,{\\b1}Run{\\b0}, now.',
        '',
      ].join('\n'),
      cues: 2,
    })
  })

  test('throws when the original isn’t a subtitle', () => {
    expect(() => renderSubtitle('nothing here', { removeHi: false })).toThrow()
  })
})
