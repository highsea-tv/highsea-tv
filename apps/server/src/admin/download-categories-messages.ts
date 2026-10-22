// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Download client's Categories and Watch folder groups (checkpoint 6b, ADR 0021). No
// prototype screen has them; the copy follows the brief's voice and the root folders' list.
import { defineMessages } from '@highsea-tv/i18n'

export const categories = defineMessages({
  title: 'Categories',
  description:
    'Torrents you add by hand go in a category, which sets the folder they save to. movies holds the library’s grabs; manual is for torrents added without one.',
  what: 'the categories',
  builtIn: 'Built in',
  torrents: '{count, plural, =0 {No torrents} one {# torrent} other {# torrents}}',
  inUse:
    '{count, plural, one {A torrent uses it. Remove it from Downloads first.} other {# torrents use it. Remove them from Downloads first.}}',
  remove: 'Remove',
  removeLabel: 'Remove {name}',
  removeTitle: 'Remove {name}?',
  removeBody: 'Nothing on disk is deleted. Torrents you add later can’t choose it.',
  removeConfirm: 'Remove the category',
  keep: 'Keep it',
  removed: '{name} removed',
  removeFailed: 'Couldn’t remove the category',
  name: 'Name',
  nameHint: 'Letters, digits, spaces, dots, dashes and underscores.',
  folder: 'Folder',
  folderHint:
    'Empty: a folder of that name in the downloads folder. Saving a name that’s here changes its folder; torrents already in it stay where they are.',
  folderPlaceholder: '/data/downloads/books',
  missing: 'Give the category a name.',
  save: 'Save the category',
  saved: '{name} saved',
})

export const watchFolder = defineMessages({
  title: 'Watch folder',
  description:
    'A .torrent file dropped here is added to Downloads, then renamed .torrent.added. A file that isn’t a torrent is renamed .torrent.invalid.',
  folder: 'Folder',
  folderHint: 'Inside the data folder or the downloads folder. Empty: off.',
  folderPlaceholder: '/data/watch',
  category: 'Category',
  categoryHint: 'Torrents from the watch folder go here. They aren’t imported into the library.',
})
