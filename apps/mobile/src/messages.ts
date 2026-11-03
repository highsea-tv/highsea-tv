// SPDX-License-Identifier: AGPL-3.0-only
// The phone app's words (ADR 0021), a catalog per screen, as the prototype has them with
// `?app=mobile` (design/prototypes/src/mobile and client/connect-flow.tsx), and as the web client
// words the same screens (apps/web/src/messages.ts). What the apps share (running times, captions)
// is in `@highsea-tv/client/format`. A server's public info doesn't name its owner, so its rows give
// its address where the prototype has "Ines's server".
import {
  connectMessages,
  forgetMessages,
  shellMessages,
  signInMessages,
} from '@highsea-tv/client/gate'
import { settingsPageMessages } from '@highsea-tv/client/prefs'
import { defineMessages } from '@highsea-tv/i18n'

// Choose a server, signing in and forgetting a server are every client's, in @highsea-tv/client/gate
export { connectMessages as connect, forgetMessages as forget, signInMessages as signIn }

export const shell = defineMessages({
  ...shellMessages,
  servers: 'Servers',
  onNetwork: 'On this network',
  offLine: 'Can’t reach it right now',
  otherLine: '{signedIn, select, true {Signed in} other {Signed out}} · {when}',
  profile: '{name}: profile and settings',
  announcement: 'Announcement',
  gotIt: 'Got it',
  notFoundTitle: 'There’s nothing here',
  notFoundBody: 'It may have moved. The tabs below lead everywhere.',
  goHome: 'Go home',
  loading: 'Loading',
  justNow: 'just now',
})

export const home = defineMessages({
  new: 'New',
  continue: 'Continue watching',
  recent: 'Recently added',
  play: 'Play',
  resume: 'Resume',
  playTitle: 'Play {title}',
  details: 'Details',
  failed: 'Couldn’t load the home screen',
  emptyTitle: 'Nothing to watch yet',
  emptyBody: 'When the server’s owner adds movies, they show up here.',
  tryAgain: 'Try again',
  seeAll: 'See all',
  cardMenu: 'More options',
  cancel: 'Cancel',
  changeFailed: 'Couldn’t change it. {message}',
})

export const library = defineMessages({
  title: 'Library',
  movies: 'Movies',
  collections: 'Collections',
  all: 'All',
  allMovies: 'All movies',
  unwatched: 'Unwatched',
  shown: '{shown} of {total} movies',
  sortFilter: 'Sort and filter',
  sorted: 'Sorted and filtered',
  show: 'Show',
  sortBy: 'Sort by',
  genre: 'Genre',
  'sort.title': 'Title',
  'sort.added': 'Recently added',
  'sort.year': 'Newest first',
  'sort.rating': 'Highest rated',
  reset: 'Reset',
  showCount: 'Show {count, plural, one {# movie} other {# movies}}',
  noMatchTitle: 'No movies match',
  letters: 'Jump to a letter',
  noMatch: 'Try another genre.',
  tileLabel: '{name}, {caption}',
  smartTileLabel: '{name}, smart collection, {caption}',
  failed: 'Couldn’t load the library',
  tryAgain: 'Try again',
  emptyTitle: 'No movies yet',
  emptyBody: 'When the server’s owner adds movies, they show up here.',
  noMatchUnwatched: 'You’ve watched everything here. Try another genre, or show all movies.',
  collectionsFailed: 'Couldn’t load the collections',
  noCollectionsTitle: 'No collections yet',
  noCollections:
    'When the server’s owner makes collections, or films here belong to one, they show up here.',
  smart: 'Smart',
  smartCollection: 'Smart collection',
  search: 'Search',
  collectionGone: 'It may have been removed.',
  collectionMissing: 'This collection isn’t here',
  back: 'Back',
})

export const detail = defineMessages({
  play: 'Play',
  resume: 'Resume',
  fromStart: 'From the start',
  markFailed: 'Couldn’t change it. {message}',
  watched: 'Watched',
  starring: 'Starring ',
  directedBy: 'Directed by ',
  tracks: 'Audio and subtitles',
  defaultAudio: 'Default audio',
  subtitlesOff: 'Subtitles off',
  remembered: 'Remembered for this movie, on all your devices.',
  version: 'Version',
  audio: 'Audio',
  subtitles: 'Subtitles',
  off: 'Off',
  noAudio: 'No sound tracks',
  saveFailed: 'Couldn’t save that. {message}',
  moreLike: 'More like this',
  collections: 'Collections',
  people: 'Cast and crew',
  about: 'About',
  information: 'Information',
  languages: 'Languages and quality',
  missingBody: 'It may have been removed.',
  goHome: 'Go home',
  notPlayable: 'It has no file to play yet.',
  back: 'Back',
  cancel: 'Cancel',
})

export const person = defineMessages({
  gone: 'What they were part of may have been removed.',
  search: 'Search',
  more: 'More',
  less: 'Less',
  back: 'Back',
})

export const search = defineMessages({
  title: 'Search',
  field: 'Search titles, genres and people',
  placeholder: 'Titles, genres and people',
  clear: 'Clear search',
  failed: 'Search didn’t work. {message}',
  searching: 'Searching…',
  nothing: 'Nothing on {name} matches “{query}”.',
  movies: 'Movies',
  collections: 'Collections',
  people: 'People',
})

export const offline = defineMessages({
  title: 'Offline',
  emptyTitle: 'Nothing downloaded',
  emptyBody: 'Downloading films to this phone comes in the next update of the app.',
})

// Settings' words are every app's (@highsea-tv/client/prefs); You adds its own.
export const you = defineMessages({
  ...settingsPageMessages,
  title: 'You',
  'handle.owner': '@{username} · owner of {name}',
  'handle.admin': '@{username} · admin of {name}',
  'handle.user': '@{username} · member of {name}',
  downloads: 'Downloads',
  // apps/client's About has no source link (the prototype's has none); this app keeps its own
  source: 'Source code',
})

export const pair = defineMessages({
  title: 'Connect a device',
  back: 'Back',
  scanHint: 'Point your camera at the code on the TV.',
  typeHint: 'Type the code your TV or app shows.',
  camera: 'The camera, looking for the TV’s code',
  looking: 'Looking for a code…',
  typeInstead: 'Enter the code instead',
  scanInstead: 'Scan the code instead',
  code: 'Code',
  continue: 'Continue',
  cameraOff:
    'highsea can’t use the camera. Allow it in Settings › highsea, or enter the code instead.',
  allowCamera: 'Allow the camera',
  missingTitle: 'That code isn’t waiting',
  missingBody: 'Check it on the TV, or start again there for a new one.',
  tryAgain: 'Try again',
  question: 'Sign in {device}?',
  detail:
    '{app} at {address} signs in as you. It stays signed in until you sign it out from You › Devices.',
  expires: 'Code {code} · it expires in {minutes, plural, one {# minute} other {# minutes}}.',
  'app.tvos': 'highsea for Apple TV',
  'app.androidtv': 'highsea for Android TV',
  'app.ios': 'highsea for iPhone',
  'app.android': 'highsea for Android',
  'app.desktop': 'highsea for computers',
  'app.other': 'A highsea app',
  servers: 'Servers',
  approve: 'Sign it in',
  cancel: 'Cancel',
  doneTitle: '{device} is signed in',
  doneBody: 'It opens Home on the TV now. Sign it out from You › Devices whenever you like.',
  done: 'Done',
  failed: 'Couldn’t sign it in. {message}',
})

export const player = defineMessages({
  close: 'Close',
  play: 'Play',
  pause: 'Pause',
  backBy: 'Back {seconds} seconds',
  forwardBy: 'Forward {seconds} seconds',
  tracks: 'Audio and subtitles',
  pip: 'Picture in picture',
  airplay: 'AirPlay',
  airplayOn: 'AirPlay: playing on another screen',
  external: 'Playing on another screen',
  externalBody: 'The controls here still work. Subtitles show on that screen.',
  showControls: 'Show controls',
  hideControls: 'Hide controls',
  backToDetails: 'Back to details',
  position: 'Position',
  positionText: '{at} of {total}',
  audio: 'Audio',
  subtitles: 'Subtitles',
  version: 'Version',
  off: 'Off',
  timing: 'Subtitle timing',
  earlier: 'Earlier',
  later: 'Later',
  reset: 'Reset',
  saved: 'Saved for this movie.',
  pictureTrack: 'This subtitle is a picture, which the app can’t show yet.',
  burntTiming: 'This subtitle is drawn into the picture, so its timing can’t be changed.',
  preparing: 'Getting it ready',
  preparingBody: 'Making the first minute for your connection.',
  buffering: 'Buffering',
  failed: 'This film didn’t start',
  failedBody:
    'highsea couldn’t read the file. Try again, or choose another version in Audio and subtitles.',
  failedLimit:
    'The server is already making as many films as it’s set to. Try again when one finishes.',
  stopped: '{name} stopped this stream',
  stoppedBody: 'You can start it again from where you were.',
  tryAgain: 'Try again',
  startAgain: 'Start again',
  back: 'Back',
  nextUp: 'Next up',
  moreLike: 'More like this',
  startsIn: 'Starts in {seconds} s',
  playNow: 'Play now',
  cancel: 'Cancel',
  missingBody: 'It may have been removed.',
  goHome: 'Go home',
})
