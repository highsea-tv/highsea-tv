// SPDX-License-Identifier: AGPL-3.0-only
// The pointer's shortcuts' list (desktop-web.md › Keyboard): each key's name, read in place of the
// key drawn (the library's Kbd is hidden from screen readers), and what it does.
import { defineMessages } from '@highsea-tv/i18n'

export const shortcutsMessages = defineMessages({
  title: 'Keyboard shortcuts',
  anywhere: 'Anywhere',
  player: 'In the player',
  close: 'Close',
  row: '{keys}: {action}',
  'key.slash': 'Slash',
  'key.question': 'Question mark',
  'key.space': 'Space',
  'key.arrows': 'Left or right arrow',
  'key.m': 'M',
  'key.f': 'F',
  'key.escape': 'Escape',
  search: 'Search',
  list: 'These shortcuts',
  playPause: 'Play or pause',
  seek: 'Back or forward {seconds} seconds',
  mute: 'Mute or unmute',
  fullScreen: 'Full screen, or leave it',
  leave: 'Leave the player',
})
