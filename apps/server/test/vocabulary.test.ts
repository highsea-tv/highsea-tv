// SPDX-License-Identifier: AGPL-3.0-only
// One vocabulary end to end: the contract mirrors the domain packages' lists and shapes (it stays
// free of them, since every app imports it), and these tests keep the copies equal.
import { describe, expect, test } from 'bun:test'
import * as Api from '@highsea-tv/api-contract'
import { schema } from '@highsea-tv/db'
import * as Md from '@highsea-tv/metadata'
import type { ParsedRelease } from '@highsea-tv/parser'
import * as Q from '@highsea-tv/quality'

/** Fails to compile unless A and B are the same type. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const same = <T extends true>(_: T) => {}

describe('the contract and the domain packages agree', () => {
  test('library statuses (@highsea-tv/db)', () => {
    expect([...Api.LIBRARY_STATUSES]).toEqual([...schema.LIBRARY_STATUSES])
  })

  test('the parser’s vocabulary and shape (@highsea-tv/parser, through @highsea-tv/quality)', () => {
    expect([...Api.SOURCES]).toEqual([...Q.SOURCES])
    expect([...Api.MODIFIERS]).toEqual([...Q.MODIFIERS])
    expect([...Api.RESOLUTIONS]).toEqual([...Q.RESOLUTIONS])
    same<Same<Api.ParsedRelease, ParsedRelease>>(true)
  })

  test('custom formats, profiles and sizes (@highsea-tv/quality)', () => {
    expect([...Api.CONDITION_KINDS]).toEqual([...Q.CONDITION_KINDS])
    expect([...Api.INDEXER_FLAGS]).toEqual([...Q.INDEXER_FLAGS])
    // as the API serves them: a format says whether it was edited, a profile whether it's seeded
    for (const f of Q.seedFormats()) {
      const served = { ...f, edited: false }
      expect(Api.CustomFormat.parse(served)).toEqual(served)
    }
    for (const p of Q.seedProfiles()) {
      const served = { ...p, builtIn: true }
      expect(Api.QualityProfile.parse(served)).toEqual(served)
    }
    for (const s of Q.defaultQualitySizes()) expect(Api.QualitySize.parse(s)).toEqual(s)
    same<Same<Api.FormatCondition, Q.Condition>>(true)
  })

  test('TMDB’s lists, images, errors, notice and topic (@highsea-tv/metadata)', () => {
    expect([...Api.DEPARTMENTS]).toEqual([...Md.DEPARTMENTS])
    expect([...Api.VIDEO_KINDS]).toEqual([...Md.VIDEO_KINDS])
    expect([...Api.DISCOVER_LISTS]).toEqual([...Md.DISCOVER_LISTS])
    expect([...Api.IMAGE_OWNERS]).toEqual([...Md.IMAGE_OWNERS])
    expect([...Api.IMAGE_KINDS]).toEqual([...Md.IMAGE_KINDS])
    expect(Api.METADATA_REASONS).toContain(Md.NO_TMDB_KEY)
    expect(Api.TMDB_ATTRIBUTION.notice).toBe(Md.TMDB_ATTRIBUTION)
    expect(Api.MEDIA_TOPICS.metadata).toBe(Md.METADATA_TOPIC)
    // the image route's path is the one metadata's URLs point to
    const url = Md.imageUrl('movie', 603, 'poster', 'w342', '/abc.jpg') as string
    const pattern = new RegExp(`^${Api.routes.metadata.image.path.replace(/\{\w+\}/g, '[^/]+')}$`)
    expect(url).toMatch(pattern)
  })
})
