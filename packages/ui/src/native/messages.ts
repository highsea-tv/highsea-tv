// SPDX-License-Identifier: AGPL-3.0-only
// The words the native renderer's parts say themselves (ADR 0021): a control's name where it has
// no words of its own to show, and what a part is read as. Everything else a part says, the app
// passes in.
import { defineMessages } from '@highsea-tv/i18n'

export const uiMessages = defineMessages({
  /** Banner's button that puts an announcement away. */
  dismiss: 'Dismiss',
  /** A sheet's or a dialog's close button. */
  close: 'Close',
  /** Rating, read out. */
  rated: 'Rated {value} out of {max}',
})
