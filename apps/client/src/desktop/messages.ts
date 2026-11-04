// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's own words (desktop-app.md, client-settings.md › Offline; ADR 0021): the
// window's chrome, Back and Forward, the update waiting, and Kept in. From the prototype's
// web/window.tsx, web/shell.tsx and web/kept-in.tsx, and apps/web's desktopWindow and updates.
import { defineMessages } from '@highsea-tv/i18n'

export const desktopWindowMessages = defineMessages({
  minimise: 'Minimise',
  maximise: 'Maximise',
  close: 'Close',
  back: 'Back',
  forward: 'Forward',
})

export const updateMessages = defineMessages({
  restart: 'Restart to update',
  menuDetail: 'highsea {version} is ready. You have {current}.',
  ready: 'highsea {version} is ready. It’s used the next time the app starts.',
  upToDate: 'Up to date. highsea checks for a new version by itself, last {when}.',
  notChecked: 'highsea checks for a new version by itself.',
  restarting: 'Restarting into highsea {version}',
  restartFailed: 'Couldn’t install the update. Try again later.',
  profileUpdate: 'An update is ready.',
})

export const keptInMessages = defineMessages({
  label: 'Kept in',
  hint: 'New downloads go here. Changing it moves what’s already downloaded.',
  change: 'Change',
  moving: 'Moving downloads',
  movingBody:
    'Moving {count, plural, one {# movie} other {# movies}} to {to} · {done} of {total}. They play from where they are until they’ve moved.',
  moved: 'Downloads moved',
  newHere: 'New downloads go here',
  askTitle: 'Move your downloads?',
  askBody:
    'Your {count, plural, one {# downloaded movie} other {# downloaded movies}} ({total}) move to {to}. Make sure it has room. They keep playing while they move.',
  cancel: 'Cancel',
  move: 'Move downloads',
  failed: 'Couldn’t move your downloads. They’re still in {from}.',
})
