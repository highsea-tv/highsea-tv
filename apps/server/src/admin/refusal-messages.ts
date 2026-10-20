// SPDX-License-Identifier: AGPL-3.0-only
// What a user sees at any admin address (ADR 0032, decision 9).
import { defineMessages } from '@highsea/i18n'

export const refusal = defineMessages({
  title: 'This is where the server’s owner and admins run it',
  body: 'To watch, use a highsea app.',
  signOut: 'Sign out',
  signOutFailed: 'Couldn’t sign out. Try again.',
})
