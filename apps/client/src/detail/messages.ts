// SPDX-License-Identifier: AGPL-3.0-only
// A film's page and a person's words (client-detail.md › States), once for every client: the
// apps' own copies (apps/web's and the old phone and TV apps' `detail`, `tracks` and `person`)
// gathered here. Mark as watched's label and its words after, Off and a version with no sound are
// every app's, in @highsea-tv/client/films (createFilmsText); the facts' labels are
// @highsea-tv/client/library's. Back, Movies and Search are the library screens' (libraryScreenMessages).
import { defineMessages } from '@highsea-tv/i18n'

export const detailMessages = defineMessages({
  fromStart: 'From the start',
  // a pointer's round button, named in full beside Resume (web/detail.tsx)
  playFromStart: 'Play from the start',
  tracks: 'Audio and subtitles',
  watched: 'Watched',
  // each run before the names it leads, quieter than them
  starring: 'Starring ',
  directedBy: 'Directed by ',
  defaultAudio: 'Default audio',
  subtitlesOff: 'Subtitles off',
  remembered: 'Remembered for this movie, on all your devices.',
  version: 'Version',
  audio: 'Audio',
  subtitles: 'Subtitles',
  saveFailed: 'Couldn’t save that. {message}',
  markFailed: 'Couldn’t change it. {message}',
  notPlayable: 'It has no file to play yet.',
  moreLike: 'More like this',
  collections: 'Collections',
  people: 'Cast and crew',
  about: 'About',
  information: 'Information',
  languages: 'Languages and quality',
  // not found (client-detail.md › Errors): the web's body names Search, the TV's way out is Movies
  missingTitle: 'That title isn’t on this server.',
  missingBody: 'It may have been removed.',
  missingBodyWeb: 'It may have been removed. Search finds everything you can watch.',
  goHome: 'Go home',
  // the TV's dialog
  tvSaved: 'Back closes. Saved for this movie.',
  // the trailer (the web, the desktop app and the phone), and its dialog's line: TMDB's video
  // types, as the admin names them (apps/server's media-sections-messages.ts)
  trailer: 'Trailer',
  trailerMock:
    'In highsea this plays from youtube-nocookie.com, and only once you choose it. The prototype doesn’t load YouTube.',
  'kind.Trailer': 'Trailer',
  'kind.Teaser': 'Teaser',
  'kind.Clip': 'Clip',
  'kind.Featurette': 'Featurette',
  'kind.Behind the Scenes': 'Behind the scenes',
  'kind.Bloopers': 'Bloopers',
  'kind.Opening Credits': 'Opening credits',
})

export const personMessages = defineMessages({
  missingTitle: 'That person isn’t on this server.',
  gone: 'What they were part of may have been removed.',
  more: 'More',
  less: 'Less',
})
