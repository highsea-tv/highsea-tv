// SPDX-License-Identifier: AGPL-3.0-only
// The providers Settings › VPN offers. Since 6b they're catalog data, the `vpn-providers` kind in
// `@highsea-tv/schemas/vpn`'s format (docs/plans/phase-3-checkpoint-6.md › Providers): the runtime
// reads them from `@highsea-tv/catalog` and hands them to `createVpn`. Here they're turned into the
// API's shape, which the approved prototype drew: PIA's API reads as connecting with an account.
import type { VpnProviderDefinition } from '@highsea-tv/schemas/vpn'
import type { VpnProvider } from './types.ts'

export type { VpnProviderDefinition }

export function toApiProvider(d: VpnProviderDefinition): VpnProvider {
  return {
    id: d.id,
    name: d.name,
    connect: d.connect === 'pia' ? 'account' : 'config',
    steps: d.steps,
    portForwarding: d.portForwarding.method,
    ipv6: d.ipv6,
    ...(d.regions ? { regions: d.regions } : {}),
  }
}

/** A provider by id from a list. */
export const findProvider = (list: readonly VpnProviderDefinition[], id: string) =>
  list.find((p) => p.id === id)
