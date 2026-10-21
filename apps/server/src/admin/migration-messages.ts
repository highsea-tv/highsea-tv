// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Migration's copy (ADR 0021; brief § 6): the one-time importers from Radarr and
// qBittorrent (ADR 0041).
import { defineMessages } from '@highsea/i18n'

export const migration = defineMessages({
  intro:
    'Nothing is changed in either program. Import Radarr first, so torrents it grabbed find their movies.',
  url: 'Address',
  urlHint: 'As highsea reaches it, with the port.',
  apiKey: 'API key',
  apiKeyHint: 'In Radarr, Settings › General › Security.',
  username: 'Username',
  password: 'Password',
  passwordHint: 'Leave both empty if qBittorrent lets this address in without signing in.',
  'mappings.title': 'Path mappings',
  'mappings.description':
    'When the other program sees your folders under different paths, say where each one is for highsea.',
  'mappings.from': 'Their path',
  'mappings.to': 'highsea’s path',
  'mappings.add': 'Add a mapping',
  'mappings.remove': 'Remove this mapping',
  'mappings.empty': 'No mappings: the paths are the same for both.',
  test: 'Test',
  preview: 'Preview',
  import: 'Import',
  importAgain: 'Import again',
  'fail.test': 'Couldn’t connect',
  'fail.preview': 'Couldn’t read what would come across',
  'fail.run': 'Couldn’t start the import',
  'fail.resume': 'Couldn’t resume the torrents',
  'progress.label': 'Import progress',
  'progress.running': 'Importing. You can leave this page; it carries on.',
  'progress.of': '{done} of {total}',
  'progress.done':
    'Imported {imported, plural, one {# item} other {# items}}, skipped {skipped} already here.',
  'progress.failed': 'The import stopped. Run it again to carry on where it left off.',
  'progress.failures':
    '{count, plural, one {# couldn’t come across} other {# couldn’t come across}}',

  'radarr.title': 'Radarr',
  'radarr.description':
    'Movies, where they are on disk, quality profiles, tags, naming, and the blocklist. Files stay where they are.',
  'radarr.connected':
    'Connected to Radarr {version}, with {movies, plural, one {# movie} other {# movies}}.',
  'radarr.counts':
    '{total, plural, one {# movie} other {# movies}}, {withFiles} with files. {inLibrary} already in highsea, {ready} ready to come across.',
  'radarr.roots': 'Root folders',
  'radarr.root.root-folder': 'Root folder',
  'radarr.root.add': 'Added',
  'radarr.root.outside': 'Can’t use',
  'radarr.root.movies': '{count, plural, one {# movie} other {# movies}}',
  'radarr.profiles': 'Quality profiles',
  'radarr.profiles.description':
    'Each of Radarr’s profiles becomes the nearest of yours by its cutoff. Change any of them here.',
  'radarr.profile.radarr': 'Radarr’s profile',
  'radarr.profile.cutoff': 'Cutoff',
  'radarr.profile.movies': 'Movies',
  'radarr.profile.highsea': 'In highsea',
  'radarr.profile.label': 'highsea’s profile for {name}',
  'radarr.settings': 'Bring the naming format and file settings across',
  'radarr.settings.hint':
    'Radarr’s folder and file formats, colon replacement, hardlinks and permissions.',
  'radarr.naming.problem': 'Radarr’s naming format stays behind: {problem}',
  'radarr.tags':
    '{tags, plural, one {# tag} other {# tags}} and {blocklist, plural, one {# blocklisted release} other {# blocklisted releases}} come across too.',
  'radarr.kept.title': 'What can’t come across',
  'radarr.kept.body':
    'Radarr’s API never hands out the passwords and keys of its indexers and download clients, so add them again in highsea.',
  'radarr.kept.indexers': 'Indexers: {names}',
  'radarr.kept.clients': 'Download clients: {names}. highsea downloads by itself.',
  'radarr.kept.link': 'Go to Indexers',
  'radarr.problems': 'Movies that can’t come across as things stand',
  'radarr.started': 'The Radarr import has started',

  'qbt.title': 'qBittorrent',
  'qbt.description':
    'Torrents with their categories, limits and totals. Each comes across paused, where its data already is, and is checked once.',
  'qbt.connected':
    'Connected to qBittorrent {version} (Web API {webApi}), with {torrents, plural, one {# torrent} other {# torrents}}.',
  'qbt.counts':
    '{total, plural, one {# torrent} other {# torrents}}: {ready} ready to come across, {inDownloads} already in highsea, {outside} outside the folders highsea may use. {linked} linked to movies Radarr grabbed.',
  'qbt.savePaths': 'Save paths',
  'qbt.path.ok': 'Usable',
  'qbt.path.outside': 'Can’t use',
  'qbt.path.torrents': '{count, plural, one {# torrent} other {# torrents}}',
  'qbt.categories': 'Categories',
  'qbt.category.default': 'In the downloads folder',
  'qbt.started': 'The qBittorrent import has started',
  'qbt.paused':
    '{paused, plural, one {# torrent waits} other {# torrents wait}} paused. Stop qBittorrent, then resume them here, so the two never seed the same files at once.',
  'qbt.checking':
    '{checking, plural, one {# torrent is} other {# torrents are}} having its data checked.',
  'qbt.resume': 'Resume torrents',
  'qbt.resume.title': 'Is qBittorrent stopped?',
  'qbt.resume.body':
    'Resume only once qBittorrent has stopped. Two clients writing to the same files can damage them.',
  'qbt.resume.confirm': 'qBittorrent is stopped, resume',
  'qbt.resumed': 'The torrents are running in highsea',
})
