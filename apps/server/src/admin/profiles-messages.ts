// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Profiles and formats and › Quality sizes (ADR 0021): the prototype's copy. Both are
// read-only until checkpoint 8 (decision 3); the controls that edit say so in a tooltip.
import { defineMessages } from '@highsea/i18n'

export const profiles = defineMessages({
  later: 'Editing arrives in a later checkpoint of the server plan.',
  newProfile: 'New profile',
  edit: 'Edit',
  editLabel: 'Edit {name}',
  add: 'Add',
  addLabel: 'Add {name}',
  'profiles.title': 'Quality profiles',
  'profiles.description': 'Each movie uses one: what to download, and when to stop upgrading.',
  'profiles.what': 'the quality profiles',
  'profiles.none': 'No quality profiles yet.',
  'profiles.upgrades': 'Upgrades until {cutoff}',
  'profiles.noUpgrades': 'No upgrades',
  'profiles.scores': '{count, plural, one {# custom format score} other {# custom format scores}}',
  'profiles.cutoff': '{name}, the cutoff',
  'formats.title': 'Custom formats',
  'formats.description': 'Matches on a release name that add or take away score.',
  'formats.what': 'the custom formats',
  'formats.none': 'No custom formats yet.',
  'formats.format': 'Format',
  'formats.matches': 'Matches',
  'formats.from': 'From',
  'formats.preset': 'Preset',
  'formats.custom': 'Yours',
  'presets.title': 'Presets from the catalog',
  'presets.description':
    'Profiles and formats kept up to date by the community, TRaSH-style. Adding one copies it; you can edit the copy.',
  'presets.hd': 'HD Bluray + WEB',
  'presets.hdDetail': '1080p, no remuxes. x264 preferred; 3D and low-quality groups rejected.',
  'presets.uhd': 'UHD Bluray + WEB',
  'presets.uhdDetail': '2160p with HDR and Dolby Vision scores; upgrades from 1080p.',
  'presets.remux': 'Remux + WEB 2160p',
  'presets.remuxDetail': 'Remuxes first, for big screens and big disks.',
})

export const sizes = defineMessages({
  what: 'the quality sizes',
  title: 'Sizes per minute of runtime',
  description: 'A release outside the range is rejected; the preferred size wins a tie.',
  note: 'MB here are MiB (1,048,576 bytes), as in Radarr, so its numbers carry over. A movie whose runtime isn’t known counts as 110 minutes.',
  quality: 'Quality',
  min: 'Min MB/min',
  preferred: 'Preferred',
  max: 'Max',
  film: 'A 2-hour film',
  noPreference: 'None',
  noLimit: 'No limit',
  filmRange: '{min}–{max}',
  filmFrom: '{min} or more',
  none: 'No quality sizes yet.',
})
