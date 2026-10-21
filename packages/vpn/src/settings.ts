// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN, stored in the `vpn` settings row. The WireGuard configuration, PIA's password and
// gluetun's API key are sealed with the server's key (`Sealer`, as the indexers' credentials are)
// and never leave the server: the API sees `configName`, `piaPasswordSet` and `containerKeySet`.
// An absent or empty secret in a save keeps the stored one, as the prototype's form expects.
import { AppError, type Sealer } from '@highsea/core'
import { type Db, readSetting, writeSetting } from '@highsea/db'
import { failures } from './copy.ts'
import { DEFAULT_ECHO_URL } from './echo.ts'
import { providerById } from './providers.ts'
import type { VpnMode, VpnSettings, VpnSettingsInput } from './types.ts'
import { parseWireGuard, WireGuardError } from './wireguard.ts'

export const VPN_SETTINGS_KEY = 'vpn'

/** The row as stored: the public fields, with sealed secrets in place of the `…Set` flags. */
export type StoredVpnSettings = Omit<VpnSettings, 'piaPasswordSet' | 'containerKeySet'> & {
  configSealed: string | null
  piaPasswordSealed: string | null
  containerKeySealed: string | null
}

/** The prototype's `defaultVpnSettings('empty')`: off until the owner picks a mode. */
export const DEFAULT_VPN_SETTINGS: StoredVpnSettings = {
  mode: 'off',
  provider: 'proton',
  configName: null,
  configSealed: null,
  piaUsername: '',
  piaPasswordSealed: null,
  piaRegion: 'Netherlands',
  staticPort: null,
  containerUrl: 'http://127.0.0.1:8000',
  containerKeySealed: null,
  interface: 'wg0',
  useForwardedPort: true,
  indexersThroughVpn: false,
  echoUrl: DEFAULT_ECHO_URL,
}

const MODES: VpnMode[] = ['builtin', 'container', 'interface', 'off']

/** The prototype's test for a control server's address. */
export const CONTAINER_URL = /^https?:\/\/[^\s/]+/

/** Linux interface names: under IFNAMSIZ (16) bytes, no slashes or spaces. */
const INTERFACE_NAME = /^[A-Za-z0-9_.:@-]{1,15}$/

const invalid = (message: string, field: string) => new AppError('invalid', message, { field })

export function readStored(db: Db): StoredVpnSettings {
  return readSetting(db, VPN_SETTINGS_KEY, DEFAULT_VPN_SETTINGS)
}

export function toPublic(s: StoredVpnSettings): VpnSettings {
  const { configSealed: _c, piaPasswordSealed, containerKeySealed, ...rest } = s
  return {
    ...rest,
    piaPasswordSet: piaPasswordSealed !== null,
    containerKeySet: containerKeySealed !== null,
  }
}

/** The secrets, opened for the code that connects. */
export function openSecrets(s: StoredVpnSettings, sealer: Sealer) {
  const open = (v: string | null) => (v === null ? null : sealer.open(v))
  return {
    config: open(s.configSealed),
    piaPassword: open(s.piaPasswordSealed),
    containerKey: open(s.containerKeySealed),
  }
}

const filled = (v: string | undefined): v is string => v !== undefined && v !== ''

/**
 * Merges a save over what's stored and checks it, with the prototype's `connectionFailure` copy
 * for each refusal. Returns the row to write; nothing is written here. A live refusal (gluetun's
 * key, PIA's password) is the caller's to check, against the merged settings.
 */
export function mergeSettings(
  current: StoredVpnSettings,
  input: VpnSettingsInput,
  sealer: Sealer,
): StoredVpnSettings {
  const { config, piaPassword, containerKey, ...fields } = input
  const next: StoredVpnSettings = { ...current }
  for (const [k, v] of Object.entries(fields))
    if (v !== undefined && k in DEFAULT_VPN_SETTINGS) (next as Record<string, unknown>)[k] = v

  if (!MODES.includes(next.mode)) throw invalid(failures.mode, 'mode')
  const provider = providerById(next.provider)
  if (!provider) throw invalid(failures.provider, 'provider')
  next.containerUrl = next.containerUrl.trim().replace(/\/+$/, '')
  next.interface = next.interface.trim()
  next.piaUsername = next.piaUsername.trim()
  next.echoUrl = next.echoUrl.trim()
  if (
    next.staticPort !== null &&
    (!Number.isInteger(next.staticPort) || next.staticPort < 1 || next.staticPort > 65535)
  )
    throw invalid(failures.staticPort, 'staticPort')
  if (!/^https?:\/\/[^\s/]+/.test(next.echoUrl)) throw invalid(failures.echoUrl, 'echoUrl')

  if (filled(config)) {
    try {
      parseWireGuard(config)
    } catch (e) {
      if (e instanceof WireGuardError) throw invalid(e.message, 'config')
      throw e
    }
    next.configSealed = sealer.seal(config)
    next.configName = fields.configName?.trim() || current.configName || 'wireguard.conf'
  } else if (fields.configName === null) {
    // removing the configuration removes its keys too
    next.configName = null
    next.configSealed = null
  } else next.configName = current.configName
  if (filled(piaPassword)) next.piaPasswordSealed = sealer.seal(piaPassword)
  if (filled(containerKey)) next.containerKeySealed = sealer.seal(containerKey.trim())

  if (next.mode === 'builtin') {
    if (provider.connect === 'account') {
      if (!next.piaUsername) throw invalid(failures.piaUsername, 'piaUsername')
      if (next.piaPasswordSealed === null) throw invalid(failures.piaPassword, 'piaPassword')
    } else if (next.configSealed === null) throw invalid(failures.upload(provider.name), 'config')
  }
  if (next.mode === 'container') {
    if (!CONTAINER_URL.test(next.containerUrl))
      throw invalid(failures.unreachable(next.containerUrl), 'containerUrl')
    if (next.containerKeySealed === null) throw invalid(failures.containerKey, 'containerKey')
  }
  if (next.mode === 'interface' && !INTERFACE_NAME.test(next.interface))
    throw invalid(failures.interfaceName, 'interface')
  return next
}

export function writeStored(db: Db, s: StoredVpnSettings, now: number) {
  return writeSetting(db, VPN_SETTINGS_KEY, s, now)
}
