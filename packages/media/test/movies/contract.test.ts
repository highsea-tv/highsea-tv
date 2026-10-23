// SPDX-License-Identifier: AGPL-3.0-only
// The service's shapes are the API's: what the routes return passes the contract's schemas as is.
import { afterAll, expect, test } from 'bun:test'
import {
  ClientDetail,
  ClientItemPage,
  CustomFormat,
  DiscoverMovie,
  Movie,
  MoviePage,
  ParseResult,
  QualityProfile,
  QualitySize,
  RootFolder,
  SearchResults,
} from '@highsea-tv/api-contract'
import { z } from 'zod'
import { LLAMA_DRAMA, SINTEL, setup } from './helpers.ts'

const s = await setup()
afterAll(() => s.cleanup())

test('movies, pages, profiles, formats, sizes, folders and parses match the contract', async () => {
  const movie = await s.add(SINTEL)
  expect(Movie.parse(movie)).toEqual(movie)
  MoviePage.parse(s.movies.list())
  z.array(QualityProfile).parse(s.media.profiles.list())
  z.array(CustomFormat).parse(s.media.customFormats())
  z.array(QualitySize).parse(s.media.qualitySizes())
  z.array(RootFolder).parse(s.media.rootFolders.list())
  ParseResult.parse(s.movies.parse('Sintel.2010.1080p.BluRay.x264-GROUP'))
})

test('the client API’s shapes and decorated TMDB lists match the contract', async () => {
  await s.add(LLAMA_DRAMA)
  const user = s.person()
  ClientItemPage.parse(s.movies.client.list({}, user))
  ClientDetail.parse(await s.movies.client.item('movie', LLAMA_DRAMA, user))
  SearchResults.parse(
    await s.movies.client.search('caminandes', { userId: user, mayRequest: true }),
  )
  const collection = await s.metadata.collection(339473)
  z.array(DiscoverMovie).parse(s.movies.decorate(collection.parts))
})
