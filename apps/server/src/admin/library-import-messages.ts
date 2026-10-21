// SPDX-License-Identifier: AGPL-3.0-only
// A17's Library import mode (ADR 0021): a library already on disk, matched on TMDB and added where
// it is. Opened from Settings › Media management's root folders.
import { defineMessages } from '@highsea/i18n'

export const libraryImport = defineMessages({
  title: 'Library import',
  description: 'Add the movies already in a root folder, where they are.',
  back: 'Back to Activity',
  filesMode: 'Manual import',
  libraryMode: 'Library import',
  modes: 'What to import',
  root: 'Root folder',
  // {tmdb} and {imdb} are the literal id tags, passed in so the braces aren't read as arguments
  rootHint:
    'Each folder inside it is read as one movie, by its name: Title (Year), or with a {tmdb} or {imdb} id.',
  chooseRoot: 'Choose a root folder',
  noRoots: 'Add a root folder in Settings › Media management first.',
  lookInside: 'Look inside',
  start: 'Choose a root folder, then look inside it.',
  empty: 'No folders here',
  emptyBody: 'There are no folders in {path}.',
  noKey: 'Matching needs a TMDB key. Add one in Settings › General.',
  rename: 'Rename to my format',
  renameBody: 'Folders and files take the naming formats from Settings › Media management.',
  keepBody: 'Nothing is moved or renamed.',
  profile: 'Quality profile',
  run: 'Import {count, plural, one {# movie} other {# movies}}',
  'col.import': 'Import',
  'col.folder': 'Folder',
  'col.movie': 'Movie',
  'col.quality': 'Quality',
  'col.size': 'Size',
  importOf: 'Import {folder}',
  movieLabel: '{title} ({year})',
  noMatch:
    'No match on TMDB. Add {tmdb} with the movie’s id to the folder’s name, then look again.',
  inLibrary: 'In the library',
  progress: 'Importing',
  progressOf: 'Library import progress',
  progressBody: '{done} of {total} done',
  'done.title': '{count, plural, one {# movie} other {# movies}} imported',
  'done.some':
    '{failed, plural, one {# folder} other {# folders}} of {count} couldn’t be imported. Each one says why.',
  'fail.run': 'Couldn’t start the import',
  failed: 'The import stopped. What was done stays done; look inside again to import the rest.',
  running: 'A library import is running.',
})
