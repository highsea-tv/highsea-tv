// SPDX-License-Identifier: AGPL-3.0-only
// Shows' settings in the admin (docs/product/settings.md, prototype-gaps.md's stage 6), drafted with
// D3 of the one client platform (one-client-platform-d.md, the owner's answer 5) beside Shows'
// own routes (series.ts):
// - Settings › Media management's episode naming, as Sonarr's
//   (https://wiki.servarr.com/sonarr/settings#episode-naming);
// - Settings › Quality's sizes per minute of an episode, as Sonarr's quality definitions;
// - how many movies and shows use each quality profile, for Settings › Profiles and formats.
// Each is a draft (`draft()` in common.ts): the prototypes' mock answers it, the real server
// answers 501 until it has shows, and the admin draws these parts only when public info's
// `sources` lists `shows`. They join the `series` group (index.ts), so the SDK has them as
// `series.naming()` and the rest. Their paths sit beside the films' (`/settings/qualitySizes`)
// rather than under `/series/{id}`, which would match them.
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, draft, errors, json, notServed } from './common.ts'
import { QualitySize } from './quality.ts'

/**
 * How a file holding several episodes names them (Sonarr's Multi Episode Style), for S01E01 to E03:
 * extend `S01E01-02-03`, duplicate `S01E01 - S01E02 - S01E03`, repeat `S01E01E02E03`, scene
 * `S01E01-E02-E03`, range `S01E01-03`, prefixed range `S01E01-E03`.
 */
export const MULTI_EPISODE_STYLES = [
  'extend',
  'duplicate',
  'repeat',
  'scene',
  'range',
  'prefixed-range',
] as const

export const EpisodeNaming = z
  .object({
    rename: z.boolean(),
    /** A normal episode's file, without its extension. */
    standardFormat: z.string(),
    /** A daily show's (a talk show, the news), named by its air date. */
    dailyFormat: z.string(),
    seriesFolderFormat: z.string(),
    seasonFolderFormat: z.string(),
    multiEpisodeStyle: z.enum(MULTI_EPISODE_STYLES),
  })
  .openapi('EpisodeNaming')
export type EpisodeNaming = z.infer<typeof EpisodeNaming>

/** How many movies and shows use a quality profile. */
export const ProfileUsage = z
  .object({
    profileId: z.string(),
    movies: z.number().int().nonnegative(),
    shows: z.number().int().nonnegative(),
  })
  .openapi('ProfileUsage')
export type ProfileUsage = z.infer<typeof ProfileUsage>

const staff = { ...access('staff'), ...draft() }
const refused = errors('unauthorized', 'forbidden')

export const seriesSettings = {
  naming: createRoute({
    method: 'get',
    path: `${API_PREFIX}/settings/episodeNaming`,
    tags: ['Series'],
    summary: 'Episode naming (draft)',
    description: 'Sonarr’s formats and tokens. Drafted: the server answers 501 until it has shows.',
    ...staff,
    responses: { 200: json(EpisodeNaming, 'Episode naming'), ...refused, ...notServed },
  }),
  saveNaming: createRoute({
    method: 'put',
    path: `${API_PREFIX}/settings/episodeNaming`,
    tags: ['Series'],
    summary: 'Save episode naming (draft)',
    description:
      'The details’ `reason` names the field a format is refused for. Drafted: the server answers 501.',
    ...staff,
    request: { ...body(EpisodeNaming) },
    responses: {
      200: json(EpisodeNaming, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
      ...notServed,
    },
  }),
  qualitySizes: createRoute({
    method: 'get',
    path: `${API_PREFIX}/settings/episodeSizes`,
    tags: ['Series'],
    summary: 'Sizes per minute of an episode (draft)',
    description: 'MiB per minute, as the films’ sizes. Drafted: the server answers 501.',
    ...staff,
    responses: {
      200: json(z.array(QualitySize), 'The sizes, lowest quality first'),
      ...refused,
      ...notServed,
    },
  }),
  saveQualitySizes: createRoute({
    method: 'put',
    path: `${API_PREFIX}/settings/episodeSizes`,
    tags: ['Series'],
    summary: 'Save the sizes per minute of an episode (draft)',
    description:
      'Every quality once, checked as the films’ sizes. Drafted: the server answers 501.',
    ...staff,
    request: { ...body(z.array(QualitySize)) },
    responses: {
      200: json(z.array(QualitySize), 'Saved, lowest quality first'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
      ...notServed,
    },
  }),
  profileUsage: createRoute({
    method: 'get',
    path: `${API_PREFIX}/quality/profileUsage`,
    tags: ['Series'],
    summary: 'How many movies and shows use each quality profile (draft)',
    description: 'Drafted: the server answers 501 until it has shows.',
    ...staff,
    responses: {
      200: json(z.array(ProfileUsage), 'Each profile’s use'),
      ...refused,
      ...notServed,
    },
  }),
}
