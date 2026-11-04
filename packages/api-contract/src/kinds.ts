// SPDX-License-Identifier: AGPL-3.0-only
// The shapes of shows and music that the films' own routes carry too: Search's new kinds (shows,
// episodes, artists, albums and songs), an episode on Home and Continue watching, and its place in
// the player. Drafted with B3 of the one client platform (one-client-platform-b.md, the owner's
// answer 1): the prototypes' mock answers them, and the real server, which has films only, never
// sends them. They mirror the prototype's draft types (packages/mock/src/types.ts), with the
// contract's conventions: shows and episodes are addressed by TMDB's numbers, as films are (ADR
// 0014), music by its own string ids, images are nullable, and people are numbered as on a film.
// Kept apart from shows.ts and music.ts so library.ts can carry them without importing those.
import { z } from '@hono/zod-openapi'
import { IsoDate, IsoDay } from './common.ts'

const Image = z.string().nullable()

// ---------------------------------------------------------------- shows

/**
 * An episode, with this person's watch state as a film has it (ClientItem). `id` is TMDB's
 * episode id, `show` the show's TMDB id.
 */
export const ClientEpisode = z
  .object({
    id: z.number().int(),
    show: z.number().int(),
    /** Its season, 0 for specials. */
    season: z.number().int().min(0),
    /** Its place in the season, from 1. */
    number: z.number().int().min(1),
    title: z.string(),
    synopsis: z.string(),
    runtimeMinutes: z.number().int(),
    /** First aired. */
    aired: IsoDay,
    still: Image,
    /** 0–1 through the episode, or null if not started (or finished). */
    progress: z.number().min(0).max(1).nullable(),
    /** Seconds in, for Resume. */
    position: z.number().min(0),
    watched: z.boolean(),
  })
  .openapi('ClientEpisode')

/**
 * The episode Play plays, as the Apple TV app, Netflix and Plex choose it: the one part way
 * through; else the one after the last watched; else the first. `resume` part way, `next` after
 * one watched, `start` before any, `again` once every episode is watched.
 */
export const NextEpisode = z
  .object({ episode: ClientEpisode, kind: z.enum(['resume', 'next', 'start', 'again']) })
  .openapi('NextEpisode')

/**
 * A show in the shows library: its years on air, how many seasons and episodes are here, and this
 * person's place in it.
 */
export const ClientShow = z
  .object({
    /** TMDB's id for the series. */
    id: z.number().int(),
    title: z.string(),
    /** For A–Z: the title without a leading "The" or "A". */
    sortTitle: z.string(),
    /** The year it first aired. */
    year: z.number().int(),
    /** The year it ended, or null while it's still airing. */
    endYear: z.number().int().nullable(),
    genres: z.array(z.string()),
    /** Out of 5, as a film's. */
    rating: z.number().min(0).max(5),
    certification: z.string(),
    synopsis: z.string(),
    /** An episode's usual length, in minutes. */
    runtimeMinutes: z.number().int(),
    /** Seasons here, specials not counted. */
    seasons: z.number().int(),
    /** Episodes here, specials not counted. */
    episodes: z.number().int(),
    addedAt: IsoDate,
    art: z.object({ poster: Image, backdrop: Image, logo: Image }),
    /** Episodes this person hasn't watched, specials not counted: the poster's count. */
    unwatched: z.number().int(),
    /** Every episode watched. */
    watched: z.boolean(),
    /** What Play plays, and how it's named; null when nothing here can play. */
    next: NextEpisode.nullable(),
  })
  .openapi('ClientShow')

/** An episode found by its title: its still, its show and its place, to open the show at it. */
export const SearchEpisode = z
  .object({
    id: z.number().int(),
    show: z.object({ id: z.number().int(), title: z.string() }),
    /** "S1, E2". */
    code: z.string(),
    title: z.string(),
    still: Image,
  })
  .openapi('SearchEpisode')

/** An episode's show and place, for the player's title lines and its way back. */
export const EpisodePlace = z
  .object({
    show: z.object({ id: z.number().int(), title: z.string() }),
    season: z.number().int().min(0),
    number: z.number().int().min(1),
    title: z.string(),
    /** "S1, E1", or "Special 2". */
    code: z.string(),
    /** The intro, in seconds, from the server's markers: Skip intro shows while it plays. */
    intro: z.object({ start: z.number(), end: z.number() }).nullable(),
    /** Where the credits start, in seconds: Next up comes in there. */
    credits: z.number().nullable(),
  })
  .openapi('EpisodePlace')

// ---------------------------------------------------------------- music

/** An artist in the music library, with how many of their albums are here. */
export const ClientArtist = z
  .object({
    id: z.string(),
    name: z.string(),
    /** For A–Z: the name without a leading "The". */
    sortName: z.string(),
    photo: Image,
    albums: z.number().int(),
    genres: z.array(z.string()),
    addedAt: IsoDate,
  })
  .openapi('ClientArtist')

export const ALBUM_KINDS = ['album', 'ep', 'single', 'soundtrack', 'compilation'] as const

/** An album in the music library: square cover art, its artist, year and tracks. */
export const ClientAlbum = z
  .object({
    id: z.string(),
    title: z.string(),
    sortTitle: z.string(),
    artist: z.object({ id: z.string(), name: z.string() }),
    year: z.number().int(),
    cover: Image,
    genres: z.array(z.string()),
    tracks: z.number().int(),
    /** Album, EP, single, soundtrack or compilation, as Plexamp groups them. */
    kind: z.enum(ALBUM_KINDS),
    addedAt: IsoDate,
  })
  .openapi('ClientAlbum')

/** A song on an album, in its order there. */
export const ClientSong = z
  .object({
    id: z.string(),
    /** Its place on the album, from 1. */
    number: z.number().int().min(1),
    title: z.string(),
    /** Seconds. */
    duration: z.number().min(0),
  })
  .openapi('ClientSong')

/** A song found by its title, on its album: choosing it plays the album from it. */
export const SearchSong = ClientSong.extend({ album: ClientAlbum }).openapi('SearchSong')

/** Recently played on Home: an album, or an artist played as a whole. */
export const HomeMusic = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('album'), album: ClientAlbum }),
    z.object({ kind: z.literal('artist'), artist: ClientArtist }),
  ])
  .openapi('HomeMusic')

export type HomeMusic = z.infer<typeof HomeMusic>
export type ClientEpisode = z.infer<typeof ClientEpisode>
export type NextEpisode = z.infer<typeof NextEpisode>
export type ClientShow = z.infer<typeof ClientShow>
export type SearchEpisode = z.infer<typeof SearchEpisode>
export type EpisodePlace = z.infer<typeof EpisodePlace>
export type ClientArtist = z.infer<typeof ClientArtist>
export type ClientAlbum = z.infer<typeof ClientAlbum>
export type AlbumKind = (typeof ALBUM_KINDS)[number]
export type ClientSong = z.infer<typeof ClientSong>
export type SearchSong = z.infer<typeof SearchSong>
