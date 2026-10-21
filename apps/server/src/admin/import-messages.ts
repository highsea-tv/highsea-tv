// SPDX-License-Identifier: AGPL-3.0-only
// A17 Manual import (ADR 0021): the prototype's copy, with what real data adds: a file the server
// couldn't bring in says why, and the name a hand-chosen movie gives shows after Look inside.
import { defineMessages } from '@highsea/i18n'

export const manualImport = defineMessages({
  title: 'Manual import',
  description: 'Bring in files highsea didn’t download, or couldn’t import on its own.',
  back: 'Back to Activity',
  folder: 'Folder',
  folderHint: 'A folder on the server. highsea looks inside it, and one level down.',
  lookInside: 'Look inside',
  foldersHere: 'Folders here',
  up: 'Up',
  start: 'Choose a folder, then look inside it.',
  empty: 'Nothing to import here',
  emptyBody: 'There are no video files in {path}.',
  how: 'How to bring them in',
  'mode.hardlink': 'Hardlink',
  'mode.move': 'Move',
  'mode.hardlinkBody': 'No extra space, and anything seeding keeps seeding.',
  'mode.moveBody': 'The files leave this folder.',
  run: 'Import {count, plural, one {# file} other {# files}}',
  'col.import': 'Import',
  'col.file': 'File',
  'col.movie': 'Movie',
  'col.quality': 'Quality',
  'col.size': 'Size',
  'col.becomes': 'Becomes',
  importOf: 'Import {file}',
  movieOf: '{file}: movie',
  choose: 'Choose a movie',
  imported: 'Imported',
  noMatch: 'Didn’t match a movie. Choose one.',
  movieLabel: '{title} ({year})',
  'done.title': '{count, plural, one {# file} other {# files}} imported',
  'done.body': 'Renamed into the library.',
  'done.some':
    '{failed, plural, one {# file} other {# files}} of {count} couldn’t be imported. Each one says why.',
  'fail.run': 'Couldn’t import them',
})
