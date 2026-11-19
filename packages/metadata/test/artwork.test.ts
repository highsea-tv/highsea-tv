// SPDX-License-Identifier: AGPL-3.0-only
// Chosen artwork (HT-66): the picker's view, a TMDB choice that a refresh keeps, uploads checked by
// their bytes, Reset, and the logo highsea picks on its own. Against the recordings, no network.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import type { AppError } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import { checkArtwork, parseImageUrl } from '../src/index.ts'
import { automaticLogo } from '../src/map.ts'
import { DAY, setup } from './helpers.ts'

let cleanups: (() => void)[] = []
afterEach(() => {
  for (const c of cleanups) c()
  cleanups = []
})
const open = async (options?: Parameters<typeof setup>[0]) => {
  const t = await setup(options)
  cleanups.push(t.cleanup)
  return t
}

const rejects = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    return e as AppError
  }
  throw new Error('expected a rejection')
}

/** A PNG's signature and IHDR, enough for the checks, which read only the header. */
export function png(width: number, height: number) {
  const b = new Uint8Array(64)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const v = new DataView(b.buffer)
  v.setUint32(16, width)
  v.setUint32(20, height)
  return b
}

/** A JPEG's SOI, an APP0 and a baseline SOF0 with the size. */
export function jpeg(width: number, height: number) {
  const b = new Uint8Array(64)
  b.set([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8])
  const v = new DataView(b.buffer)
  v.setUint16(13, height)
  v.setUint16(15, width)
  return b
}

describe('the checks on an upload', () => {
  test('the type comes from the bytes, PNG or JPEG', () => {
    expect(checkArtwork('poster', jpeg(1000, 1500))).toEqual({
      type: 'image/jpeg',
      width: 1000,
      height: 1500,
    })
    expect(checkArtwork('backdrop', png(1920, 1080)).type).toBe('image/png')
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
    for (const bytes of [svg, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])])
      expect(checkArtwork.bind(null, 'poster', bytes)).toThrow('PNG or JPEG')
  })

  test('each kind’s size and shape, and a logo only as a PNG', async () => {
    const reason = async (kind: 'poster' | 'backdrop' | 'logo', bytes: Uint8Array) =>
      ((await rejects(() => checkArtwork(kind, bytes))).details as { reason: string }).reason
    expect(await reason('poster', new Uint8Array())).toBe('empty')
    expect(await reason('poster', jpeg(400, 600))).toBe('too-small')
    expect(await reason('poster', jpeg(1500, 1000))).toBe('shape')
    expect(await reason('backdrop', jpeg(1000, 1500))).toBe('too-small')
    expect(await reason('backdrop', jpeg(1920, 1920))).toBe('shape')
    expect(await reason('poster', jpeg(9000, 13500))).toBe('too-large')
    expect(await reason('logo', jpeg(800, 300))).toBe('type')
    expect(await reason('logo', png(200, 80))).toBe('too-small')
    expect(checkArtwork('logo', png(800, 120)).width).toBe(800)
    expect(await reason('poster', new Uint8Array(10 * 1024 * 1024 + 1))).toBe('size')
  })
})

describe('the automatic logo', () => {
  const logo = (file: string, lang: string | null, votes = 0) => ({
    file_path: file,
    iso_639_1: lang,
    width: 500,
    height: 200,
    vote_average: votes,
  })

  test('the metadata’s language first, then English, then any; raster only', () => {
    const logos = [
      logo('/any.png', null, 9),
      logo('/en.png', 'en', 5),
      logo('/de.png', 'de', 3),
      logo('/de2.svg', 'de', 8),
    ]
    expect(automaticLogo(logos, 'de-DE')).toBe('/de.png')
    expect(automaticLogo(logos, 'fr-FR')).toBe('/en.png')
    expect(automaticLogo([logo('/any.png', null), logo('/x.svg', 'en')], 'en-US')).toBe('/any.png')
    expect(automaticLogo([logo('/x.svg', 'en')], 'en-US')).toBeNull()
    expect(automaticLogo(undefined, 'en-US')).toBeNull()
  })

  test('a movie’s art carries it, at its own size', async () => {
    const t = await open()
    expect((await t.metadata.movie(45745)).art.logo).toBe(
      '/api/v1/images/movie/45745/logo/w500/hsSintelLogoEn.png',
    )
    expect((await t.metadata.movie(15)).art.logo).toBeNull()
  })
})

describe('choosing', () => {
  test('the view lists TMDB’s images by votes, marks the automatic one, and leaves out SVG', async () => {
    const t = await open()
    const { kinds, optionsError } = await t.metadata.artwork.view('movie', 45745)
    expect(optionsError).toBeNull()
    const poster = kinds.find((k) => k.kind === 'poster')
    expect(poster?.current).toBe(poster?.automatic as string)
    expect(poster?.choice).toBeNull()
    expect(poster?.options.length).toBeGreaterThan(1)
    const votes = poster?.options.map((o) => o.voteAverage ?? 0) ?? []
    expect(votes).toEqual([...votes].sort((a, b) => b - a))
    const logos = kinds.find((k) => k.kind === 'logo')?.options ?? []
    expect(logos.some((o) => o.file.endsWith('.svg'))).toBe(false)
    expect(logos.map((o) => o.file)).toContain('/hsSintelLogoEn.png')
  })

  test('a choice changes the address, sticks through a refresh, and Reset undoes it', async () => {
    const t = await open()
    const before = (await t.metadata.movie(45745)).art.backdrop
    await t.metadata.artwork.choose('movie', 45745, 'backdrop', '/hsM45745Backdrop2.jpg', null)
    const chosen = (await t.metadata.movie(45745)).art.backdrop
    expect(chosen).toBe('/api/v1/images/movie/45745/backdrop/w1280/hsM45745Backdrop2.jpg')
    expect(chosen).not.toBe(before)
    expect(t.seen.filter((e) => e.topic === 'metadata.updated').at(-1)?.ids).toEqual([
      'movie:45745',
    ])
    // a refresh replaces the cached response, never the choice
    t.clock.advance(DAY)
    await t.metadata.refreshNow('movie', 45745)
    expect((await t.metadata.movie(45745)).art.backdrop).toBe(chosen)
    const row = t.db.select().from(schema.artwork).get()
    expect(row).toMatchObject({ source: 'tmdb', language: null, width: 1920, height: 1080 })
    expect(t.metadata.artwork.reset('movie', 45745, 'backdrop')).toBe(true)
    expect((await t.metadata.movie(45745)).art.backdrop).toBe(before)
    expect(t.metadata.artwork.reset('movie', 45745, 'backdrop')).toBe(false)
  })

  test('only the title’s own images can be chosen', async () => {
    const t = await open()
    for (const file of ['/hsM19Poster2.jpg', '/hsM45745Logo3.svg', '/nope.jpg']) {
      const e = await rejects(t.metadata.artwork.choose('movie', 45745, 'poster', file, null))
      expect(e.code).toBe('invalid')
    }
    expect(t.db.select().from(schema.artwork).all()).toEqual([])
  })

  test('without a key, uploads and Reset still work and the view says why', async () => {
    const t = await open()
    await t.metadata.movie(45745)
    t.metadata.settings.clearKey()
    const { kinds, optionsError } = await t.metadata.artwork.view('movie', 45745)
    expect(optionsError?.code).toBeTruthy()
    expect(kinds.every((k) => k.options.length === 0)).toBe(true)
    await t.metadata.artwork.upload('movie', 45745, 'poster', jpeg(1000, 1500), null)
  })

  test('a collection’s art and its upload-only logo', async () => {
    const t = await open()
    await t.metadata.artwork.choose('collection', 531241, 'poster', '/hsC531241Poster2.jpg', null)
    expect((await t.metadata.collection(531241)).art.poster).toBe(
      '/api/v1/images/collection/531241/poster/w342/hsC531241Poster2.jpg',
    )
    const view = await t.metadata.artwork.view('collection', 531241)
    expect(view.kinds.find((k) => k.kind === 'logo')).toMatchObject({
      automatic: null,
      options: [],
    })
    const file = await t.metadata.artwork.upload('collection', 531241, 'logo', png(600, 200), null)
    expect((await t.metadata.collection(531241)).art.logo).toBe(
      `/api/v1/images/collection/531241/logo/w500${file}`,
    )
  })
})

describe('a show’s artwork (HT-105)', () => {
  const CHERNOBYL = 87108
  /** fanart.tv's answer for Chernobyl by its TheTVDB id (360893), in v3.2's documented shape. */
  const fanartTv = (url: URL) =>
    url.hostname === 'webservice.fanart.tv' && url.pathname === '/v3.2/tv/360893'
      ? Response.json({
          name: 'Chernobyl',
          thetvdb_id: '360893',
          tvposter: [
            {
              id: '1',
              url: 'https://assets.fanart.tv/fanart/tv/360893/tvposter/chernobyl-5c1a.jpg',
              lang: 'en',
              likes: '4',
              width: '1000',
              height: '1426',
            },
          ],
        })
      : undefined

  test('TMDB’s images, then fanart.tv’s by TheTVDB id; a choice sticks through a refresh', async () => {
    const t = await open({ fanartKey: 'projectkeyforreplay01', onRequest: fanartTv })
    await t.metadata.show(CHERNOBYL)
    const { kinds, optionsError } = await t.metadata.artwork.view('show', CHERNOBYL)
    expect(optionsError).toBeNull()
    const poster = kinds.find((k) => k.kind === 'poster')
    expect(poster?.automatic).toBe('/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg')
    expect(poster?.options.filter((o) => o.source === 'tmdb').length).toBeGreaterThan(1)
    expect(poster?.options.filter((o) => o.source === 'fanart').map((o) => o.file)).toEqual([
      '/ftv_chernobyl-5c1a.jpg',
    ])
    const other = poster?.options.find((o) => o.source === 'tmdb' && o.file !== poster.automatic)
    if (!other) throw new Error('no other poster')
    await t.metadata.artwork.choose('show', CHERNOBYL, 'poster', other.file, null)
    const chosen = `/api/v1/images/show/${CHERNOBYL}/poster/w342${other.file}`
    expect((await t.metadata.show(CHERNOBYL)).art.poster).toBe(chosen)
    await t.metadata.refreshNow('show', CHERNOBYL)
    expect((await t.metadata.show(CHERNOBYL)).art.poster).toBe(chosen)
    expect(t.metadata.artwork.reset('show', CHERNOBYL, 'poster')).toBe(true)
    expect((await t.metadata.show(CHERNOBYL)).art.poster).not.toBe(chosen)
  })

  test('an upload becomes the show’s logo', async () => {
    const t = await open()
    const file = await t.metadata.artwork.upload('show', CHERNOBYL, 'logo', png(800, 200), null)
    expect((await t.metadata.show(CHERNOBYL)).art.logo).toBe(
      `/api/v1/images/show/${CHERNOBYL}/logo/w500${file}`,
    )
  })
})

describe('uploads', () => {
  test('kept in the database under a new name each time, served at every size, removed on Reset', async () => {
    const t = await open()
    const bytes = jpeg(1000, 1500)
    const first = await t.metadata.artwork.upload('movie', 45745, 'poster', bytes, null)
    expect(first).toMatch(/^\/hs_[A-Za-z0-9_-]+\.jpg$/)
    const url = (await t.metadata.movie(45745)).art.poster as string
    expect(url).toBe(`/api/v1/images/movie/45745/poster/w342${first}`)
    // no resizer here: the original stands in for every size
    t.fetch.requests.length = 0
    const ref = parseImageUrl(url)
    if (!ref) throw new Error('not an image address')
    const served = await t.metadata.images.get(ref)
    expect(served.contentType).toBe('image/jpeg')
    expect(new Uint8Array(readFileSync(served.path))).toEqual(bytes)
    const small = await t.metadata.images.get({ ...ref, size: 'w92' })
    expect(t.fetch.requests).toEqual([])
    // a second upload has its own address; the first's files go
    const second = await t.metadata.artwork.upload('movie', 45745, 'poster', jpeg(1200, 1800), null)
    expect(second).not.toBe(first)
    expect(existsSync(served.path) || existsSync(small.path)).toBe(false)
    const e = await rejects(t.metadata.images.get(ref))
    expect(e.code).toBe('not-found')
    // Reset deletes the upload and its row
    const now = await t.metadata.images.get({ ...ref, file: second.slice(1) })
    t.metadata.artwork.reset('movie', 45745, 'poster')
    expect(existsSync(now.path)).toBe(false)
    expect(t.db.select().from(schema.artwork).all()).toEqual([])
  })

  test('a resizer makes each size, and its failure serves the original', async () => {
    const asked: unknown[] = []
    const t = await open({
      resizeImage: async (bytes, to) => {
        asked.push(to)
        if (to.width === 92) throw new Error('broken')
        return bytes.subarray(0, 32)
      },
    })
    const file = await t.metadata.artwork.upload('movie', 45745, 'logo', png(800, 200), null)
    const ref = { owner: 'movie', ownerId: 45745, kind: 'logo', file: file.slice(1) }
    expect((await t.metadata.images.get({ ...ref, size: 'w300' })).bytes).toBe(32)
    expect((await t.metadata.images.get({ ...ref, size: 'w92' })).bytes).toBe(64)
    expect(asked).toEqual([
      { width: 300, type: 'image/png' },
      { width: 92, type: 'image/png' },
    ])
  })
})
