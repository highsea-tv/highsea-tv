// SPDX-License-Identifier: AGPL-3.0-only
// The VPN guide's screenshots (apps/docs/content/settings/vpn/). The seeded server has no VPN and no
// network, so each mode is shown as its form before saving; nothing here connects.
import type { Page } from 'playwright-core'
import type { Area } from '../shot.ts'

const mode = (name: RegExp) => (p: Page) => p.getByRole('radio', { name }).click()
const provider = (name: string) => async (p: Page) => {
  await mode(/highsea connects/)(p)
  await p.getByRole('combobox', { name: 'Provider' }).click()
  await p.getByRole('option', { name, exact: true }).click()
}
// tall enough that the save bar sits below the form rather than over it
const connection = (p: Page) => p.getByRole('region', { name: 'Connection' })

export default {
  shots: [
    { name: 'overview', path: '/settings/vpn' },
    {
      name: 'connects',
      path: '/settings/vpn',
      act: mode(/highsea connects/),
      crop: connection,
      height: 1400,
    },
    {
      name: 'connects-pia',
      path: '/settings/vpn',
      act: provider('Private Internet Access'),
      crop: connection,
      height: 1400,
    },
    {
      name: 'forwarded-port',
      path: '/settings/vpn',
      act: provider('AirVPN'),
      crop: connection,
      height: 1400,
    },
    {
      name: 'container',
      path: '/settings/vpn',
      act: async (p) => {
        await mode(/A VPN container/)(p)
        await p.getByText('Compose for your provider').click()
        await p.getByText('VPN_SERVICE_PROVIDER').first().waitFor()
      },
      crop: connection,
      height: 1400,
    },
    {
      name: 'interface',
      path: '/settings/vpn',
      act: mode(/An interface on this machine/),
      crop: connection,
      height: 1400,
    },
    {
      name: 'behaviour',
      path: '/settings/vpn',
      act: mode(/highsea connects/),
      crop: (p) => p.getByRole('region', { name: 'Behaviour' }),
      height: 1400,
    },
  ],
} satisfies Area
