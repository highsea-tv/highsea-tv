// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Playback (ADR 0021, checkpoints 4.3a and 4.3b): the prototype's groups, in its words.
// Real data adds the cache folder's refusals, the checks on the two numbers, a check's refusal, and
// "a minute ago" where the prototype counted 1 minutes. What a path found and its check's detail
// come from the server (`@highsea-tv/stream/hardware`'s messages).
import { defineMessages } from '@highsea-tv/i18n'

export const playback = defineMessages({
  what: 'the playback settings',
  'hardware.title': 'Hardware acceleration',
  'hardware.description':
    'A graphics chip transcodes many times faster than the processor, and uses far less power.',
  'hardware.using': 'Transcoding with {path}',
  'hardware.processor': 'Transcoding with the processor',
  'hardware.processorForNow': 'Transcoding with the processor, for now',
  'hardware.usingBody': '{name}. Its check passed, so highsea uses it.',
  'hardware.offBody':
    'Hardware acceleration is off. Each transcode takes a processor core or more.',
  'hardware.chosenBody': '{path} is used once its check passes.',
  'hardware.foundBody':
    'highsea checks the graphics it finds by itself, and uses them once a check passes.',
  'hardware.noneBody':
    'highsea found no graphics chip it can use. Films that need a transcode still play, more slowly.',
  'hardware.found': 'What highsea found',
  'mark.checking': 'Checking',
  'mark.unavailable': 'Not here',
  'mark.unchecked': 'Found, not checked',
  'mark.passed': 'Passed',
  'mark.failed': 'Failed',
  inUse: 'In use',
  checkingLine: 'Transcoding a short clip…',
  passedLine: '{fps} frames a second, checked {ago}. {detail}',
  failedLine: 'Failed {ago}. {detail}',
  uncheckedLine: '{line} Not checked yet.',
  check: 'Check',
  checkAgain: 'Check again',
  checkError: 'Couldn’t check it',
  'ago.now': 'just now',
  'ago.minutes': '{n, plural, one {a minute ago} other {# minutes ago}}',
  'ago.hours': '{n, plural, one {an hour ago} other {# hours ago}}',
  'ago.yesterday': 'yesterday',
  'ago.days': '{n} days ago',
  'path.vaapi': 'VAAPI',
  'path.qsv': 'Intel Quick Sync',
  'path.nvenc': 'NVIDIA NVENC',
  'path.videotoolbox': 'VideoToolbox',
  'path.vaapi.line': 'Intel and AMD graphics on Linux, through /dev/dri.',
  'path.qsv.line': 'Intel graphics on Linux, through the Intel media driver.',
  'path.nvenc.line': 'NVIDIA graphics, through NVIDIA’s container toolkit.',
  'path.videotoolbox.line': 'Apple silicon and Intel Macs.',
  passThrough:
    'Give highsea’s container the graphics chip, then restart it, and highsea checks the chip as it starts. For Intel and AMD graphics, pass /dev/dri through. For NVIDIA, install NVIDIA’s container toolkit on the host first.',
  'passThrough.intel': 'Compose lines for Intel and AMD',
  'passThrough.nvidia': 'Compose lines for NVIDIA',
  'passThrough.guide': 'Hardware acceleration in the guide',
  use: 'Use',
  useHint: 'Automatic picks the first one whose check passed. highsea never uses one that hasn’t.',
  'use.auto': 'Automatic',
  'use.off': 'The processor only',
  toneMapping: 'Convert HDR for screens that can’t show it',
  toneMappingHint:
    'Tone mapping keeps the colours right on an SDR screen. It needs a graphics chip to keep up with 4K.',
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
