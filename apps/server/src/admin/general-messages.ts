// SPDX-License-Identifier: AGPL-3.0-only
// Settings › General (ADR 0021): the Metadata group (checkpoint 4, decision 1) and the Catalog
// group (checkpoint 5, answer 7). The prototype shows neither, so their copy follows the plans
// (TMDB › The key; checkpoint 5 › The catalog service) and the brand brief. Region, Updates and
// Diagnostics (checkpoint 8b) take the prototype's copy, with the Docker note for updates and
// /metrics in Diagnostics.
import { defineMessages } from '@highsea/i18n'

export const general = defineMessages({
  what: 'these settings',
  'metadata.title': 'Metadata',
  'metadata.description': 'Where movie details come from, and the language and region they’re in.',
  'key.label': 'TMDB key',
  'key.set': 'Set',
  'key.notSet': 'Not set',
  'key.masked': 'Ending in {last4}',
  'key.notSetBody': 'Discover, adding movies and refreshing their details need a key.',
  'key.replace': 'Replace',
  'key.remove': 'Remove',
  'key.cancel': 'Keep the current key',
  'key.new': 'New TMDB key',
  'key.hint':
    'The API key or the API Read Access Token: either works. It’s checked with TMDB when you save.',
  'key.open': 'Open TMDB’s API page',
  'key.rejected': 'TMDB didn’t accept that key. Copy it again from your TMDB account.',
  'key.unavailable':
    'Can’t reach TMDB right now, so the key wasn’t checked or saved. Check the server’s internet connection and try again.',
  'key.removeTitle': 'Remove the TMDB key?',
  'key.removeBody':
    'Discover, adding movies and refreshing their details stop until you add a key. The library and its pages keep working.',
  'key.removeConfirm': 'Remove key',
  'key.keep': 'Keep it',
  'key.removed': 'TMDB key removed',
  'key.removeFailed': 'Couldn’t remove the key',
  language: 'Metadata language',
  languageHint: 'Titles, overviews and taglines, where TMDB has them in this language.',
  region: 'Region',
  regionHint: 'For certifications, release dates and Discover’s lists.',
  ownerOnly: 'Only the owner can change these settings.',
  'catalog.title': 'Indexer catalog',
  'catalog.description':
    'Where indexer definitions come from, and how new versions of them arrive.',
  'catalog.what': 'the catalog’s settings',
  'catalog.ownerOnly':
    'Only the owner can see and change the catalog’s channel, updates and extra catalogs.',
  'catalog.channel': 'Channel',
  'catalog.channelHint': 'Beta gets new and changed definitions first.',
  'catalog.stable': 'Stable',
  'catalog.beta': 'Beta',
  'catalog.auto': 'Install new versions automatically',
  'catalog.autoHint':
    'Each version is verified before it’s used. Off, a new version waits on Indexers for you to install it.',
  'catalog.extras': 'Extra catalogs',
  'catalog.noExtras': 'None. Add one to use definitions someone else publishes and signs.',
  'catalog.keyId': 'Key {keyId}',
  'catalog.remove': 'Remove',
  'catalog.removeLabel': 'Remove {url}',
  'catalog.removeTitle': 'Remove this catalog?',
  'catalog.removeBody':
    'Its definitions go with it, and indexers that use them stop working until you add it again.',
  'catalog.removeConfirm': 'Remove catalog',
  'catalog.keep': 'Keep it',
  'catalog.add': 'Add a catalog',
  'catalog.url': 'Manifest address',
  'catalog.urlHint': 'An https address that publishes a signed catalog manifest.',
  'catalog.keyIdLabel': 'Key ID',
  'catalog.publicKey': 'Public key',
  'catalog.publicKeyHint': 'The publisher’s ed25519 public key, in base64, as they publish it.',
  'catalog.extraMissing': 'Fill in the address, the key ID and the public key.',
  'catalog.addButton': 'Add catalog',
  'catalog.added': 'Catalog added',
  'region.title': 'Region',
  'region.description': 'The server’s own language and time.',
  'region.language': 'Language',
  'region.languageHint':
    'For the server’s messages: notifications and the calendar feed. More come with translations.',
  'region.timeZone': 'Time zone',
  'region.timeZoneHint': 'For schedules, such as when backups run.',
  'updates.title': 'Updates',
  'updates.description': 'highsea tells you when a new version is out. It never updates itself.',
  'updates.channel': 'Update channel',
  'updates.channelIs': '{channel} channel',
  'updates.channelHint': 'Beta gets new versions first. Stable versions show on both.',
  'updates.stable': 'Stable',
  'updates.beta': 'Beta',
  'updates.docker':
    'To update, pull the new image and recreate the container. highsea backs up before it migrates.',
  'diagnostics.title': 'Diagnostics',
  'diagnostics.description': 'What the server writes down when something goes wrong.',
  'diagnostics.logLevel': 'Log level',
  'diagnostics.logLevelHint':
    'Debug is chatty: use it while chasing a problem. It changes at once, without a restart.',
  'diagnostics.level.debug': 'Debug',
  'diagnostics.level.info': 'Info (default)',
  'diagnostics.level.warn': 'Warnings and errors',
  'diagnostics.level.error': 'Errors',
  'diagnostics.crashes': 'Write crash reports',
  'diagnostics.crashesHint':
    'To the config folder, to attach to an issue. Nothing is sent anywhere. Find them in System, under Logs.',
  'diagnostics.metrics': 'Metrics for Prometheus',
  'diagnostics.metricsHint':
    'Requests, downloads, indexers and the server’s resources, at /metrics.',
  'diagnostics.metricsKey':
    'Prometheus signs in with an API key held by the owner or an admin, as a bearer token. A read-only key is enough.',
  'diagnostics.keys': 'API keys are in Users and devices.',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
})
