// SPDX-License-Identifier: AGPL-3.0-only
// TMDB's terms require its logo and this notice in an About or Credits section
// (https://www.themoviedb.org/api-terms-of-use; https://www.themoviedb.org/about/logos-attribution).
// It's the terms' exact wording, so it isn't translated: the System page's About, the setup step's
// note and the client API's server info show it as it is.

export const TMDB_ATTRIBUTION =
  'This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.'

/** Where the owner finds their key, for the setup step and Settings › General › Metadata. */
export const TMDB_KEY_URL = 'https://www.themoviedb.org/settings/api'

/** TMDB's logos and their rules. */
export const TMDB_LOGOS_URL = 'https://www.themoviedb.org/about/logos-attribution'

/** A title's, person's or collection's page on TMDB, for the About links. */
export const tmdbPageUrl = (kind: 'movie' | 'person' | 'collection', id: number) =>
  `https://www.themoviedb.org/${kind}/${id}`
