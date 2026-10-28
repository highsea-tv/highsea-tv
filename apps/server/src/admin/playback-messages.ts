// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (ADR 0021, checkpoint 4.3a): the prototype's Transcoding, Away from home and
// Cache groups, in its words. Hardware acceleration's group comes with 4.3b. Real data adds the
// cache folder's refusals and the checks on the two numbers.
import { defineMessages } from '@highsea-tv/i18n'

export const playback = defineMessages({
  what: 'the playback settings',
  'transcoding.title': 'Transcoding',
  'transcoding.description':
    'highsea plays a film as it is when the device can. It converts only what the device can’t play.',
  maxTranscodes: 'Transcodes at once',
  maxTranscodesHint: 'More wait until one finishes.',
  maxTranscodesInvalid: 'A whole number from 1 to 8.',
  encoder: 'Encoder',
  'encoder.speed': 'Faster',
  'encoder.balanced': 'Balanced',
  'encoder.quality': 'Sharper',
  'encoder.speed.hint': 'Starts sooner and uses less of the machine. Pictures are a little softer.',
  'encoder.balanced.hint': 'Sharp pictures that start quickly. Right for most servers.',
  'encoder.quality.hint': 'Sharper pictures at the same bitrate. Uses more of the machine.',
  'remote.title': 'Away from home',
  'remote.description':
    'Streams on your own network are never limited. Away from home, highsea sends no more than this to each person.',
  remote: 'The most each stream is sent',
  remoteHint:
    'Set it below your upload speed, shared by everyone watching at once. People can choose less in their apps.',
  'remote.4': '4 Mbps · 720p',
  'remote.8': '8 Mbps · 1080p',
  'remote.12': '12 Mbps · 1080p, high',
  'remote.20': '20 Mbps · 4K, compressed',
  'remote.40': '40 Mbps · 4K',
  'remote.none': 'No limit',
  'cache.title': 'Cache',
  'cache.description':
    'Transcoded segments are kept while a film plays and a while after, so seeking back is instant.',
  'cache.of': ' of {limit} for transcodes',
  'cache.over': 'Over its limit',
  'cache.overBody':
    'highsea removes the oldest segments first, from films nobody is watching. Raise the limit if it stays over while people watch.',
  'cache.trickplay':
    'Preview images for the scrubber take {size}. They’re kept with each film and don’t count towards the limit.',
  folder: 'Folder',
  folderHint: 'A fast disk helps. It needn’t be backed up.',
  folderInvalid: 'A full path, such as /transcodes.',
  limit: 'Limit, in GB',
  limitInvalid: 'A whole number from 2 to 2000.',
  clear: 'Clear transcodes',
  clearHint: 'Films playing now make their segments again.',
  cleared: 'Transcode cache cleared',
  clearError: 'Couldn’t clear the cache',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
})
