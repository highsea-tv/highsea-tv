// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { followVideo, sidecarFlag, sidecarPath } from '../../src/shared/naming.ts'

const VIDEO = '/movies/Sintel (2010)/Sintel (2010) Bluray-1080p.mkv'

describe('sidecarPath', () => {
  test.each([
    [{ forced: false, hi: false, format: 'srt' }, 'Sintel (2010) Bluray-1080p.en.srt'],
    [{ forced: true, hi: false, format: 'srt' }, 'Sintel (2010) Bluray-1080p.en.forced.srt'],
    [{ forced: false, hi: true, format: 'srt' }, 'Sintel (2010) Bluray-1080p.en.sdh.srt'],
    [{ forced: true, hi: true, format: 'srt' }, 'Sintel (2010) Bluray-1080p.en.forced.srt'],
    [{ forced: false, hi: false, format: 'ass' }, 'Sintel (2010) Bluray-1080p.en.ass'],
  ])('%o', (flags, name) => {
    expect(sidecarPath(VIDEO, { language: 'en', ...flags })).toBe(`/movies/Sintel (2010)/${name}`)
  })

  test('a title part, made safe for a file name', () => {
    expect(
      sidecarPath(
        VIDEO,
        { language: 'pt-BR', forced: false, hi: true, format: 'srt' },
        'OpenSubtitles.com',
      ),
    ).toBe('/movies/Sintel (2010)/Sintel (2010) Bluray-1080p.pt-BR.OpenSubtitlescom.sdh.srt')
  })

  test('the flag', () => {
    expect(sidecarFlag({ forced: false, hi: false })).toBe('')
    expect(sidecarFlag({ forced: true, hi: true })).toBe('forced')
    expect(sidecarFlag({ forced: false, hi: true })).toBe('sdh')
  })
})

describe('followVideo', () => {
  test('keeps the suffix after the new name', () => {
    expect(
      followVideo(
        '/movies/Sintel (2010)/Sintel (2010) Bluray-1080p.en.forced.srt',
        VIDEO,
        '/movies/Sintel (2010)/Sintel (2010) Remux-2160p.mkv',
      ),
    ).toBe('/movies/Sintel (2010)/Sintel (2010) Remux-2160p.en.forced.srt')
  })

  test('a sidecar of another video, or in another folder, is not followed', () => {
    expect(followVideo('/movies/Sintel (2010)/Other.en.srt', VIDEO, '/x/y.mkv')).toBeNull()
    expect(
      followVideo('/elsewhere/Sintel (2010) Bluray-1080p.en.srt', VIDEO, '/x/y.mkv'),
    ).toBeNull()
  })
})
