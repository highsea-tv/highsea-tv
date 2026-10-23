// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import {
  assCues,
  detectFormat,
  parseAss,
  parseSrt,
  parseVtt,
  writeAss,
  writeSrt,
  writeVtt,
} from '../../src/shared/processing/index.ts'

describe('detectFormat', () => {
  test('by content, not by name', () => {
    expect(detectFormat('WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n')).toBe('vtt')
    expect(detectFormat('WEBVTT - with a title\n')).toBe('vtt')
    expect(detectFormat('[Script Info]\nScriptType: v4.00+\n')).toBe('ass')
    expect(detectFormat('[Script Info]\nScriptType: v4.00\n')).toBe('ssa')
    expect(detectFormat('[Script Info]\nTitle: x\n\n[V4+ Styles]\n')).toBe('ass')
    expect(detectFormat('1\n00:00:01,000 --> 00:00:02,000\nHi\n')).toBe('srt')
    expect(detectFormat('00:00:01.000 --> 00:00:02.000\nHi\n')).toBe('srt')
    expect(detectFormat('Just some notes about a film.\nNothing timed here.\n')).toBeNull()
    expect(detectFormat('<!doctype html><html><body><p>Not found</p></body></html>')).toBeNull()
    expect(detectFormat('WEBVTTX\n')).toBeNull()
  })
})

describe('SRT', () => {
  test('reads commas and dots, missing indexes, CRLF and stray blank lines', () => {
    const text = [
      '1',
      '00:00:01,000 --> 00:00:02,500',
      'First line',
      'second line',
      '',
      '',
      '00:00:03.250 --> 00:00:04.000',
      'No index above me',
      '',
      '3',
      '0:00:05,5  -->   00:00:06,000  X1:100 X2:200 Y1:10 Y2:20',
      '<i>Short hours, extra spaces, coordinates</i>',
      '',
      '',
      '4',
      '00:00:07,000 --> 00:00:08,000',
      'A cue',
      '',
      'with a stray blank line',
      '',
    ].join('\r\n')
    expect(parseSrt(text)).toEqual([
      { start: 1000, end: 2500, text: 'First line\nsecond line' },
      { start: 3250, end: 4000, text: 'No index above me' },
      { start: 5500, end: 6000, text: '<i>Short hours, extra spaces, coordinates</i>' },
      { start: 7000, end: 8000, text: 'A cue\nwith a stray blank line' },
    ])
  })

  test('a cue whose text is a number keeps it', () => {
    expect(
      parseSrt('1\n00:00:01,000 --> 00:00:02,000\n42\n\n2\n00:00:03,000 --> 00:00:04,000\nYes\n'),
    ).toEqual([
      { start: 1000, end: 2000, text: '42' },
      { start: 3000, end: 4000, text: 'Yes' },
    ])
  })

  test('writes strictly and round-trips', () => {
    const cues = [
      { start: 0, end: 1500, text: 'Hello' },
      { start: 3_723_456, end: 3_725_000, text: 'Two\nlines' },
    ]
    const written = writeSrt(cues)
    expect(written).toBe(
      '1\n00:00:00,000 --> 00:00:01,500\nHello\n\n2\n01:02:03,456 --> 01:02:05,000\nTwo\nlines\n',
    )
    expect(parseSrt(written)).toEqual(cues)
    expect(writeSrt(parseSrt(written))).toBe(written)
  })
})

describe('WebVTT', () => {
  // The W3C's examples (https://www.w3.org/TR/webvtt1/), typed in.
  const voices = [
    'WEBVTT',
    '',
    '00:11.000 --> 00:13.000',
    '<v Roger Bingham>We are in New York City',
    '',
    '00:13.000 --> 00:16.000',
    '<v Roger Bingham>We’re actually at the Lucern Hotel, just down the street',
    '',
    '00:16.000 --> 00:18.000',
    '<v Roger Bingham>from the American Museum of Natural History',
    '',
  ].join('\n')

  const styles = [
    'WEBVTT',
    '',
    'STYLE',
    '::cue {',
    '  background-image: linear-gradient(to bottom, dimgray, lightgray);',
    '  color: papayawhip;',
    '}',
    '/* Style blocks cannot use blank lines nor "dash dash greater than" */',
    '',
    'NOTE comment blocks can be used between style blocks.',
    '',
    'STYLE',
    '::cue(b) {',
    '  color: peachpuff;',
    '}',
    '',
    '00:00:00.000 --> 00:00:10.000',
    '- Hello <b>world</b>.',
    '',
    'NOTE style blocks cannot appear after the first cue.',
    '',
  ].join('\n')

  const regions = [
    'WEBVTT',
    'Kind: captions',
    '',
    'REGION',
    'id:fred',
    'width:40%',
    'lines:3',
    'regionanchor:0%,100%',
    'viewportanchor:10%,90%',
    'scroll:up',
    '',
    '00:00:00.000 --> 00:00:20.000 region:fred align:left',
    '<v Fred>Hi, my name is Fred',
    '',
  ].join('\n')

  const ids = [
    'WEBVTT',
    '',
    '1',
    '00:00.000 --> 00:02.000',
    'That’s an, an, that’s an L!',
    '',
    'crédit de transcription',
    '00:04.000 --> 00:05.000',
    'Transcrit par Célestes™',
    '',
  ].join('\n')

  test('reads cues, minutes-only timestamps and identifiers', () => {
    const doc = parseVtt(ids)
    expect(doc.header).toBe('WEBVTT')
    expect(doc.blocks).toEqual([
      {
        kind: 'cue',
        id: '1',
        start: 0,
        end: 2000,
        settings: '',
        text: 'That’s an, an, that’s an L!',
      },
      {
        kind: 'cue',
        id: 'crédit de transcription',
        start: 4000,
        end: 5000,
        settings: '',
        text: 'Transcrit par Célestes™',
      },
    ])
    expect(parseVtt(voices).blocks.map((block) => block.kind === 'cue' && block.start)).toEqual([
      11000, 13000, 16000,
    ])
  })

  test('keeps STYLE, NOTE and REGION blocks, the header and cue settings', () => {
    const styled = parseVtt(styles)
    expect(styled.blocks.map((block) => block.kind)).toEqual([
      'other',
      'other',
      'other',
      'cue',
      'other',
    ])
    expect(writeVtt(styled)).toBe(styles)

    const region = parseVtt(regions)
    expect(region.header).toBe('WEBVTT\nKind: captions')
    const cue = region.blocks[1]
    expect(cue?.kind === 'cue' && cue.settings).toBe('region:fred align:left')
    expect(writeVtt(region)).toBe(regions)
  })

  test('a STYLE block after a cue is ignored, as the algorithm says', () => {
    const doc = parseVtt('WEBVTT\n\n00:01.000 --> 00:02.000\nHi\n\nSTYLE\n::cue { color: red; }\n')
    expect(doc.blocks.map((block) => block.kind)).toEqual(['cue'])
  })

  test('drops a cue with bad timings, and an arrow in the text starts the next cue', () => {
    const doc = parseVtt(
      'WEBVTT\n\n00:01.000 --> 00:2.000\nBroken\n\n00:03.000 --> 00:04.000\nOne\n00:05.000 --> 00:06.000\nTwo\n',
    )
    expect(doc.blocks).toEqual([
      { kind: 'cue', id: null, start: 3000, end: 4000, settings: '', text: 'One' },
      { kind: 'cue', id: null, start: 5000, end: 6000, settings: '', text: 'Two' },
    ])
  })

  test('writes full timestamps and round-trips the W3C examples', () => {
    expect(writeVtt(parseVtt(voices))).toBe(
      voices.replace(/^(\d\d:\d\d\.\d{3}) --> (\d\d:\d\d\.\d{3})$/gm, '00:$1 --> 00:$2'),
    )
    for (const example of [voices, styles, regions, ids]) {
      expect(parseVtt(writeVtt(parseVtt(example)))).toEqual(parseVtt(example))
    }
  })

  test('refuses a file without the WEBVTT line', () => {
    expect(() => parseVtt('00:01.000 --> 00:02.000\nHi\n')).toThrow()
  })
})

describe('ASS and SSA', () => {
  const ass = [
    '[Script Info]',
    '; Script generated by Aegisub',
    'Title: Sintel',
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,40,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    'Comment: 0,0:00:00.00,0:00:01.00,Default,,0,0,0,,A comment line',
    'Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\i1}You made it, {\\b1}Sintel{\\b0}.{\\i0}\\NWelcome.',
    'Dialogue: 0,0:01:02.25,0:01:04.00,Default,,0,0,0,,{\\pos(960,100)\\fad(200,200)}A dragon, here, in the valley',
    'Dialogue: 1,1:00:00.00,1:00:01.99,Default,Narrator,0,0,0,,Plain text',
    '',
  ].join('\n')

  test('reads Dialogue times by the Format line and strips tags for cleanup', () => {
    const doc = parseAss(ass)
    expect(assCues(doc)).toEqual([
      { start: 1000, end: 3500, text: 'You made it, Sintel.\nWelcome.' },
      { start: 62250, end: 64000, text: 'A dragon, here, in the valley' },
      { start: 3_600_000, end: 3_601_990, text: 'Plain text' },
    ])
  })

  test('rewrites only Start and End, leaving styles and override tags untouched', () => {
    const doc = parseAss(ass)
    const out = writeAss(doc, (cue) => ({ ...cue, start: cue.start + 1234, end: cue.end + 1234 }))
    const before = ass.split('\n')
    const after = out.split('\n')
    expect(after.length).toBe(before.length)
    expect(after[14]).toBe(
      'Dialogue: 0,0:00:02.23,0:00:04.73,Default,,0,0,0,,{\\i1}You made it, {\\b1}Sintel{\\b0}.{\\i0}\\NWelcome.',
    )
    expect(after[15]).toBe(
      'Dialogue: 0,0:01:03.48,0:01:05.23,Default,,0,0,0,,{\\pos(960,100)\\fad(200,200)}A dragon, here, in the valley',
    )
    expect(after[16]).toBe('Dialogue: 1,1:00:01.23,1:00:03.22,Default,Narrator,0,0,0,,Plain text')
    // Everything else, the Comment line among it, is as it was.
    for (const index of before.keys()) {
      if (index < 14 || index > 16) expect(after[index]).toBe(before[index])
    }
  })

  test('a null from the transform drops the line; identity writes the file back unchanged', () => {
    const doc = parseAss(ass)
    expect(writeAss(doc, (cue) => cue)).toBe(ass)
    const dropped = writeAss(doc, (cue, index) => (index === 1 ? null : cue))
    expect(dropped).not.toContain('A dragon')
    expect(dropped.split('\n').length).toBe(ass.split('\n').length - 1)
  })

  test('SSA, with its Marked column', () => {
    const ssa = [
      '[Script Info]',
      'ScriptType: v4.00',
      '',
      '[V4 Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding',
      'Style: Default,Tahoma,24,16777215,65535,65535,-2147483640,-1,0,1,1,2,2,30,30,10,0,0',
      '',
      '[Events]',
      'Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: Marked=0,0:00:05.10,0:00:07.00,Default,,0000,0000,0000,,{\\i1}Hello{\\i0}, there',
      '',
    ].join('\n')
    expect(detectFormat(ssa)).toBe('ssa')
    const doc = parseAss(ssa)
    expect(assCues(doc)).toEqual([{ start: 5100, end: 7000, text: 'Hello, there' }])
    expect(
      writeAss(doc, (cue) => ({ ...cue, start: cue.start - 100, end: cue.end - 100 })).split(
        '\n',
      )[9],
    ).toBe(
      'Dialogue: Marked=0,0:00:05.00,0:00:06.90,Default,,0000,0000,0000,,{\\i1}Hello{\\i0}, there',
    )
  })
})
