// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Backups (ADR 0021, checkpoint 8b): the prototype's schedule, with the weekday a weekly
// backup needs and the note that the secret key isn't in a backup (the owner's answer 13).
import { defineMessages } from '@highsea/i18n'

export const backups = defineMessages({
  what: 'the backup settings',
  'schedule.title': 'Schedule',
  'schedule.description':
    'Settings and the database: not your media, which lives on its own disks.',
  schedule: 'Back up',
  'schedule.daily': 'Every day',
  'schedule.weekly': 'Every week',
  'schedule.off': 'Never',
  weekday: 'On',
  time: 'At',
  timeHint: 'In the server’s time zone, {zone}.',
  keep: 'Keep the last',
  keepHint: 'Scheduled backups. Others stay until you delete them.',
  keepInvalid: 'A whole number from 1 to 365.',
  timeInvalid: 'A time such as 03:30.',
  offWarning: 'Without backups, a failed disk takes your settings, history and people with it.',
  folder: 'Folder',
  folderHint: 'Inside the config folder by default. Point it at another disk if you can.',
  folderInvalid: 'A full path, such as /backups.',
  'secret.title': 'The secret key',
  'secret.body':
    'Backups never hold the server’s secret key, secret.key in the config folder, which seals passwords and tokens. To restore on another machine, copy that file there by hand first, or sign-ins and connections stop working.',
  elsewhereBefore: 'Make a backup now, or restore one, in',
  elsewhereLink: 'System › Backups',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
})
