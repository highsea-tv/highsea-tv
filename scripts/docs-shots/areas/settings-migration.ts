// SPDX-License-Identifier: AGPL-3.0-only
// The migration guide's screenshots (apps/docs/content/migrate-from-radarr-and-qbittorrent.mdx):
// the Radarr and Sonarr cards' previews, read from the importers' fakes on loopback, with Radarr's
// /movies mapped to the seed's movies folder and Sonarr's /tv to its Shows folder.
import { join } from 'node:path'
import {
  FAKE_RADARR_KEY,
  FAKE_SONARR_KEY,
  type FakeRadarr,
  type FakeSonarr,
  startFakeRadarr,
  startFakeSonarr,
} from '@highsea-tv/importers/fake'
import type { Area } from '../shot.ts'

let radarr: FakeRadarr | undefined
let sonarr: FakeSonarr | undefined

export default {
  prepare: async () => {
    radarr = await startFakeRadarr()
    sonarr = await startFakeSonarr()
  },
  finish: async () => {
    await radarr?.close()
    await sonarr?.close()
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
    {
      name: 'sonarr-preview',
      path: '/settings/migration',
      height: 1800,
      act: async (p, c) => {
        const card = p.getByRole('region', { name: 'Sonarr' })
        await card.getByLabel('Address').fill(sonarr?.url ?? '')
        await card.getByLabel('API key').fill(FAKE_SONARR_KEY)
        await card.getByRole('button', { name: 'Add a mapping' }).click()
        await card.getByLabel('Their path').fill('/tv')
        await card.getByLabel('highsea’s path').fill(join(c.server.dataDir, 'tv'))
        await card.getByRole('button', { name: 'Preview' }).click()
        await card.getByRole('region', { name: 'Root folders' }).waitFor()
        await card.getByLabel('Address').evaluate((input) => {
          ;(input as HTMLInputElement).value = 'http://sonarr:8989'
        })
      },
      crop: (p) => p.getByRole('region', { name: 'Sonarr' }),
    },
  ],
} satisfies Area
