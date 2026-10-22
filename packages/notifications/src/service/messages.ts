// SPDX-License-Identifier: AGPL-3.0-only
// What the service says about its own state (ADR 0021): System › Health's issues and the log's errors.
import { createT, defineMessages, type T } from '@highsea/i18n'

export const notificationServiceMessages = defineMessages({
  'issue.failed': 'Messages to {name} aren’t arriving: {error}',
  'issue.dropped': 'A message to {name} was dropped after a day of trying: {error}',
  connectionOff: 'The connection was turned off before it was sent.',
  unknownError: 'no reason was given',
  mailFailed: 'The email couldn’t be sent: {error}',
})

export const serviceMessages = (locale = 'en'): T<typeof notificationServiceMessages> =>
  createT(notificationServiceMessages, locale)
