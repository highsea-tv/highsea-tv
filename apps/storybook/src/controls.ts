// SPDX-License-Identifier: AGPL-3.0-only
import { icons } from '@highsea/ui-web'

/** A select control over every icon name. */
export const iconControl = {
  control: 'select',
  options: [undefined, ...Object.keys(icons)],
} as const
