// SPDX-License-Identifier: AGPL-3.0-only
// Storybook's own chrome in highsea's colors, so the workbench reads like the product.
import { addons } from 'storybook/manager-api'
import { theme } from './theme.ts'

addons.setConfig({ theme, sidebar: { showRoots: true } })
