// SPDX-License-Identifier: AGPL-3.0-only
// Now playing (ADR 0021, checkpoint 4.3a): the prototype's copy, with what real data adds: a
// transcode waiting for a free slot (Settings › Playback's limit), a title that has left the
// library, and the processor named until 4.3b's hardware paths. Downloads' words wait for them.
import { defineMessages } from '@highsea-tv/i18n'

export const nowPlaying = defineMessages({
  title: 'Now playing',
  description: 'Who’s watching what, how each stream is sent, and what was watched this month.',
  sections: 'Now playing sections',
  'tab.now': 'Now',
  'tab.history': 'Last 30 days',

  'method.direct-play': 'Direct play',
  'method.direct-stream': 'Direct stream',
  'method.transcode': 'Transcode',

  'now.what': 'what’s playing',
  'now.empty': 'Nobody is watching',
  'now.emptyBody':
    'Streams show here as they start, with who’s watching, on what, and how it’s sent.',
  'stat.streams': 'Streams',
  'stat.total': 'Sent in all',
  'stat.remote': 'Away from home',
  'stat.transcodes': 'Transcodes',

  'state.stopped': 'Stopped',
  'state.paused': 'Paused',
  'state.waiting': 'Waiting',
  'state.behind': 'Can’t keep up',
  'state.playing': 'Playing',
  stop: 'Stop',
  watchedSoFar: 'Watched so far',
  of: '{position} of {runtime}',
  stoppedBy: 'Stopped by {name}.',
  stoppedByWith: 'Stopped by {name}: “{message}”',
  sentAs: 'Sent as',
  from: 'From',
  network: 'Network',
  'network.lan': 'At home',
  'network.remote': 'Away from home',
  transcodedBy: 'Transcoded by',
  speed: '{by}, {speed}× real time',
  starting: '{by}, starting',
  processor: 'The processor',
  'path.vaapi': 'VAAPI',
  'path.qsv': 'Intel Quick Sync',
  'path.nvenc': 'NVIDIA NVENC',
  'path.videotoolbox': 'VideoToolbox',
  // the link's words sit between each sentence's two halves
  'behind.before':
    'The transcode runs slower than the film, so {name}’s player keeps waiting for it. Turn on hardware acceleration in ',
  'behind.after': ', or lower what’s sent away from home.',
  'waiting.before':
    'Every transcode slot is in use, so this one waits for another to finish. Raise Transcodes at once in ',
  'waiting.after': ' if the server has room.',
  settingsLink: 'Settings › Playback',

  'stop.title': 'Stop {name}’s stream?',
  'stop.description': 'Their player stops and shows your message. They can start it again.',
  'stop.keep': 'Keep playing',
  'stop.confirm': 'Stop stream',
  'stop.message': 'Message',
  'stop.hint': 'Optional. Shown in their player, with your name.',
  'stop.placeholder': 'The server is restarting in five minutes.',
  'stop.done': 'Stream stopped',
  'stop.gone': 'That stream had already ended',
  'stop.failed': 'Couldn’t stop the stream',

  'history.what': 'the last 30 days',
  'history.empty': 'Nothing watched yet',
  'history.emptyBody':
    'Every stream is recorded here for 30 days: who, what, on which device and how it was sent.',
  'history.count': '{count, plural, one {# film} other {# films}} watched',
  'history.whose': 'Whose history',
  'history.everyone': 'Everyone',
  'history.movie': 'Movie',
  'history.who': 'Who',
  'history.device': 'Device',
  'history.sentAs': 'Sent as',
  'history.watched': 'Watched',
  'history.when': 'When',
  'history.all': 'All',
  'history.away': 'away',
})
