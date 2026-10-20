// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Media management (ADR 0021): the Importing group's root folders (checkpoint 4). The
// prototype's Importing group has no folder list, so this copy follows the plan (Admin › Root
// folders), setup's folder step and the brand brief.
import { defineMessages } from '@highsea/i18n'

export const media = defineMessages({
  'importing.title': 'Importing',
  'folders.title': 'Root folders',
  'folders.description':
    'The folders movies are filed under. Each movie lives in a folder of its own inside one.',
  'folders.what': 'the root folders',
  'folders.none': 'No root folders yet. Add the folder your movies live in.',
  'folders.free': '{free} free of {total}',
  'folders.unreadable': 'Can’t be read now',
  'folders.movies': '{count, plural, =0 {No movies} one {# movie} other {# movies}}',
  'folders.remove': 'Remove',
  'folders.removeLabel': 'Remove {path}',
  'folders.inUse':
    '{count, plural, one {# movie is filed under it.} other {# movies are filed under it.}} Move them to another folder first.',
  'folders.removeTitle': 'Remove {path}?',
  'folders.removeBody':
    'highsea stops using it for new movies. Nothing on disk changes, and you can add it again later.',
  'folders.removeConfirm': 'Remove folder',
  'folders.keep': 'Keep it',
  'folders.removed': '{path} removed',
  'folders.removeFailed': 'Couldn’t remove the folder',
  'add.label': 'Add a root folder',
  'add.hint':
    'A folder on the server, not on this device. highsea checks it exists and can write to it.',
  'add.placeholder': '/data/media/movies',
  'add.submit': 'Add folder',
  'add.added': '{path} added',
  'add.missing': 'Enter the folder’s path.',
  'add.notAbsolute': 'Use the full path, starting with /.',
  'add.notFound': 'That folder doesn’t exist on the server.',
  'add.notWritable': 'highsea can’t write to that folder. Check its permissions.',
  'add.conflict': 'That folder is a root folder already, or inside or around one.',
  later:
    'Naming, hardlinks, NFO files, stop monitoring deleted files, folder permissions and the recycle bin arrive in a later checkpoint.',
})
