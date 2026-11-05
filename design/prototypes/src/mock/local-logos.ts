// SPDX-License-Identifier: AGPL-3.0-only
// The featured films' downloaded logos (seed.ts says why they're gitignored), found with Vite's
// glob. Only the prototype's own client imports this; the tests under Bun and the transport under
// Metro go without, so each title keeps its placeholder wordmark there. Only Vite sets the mode.
import { addLocalLogos } from '@highsea-tv/mock/seed'

addLocalLogos(
  import.meta.env.MODE
    ? import.meta.glob<string>('../local-logos/*.png', {
        eager: true,
        query: '?url',
        import: 'default',
      })
    : {},
)
