// SPDX-License-Identifier: AGPL-3.0-only
// The profiles' words in the client beyond @highsea-tv/client/profiles' shared ones (ADR 0021):
// the TV's opening, Add a profile, Settings' PIN and Profiles, and the line under a profile that
// isn't the account's own. They're the prototypes' (tv/who.tsx, tv/settings.tsx at 2f51779^,
// mobile/more.tsx, client-settings.md › Switch profile).
import { defineMessages } from '@highsea-tv/i18n'

export const whoMessages = defineMessages({
  lastHere: 'Last here',
  forgot: 'Forgot it? Turn it off from {name}’s profile, in Settings › Profiles.',
  theAccount: 'the account',
  digits: '{count} of 4 digits',
  delete: 'Delete',
  // the line under a profile that isn't the account's own (client-settings.md › Switch profile)
  subProfile: 'A profile on @{username}’s account',
  // Add a profile on the TV
  addTitle: 'Add a profile',
  addHint: 'It keeps its own watch history and Home, on every device signed in to this account.',
  name: 'Name',
  shift: 'Shift',
  capsLock: 'Caps lock',
  space: 'Space',
  colour: 'Colour',
  'tone.accent': 'Accent',
  'tone.info': 'Blue',
  'tone.success': 'Green',
  'tone.warning': 'Amber',
  'tone.danger': 'Red',
  taken: 'The account already has a profile called {name}.',
  add: 'Add profile',
  cancel: 'Cancel',
})

/** The TV's Settings › PIN and Settings › Profiles (the prototype's tv/settings.tsx). */
export const profileSettingsMessages = defineMessages({
  pin: 'PIN',
  pinHint: 'Asked for before anyone watches as this profile.',
  people: 'Profiles',
  peopleHint: 'Each with its own watch history, on every device.',
  whoIsWatching: 'Who’s watching',
  pinOn: 'On. Every device asks for it before watching as {name}.',
  pinOff: 'Off. Anyone using this account can watch as {name}.',
  setPin: 'Set a PIN',
  changePin: 'Change PIN',
  pinTurnOff: 'Turn off PIN',
  choose: 'Choose a PIN',
  chooseAgain: 'Choose a PIN again',
  chooseHint: 'Four digits. Every device asks for it before watching as {name}.',
  noMatch: 'Those didn’t match.',
  again: 'Enter it again',
  own: ' · the account’s own',
  watching: ' · watching now',
  hasPin: ' · PIN',
  deleteOne: 'Delete {name}’s profile',
  deleteTitle: 'Delete {name}’s profile?',
  deleteBody: 'Its watch history and Home go with it, on every device.',
  deleteAction: 'Delete profile',
  ask: 'Ask who’s watching when highsea opens: {state}',
  on: 'On',
  off: 'Off',
  askOn: 'Only this TV. With one profile, it opens straight in.',
  askOff: 'Only this TV. It opens as whoever watched last, asking for their PIN if they have one.',
  full: 'An account has up to {max} profiles.',
})
