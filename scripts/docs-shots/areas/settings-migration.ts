// SPDX-License-Identifier: AGPL-3.0-only
// The migration guide's screenshot (apps/docs/content/migrate-from-radarr-and-qbittorrent.mdx):
// the Radarr card's preview, read from the importers' fake Radarr on loopback, with Radarr's /movies
// mapped to the seed's movies folder.
import { join } from 'node:path'
import { FAKE_RADARR_KEY, type FakeRadarr, startFakeRadarr } from '@highsea-tv/importers/fake'
import type { Area } from '../shot.ts'

let radarr: FakeRadarr | undefined

export default {
  prepare: async () => {
    radarr = await startFakeRadarr()
  },
  finish: async () => {
    await radarr?.close()
  },
  shots: [
    {
      name: 'radarr-preview',
      path: '/settings/migration',
      height: 1600,
      act: async (p, c) => {
        const card = p.getByRole('region', { name: 'Radarr' })
        await card.getByLabel('Address').fill(radarr?.url ?? '')
        await card.getByLabel('API key').fill(FAKE_RADARR_KEY)
        await card.getByRole('button', { name: 'Add a mapping' }).click()
        await card.getByLabel('Their path').fill('/movies')
        await card.getByLabel('highsea’s path').fill(join(c.server.dataDir, 'movies'))
        await card.getByRole('button', { name: 'Preview' }).click()
        await card.getByRole('region', { name: 'Root folders' }).waitFor()
        // the address as a reader's Radarr container would have it, not the fake's loopback port
        await card.getByLabel('Address').evaluate((input) => {
          ;(input as HTMLInputElement).value = 'http://radarr:7878'
        })
      },
      crop: (p) => p.getByRole('region', { name: 'Radarr' }),
    },
  ],
} satisfies Area
