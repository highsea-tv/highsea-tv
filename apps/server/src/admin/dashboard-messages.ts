// SPDX-License-Identifier: AGPL-3.0-only
// A3 Dashboard's strings (dashboard.md › Copy). Widget titles and descriptions are the registry's
// (@highsea/personalization `widgetMessages`).
import { defineMessages } from '@highsea/i18n'

export const dashboard = defineMessages({
  customize: 'Customize',
  addWidget: 'Add widget',
  moreOptions: 'More layout options',
  resetToDefault: 'Reset to default',
  defaultLayout: 'Default layout',
  makeDefaultAdmins: 'Make this the default for admins',
  cancel: 'Cancel',
  done: 'Done',
  editing:
    'Drag a widget by its handle to move it, or by its corner to make it wider or taller. Nothing is saved until you press Done.',
  loadError: 'Couldn’t load your dashboard',
  retry: 'Try again',
  emptyTitle: 'Your dashboard is empty',
  emptyBody: 'Add the widgets you want to see first.',
  sheetTitle: 'Add a widget',
  sheetDescription: 'Widgets go at the end of the grid. Move them once they’re in.',
  added: '{widget} added at the end',
  addedBody: 'Move it where you want it.',
  remove: 'Remove {widget}',
  resetError: 'Couldn’t load the default layout',
  saveError: 'Couldn’t save the dashboard',
  saved: 'Dashboard saved',
  defaultError: 'Couldn’t set the default',
  'defaultSaved.admin': 'New admins start from this layout',
  'defaultDropped.admin':
    '{count, plural, one {{widgets} is left out: admins can’t see it.} other {{widgets} are left out: admins can’t see them.}}',
  defaultReaches: 'People who haven’t customized their dashboard see it now.',

  // the editor's announcements (ui-web WidgetEditor)
  'editor.move': 'Move {name}',
  'editor.help':
    'Press Space to pick up. Then the arrow keys move it, Shift and an arrow key resize it, Space drops it, and Escape cancels.',
  'editor.pickedUp':
    '{name} picked up, position {index} of {count}, {span, plural, one {# column} other {# columns}} wide and {rows, plural, one {# row} other {# rows}} tall. Arrow keys move it. Shift and an arrow key resize it. Space drops it, Escape cancels.',
  'editor.dragged': '{name} picked up, position {index} of {count}.',
  'editor.dropped': '{name} dropped at position {index} of {count}.',
  'editor.moved': '{name} moved to position {index} of {count}.',
  'editor.cancelled': 'Move cancelled. {name} is back where it was.',
  'editor.limit':
    '{edge, select, first {{name} is already first.} last {{name} is already last.} wide {{name} is already as wide as it goes.} narrow {{name} is already as narrow as it goes.} tall {{name} is already as tall as it goes.} other {{name} is already as short as it goes.}}',
  'editor.resized':
    '{name} is now {span, plural, one {# column} other {# columns}} wide and {rows, plural, one {# row} other {# rows}} tall.',
  'editor.settled':
    '{name} resized to {span, plural, one {# column} other {# columns}} wide and {rows, plural, one {# row} other {# rows}} tall.',
  'editor.resizeCancelled': 'Resize cancelled.',
})

/** What the widgets say (dashboard.md › Copy, and the prototype's widgets). */
export const widgets = defineMessages({
  error: 'Couldn’t load {widget}',
  retry: 'Try again',
  more: '{count} more in {page}',

  'network.meta': 'last {minutes} min',
  'network.down': '{unit} ↓',
  'network.up': '{unit} ↑',
  'network.none': 'No downloads yet',
  'network.seeding': 'seeding',
  'network.downloads': '{count, plural, one {# download} other {# downloads}}',
  'network.idle': 'Nothing downloading',
  'network.vpnDown': 'Stopped while the VPN is down',

  'storage.free': '{unit} free of {total}',
  'storage.used': 'Used',
  'storage.none': 'No disks reported',
  'storage.bar': '{percent} used',
  'storage.movies': '{count, plural, =0 {no movies} one {# movie} other {# movies}}',

  'indexers.none': 'No indexers yet',
  'indexers.noneBody': 'Searches need at least one. The catalog adds public ones in a click.',
  'indexers.add': 'Add indexers',
  'indexers.meta': '{healthy} of {count} healthy',
  'indexers.healthy': 'Healthy',
  'indexers.backoff': 'Backing off',
  'indexers.failing': 'Failing',
  'indexers.disabled': 'Disabled',
  'indexers.grabs': '{count, plural, one {# grab} other {# grabs}}',
  'indexers.retry': 'retry in {in}',
  'indexers.ms': '{ms} ms',
  'indexers.noQueries': 'no queries yet',

  'subtitles.meta': 'today',
  'subtitles.none': 'No subtitles yet',
  'subtitles.noneBody': 'highsea finds and syncs them as movies arrive.',
  'subtitles.synced': 'synced',
  'subtitles.waiting': '{count} waiting',
  'subtitles.progress': 'Subtitles synced today',
  'subtitles.average': 'Average offset corrected {offset} s · confidence {confidence}',

  'upcoming.meta': 'next {days} days',
  'upcoming.none': 'Nothing due in the next {days} days',
  'upcoming.noneBody': 'Monitored movies show here before they release.',

  'announcement.none': 'No announcement is live',
  'announcement.write': 'Write one',
  'announcement.live': 'Live',
  'announcement.everyone': 'Everyone',
  'announcement.some': 'Some people',
  'announcement.until': 'until {when}',

  'activity.none': 'The queue is empty',
  'activity.noneBody': 'Movies you add show here while they download and import.',
  'activity.meta': '{count, plural, one {# item} other {# items}} · {rate}',
  'activity.filter': 'Filter the queue',
  'activity.all': 'All',
  'activity.downloading': 'Downloading',
  'activity.seeding': 'Seeding',
  'activity.issues': 'Issues',
  'activity.nothing': 'Nothing here right now.',
  'activity.title': 'Title',
  'activity.size': 'Size',
  'activity.progress': 'Progress',
  'activity.down': '↓',
  'activity.up': '↑',
  'activity.eta': 'ETA',
  'activity.status': 'Status',
  'activity.queued': 'queued',
  'activity.left': '{duration} left',
  'activity.progressOf': '{title} progress',
  'activity.unknown': '—',

  'recent.none': 'Nothing added yet',
  'recent.noneBody': 'New movies show here once they’re imported.',
  'recent.addedBody': 'Movies you add show here.',

  'calendar.caption': 'Releases in {month}',
  'calendar.none': 'No releases this month.',
  // weekday names as the prototype shows them, Monday first
  'calendar.mo': 'Mo',
  'calendar.tu': 'Tu',
  'calendar.we': 'We',
  'calendar.th': 'Th',
  'calendar.fr': 'Fr',
  'calendar.sa': 'Sa',
  'calendar.su': 'Su',

  'health.meta': '{count} to check',
  'health.none': 'Everything looks healthy',
  'health.ok': 'OK',
  'health.notice': 'Notice',
  'health.warning': 'Warning',
  'health.error': 'Error',

  'page.indexers': 'Indexers',
  'page.system': 'System',
  'page.movies': 'Movies',
  'page.activity': 'Activity',
})
