// SPDX-License-Identifier: AGPL-3.0-only
// fanart.tv's answers, as its API v3.2 documents them (https://api.fanart.tv, "Get movie images",
// "Get TV show images", "Get music artist images"). Every image has `id`, `url`, `lang` and
// `likes`; v3.2 adds `width`, `height` and `added`. Numbers come as strings. Only what highsea
// reads is typed; the rest is kept as fanart.tv sent it.

/** One image. `lang` is ISO 639-1, `00` for none (textless), sometimes empty. */
export type FanartImage = {
  id: string
  url: string
  lang?: string
  likes?: string
  width?: string
  height?: string
  added?: string
  copyright?: string
  copyright_link?: string
  /** A TV season poster's or thumb's season (`all` for every season). */
  season?: string
}

/** `GET /v3.2/movies/{tmdb id}`. */
export type FanartMovie = {
  name?: string
  tmdb_id?: string
  imdb_id?: string
  hdmovielogo?: FanartImage[]
  movielogo?: FanartImage[]
  movieposter?: FanartImage[]
  moviebackground?: FanartImage[]
  moviebanner?: FanartImage[]
  moviethumb?: FanartImage[]
  hdmovieclearart?: FanartImage[]
  moviedisc?: FanartImage[]
}

/** `GET /v3.2/tv/{TheTVDB id}`: read once shows' art is (ADR 0070). */
export type FanartShow = {
  name?: string
  thetvdb_id?: string
  hdtvlogo?: FanartImage[]
  tvposter?: FanartImage[]
  showbackground?: FanartImage[]
  seasonposter?: FanartImage[]
}

/** `GET /v3.2/music/{MusicBrainz artist id}`: read once music's art is (ADR 0070). */
export type FanartArtist = {
  name?: string
  mbid_id?: string
  hdmusiclogo?: FanartImage[]
  artistbackground?: FanartImage[]
  artistthumb?: FanartImage[]
}

export type FanartAnswer = FanartMovie | FanartShow | FanartArtist
