// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's version in the prototype, and the update it has waiting (`?update=ready`):
// the web shell's account menu offers Restart to update (desktop-app.md › An update waiting).
import { toast } from '@highsea-tv/ui'

export const APP_VERSION = '1.0.0'
/** The desktop app's update the prototype has waiting (`?update=ready`). */
export const NEXT_APP_VERSION = '1.0.1'

export const restartToUpdate = () => toast({ title: `Restarting into highsea ${NEXT_APP_VERSION}` })
