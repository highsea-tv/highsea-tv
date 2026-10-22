// SPDX-License-Identifier: AGPL-3.0-only
// Tags (checkpoint 8c, ADR 0021). The prototypes have no tags, so this copy follows the plan
// (checkpoint 8 › Tags), Radarr's help text for what each tag does, and the brand brief's voice.
import { defineMessages } from '@highsea/i18n'

export const tagsMessages = defineMessages({
  // the picker, in each edit dialog
  label: 'Tags',
  choose: 'Choose tags',
  chooseFor: 'Choose tags for {name}',
  none: 'None',
  empty: 'No tags yet.',
  manage: 'Manage tags',
  'hint.movie': 'Indexers, lists and connections with a tag work only for movies that share it.',
  'hint.indexer': 'Used only for movies with one of these tags. With none, used for every movie.',
  'hint.list': 'Given to every movie this list adds.',
  'hint.connection':
    'A movie’s messages come here only for movies with one of these tags. With none, for every movie.',
  // Settings › Media management › Tags
  title: 'Tags',
  description:
    'Tags tie movies to the indexers, lists and connections that should serve them. An indexer or connection with tags works only for movies sharing one; a list’s tags go on every movie it adds.',
  what: 'the tags',
  'list.none': 'No tags yet.',
  usage:
    '{movies, plural, =0 {No movies} one {# movie} other {# movies}} · {others, plural, =0 {nothing else} one {# indexer, list or connection} other {# indexers, lists or connections}}',
  'add.label': 'New tag',
  'add.placeholder': 'kids',
  'add.submit': 'Add tag',
  'add.missing': 'Enter a label.',
  'add.added': '{label} added',
  rename: 'Rename',
  renameLabel: 'Rename {label}',
  'rename.title': 'Rename {label}',
  'rename.field': 'Label',
  'rename.save': 'Save',
  'rename.cancel': 'Cancel',
  'rename.saved': 'Renamed to {label}',
  remove: 'Remove',
  removeLabel: 'Remove {label}',
  'remove.title': 'Remove {label}?',
  'remove.body':
    'It comes off every movie, indexer, list and connection that has it. An indexer or connection left with no tags works for every movie again.',
  'remove.confirm': 'Remove tag',
  'remove.keep': 'Keep it',
  'remove.done': '{label} removed',
  failed: 'Couldn’t save the tag',
})
