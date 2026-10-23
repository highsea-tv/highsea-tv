// SPDX-License-Identifier: AGPL-3.0-only
// The emails' own words (docs/product/emails.md, ADR 0021): the server's mail (an invite, a
// password reset written for a link the owner makes on A13) and the frame around a notification,
// whose title and body come from the shared catalog (`notificationMessages`).
import { defineMessages } from '@highsea-tv/i18n'

export const emailMessages = defineMessages({
  'invite.subject': 'You’re invited to {server}',
  'invite.greeting': 'Hello {name},',
  'invite.body': '{inviter} invited you to {server}. Choose a password to finish your account:',
  'invite.preheader': '{inviter} invited you. Choose a password to finish your account.',
  'invite.button': 'Choose a password',
  'reset.subject': 'Reset your password on {server}',
  'reset.greeting': 'Hello {name},',
  'reset.body':
    'Choose a new password for {server} with this link. Your apps and TVs stay signed in.',
  'reset.preheader': 'Choose a new password. Your apps and TVs stay signed in.',
  'reset.button': 'Choose a new password',
  paste: 'Or paste this into your browser:',
  expires: 'The link works once, until {date}.',
  ignore: 'If you weren’t expecting this, you can ignore it.',
  open: 'Open in {server}',
  because: 'You get this because {connection} hears {event}.',
  becauseTest: 'You get this because someone pressed Test on {connection}.',
  thisConnection: 'this connection',
  change: 'Change it in Settings › Connections.',
  sentBy: 'Sent by {server} with highsea.',
  sentByHighsea: 'Sent by highsea.',
  'detail.quality': 'Quality',
  'detail.size': 'Size',
  'detail.release': 'Release',
  'detail.indexer': 'Indexer',
  'detail.replaced': 'Replaced',
  'detail.version': 'Version',
  'event.grabbed': 'Grabbed',
  'event.imported': 'Imported',
  'event.upgraded': 'Upgraded',
  'event.download-failed': 'Download failed',
  'event.subtitle-added': 'Subtitle added',
  'event.health': 'Health',
  'event.update': 'Update',
  'event.movie-added': 'Movie added',
  'event.test': 'Test',
})
