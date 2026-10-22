// SPDX-License-Identifier: AGPL-3.0-only
// A person's page (media-pages.md § Person page, § Copy; ADR 0021): the prototype's copy, with the
// department filter over TMDB's 12 departments (checkpoint 4 plan, Admin › People and collection
// pages) and no place of death, which TMDB doesn't have.
import { defineMessages } from '@highsea-tv/i18n'

export const person = defineMessages({
  person: 'Person',
  summary: 'Summary',
  titles: '{count, plural, one {# title} other {# titles}}',
  born: 'Born',
  died: 'Died',
  bornAt: '{date}, {place}',
  noBio: 'TMDB has no biography for {name} yet.',
  knownFor: 'Known for',
  filmography: 'Filmography',
  filter: 'Filter the filmography',
  'filter.all': 'All',
  'filter.in': 'In the library',
  'filter.out': 'Not in the library',
  department: 'Department',
  'department.all': 'All departments',
  nothing: 'Nothing here yet.',
  title: 'Title',
  role: 'Role',
  library: 'Library',
  inLibrary: 'In library',
  'inLibrary.label': 'In library: {title}',
  add: 'Add',
  'add.label': 'Add {title}',
  'unknown.title': 'TMDB doesn’t know that person',
  'unknown.body': 'They may have been merged with another entry.',
  // what they're known for, as the prototype words it: composers are Sound at TMDB
  'knownFor.Acting': 'Acting',
  'knownFor.Directing': 'Directing',
  'knownFor.Writing': 'Writing',
  'knownFor.Production': 'Production',
  'knownFor.Sound': 'Music',
  'knownFor.Camera': 'Cinematography',
  'knownFor.Editing': 'Editing',
  'knownFor.Art': 'Art direction',
  'knownFor.Costume & Make-Up': 'Costume and make-up',
  'knownFor.Visual Effects': 'Visual effects',
  'knownFor.Crew': 'Crew',
  'knownFor.Lighting': 'Lighting',
})
