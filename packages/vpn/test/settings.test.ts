// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { AppError } from '@highsea/core'
import { readSetting } from '@highsea/db'
import {
  DEFAULT_VPN_SETTINGS,
  openSecrets,
  readStored,
  type VpnSettingsInput,
} from '../src/index.ts'
import { startFakeGluetun } from './fake/index.ts'
import { sealer, testVpn, wgConfig } from './helpers.ts'

async function refusal(save: Promise<unknown>) {
  try {
    await save
  } catch (e) {
    expect(e).toBeInstanceOf(AppError)
    return {
      message: (e as Error).message,
      field: ((e as AppError).details as { field: string }).field,
    }
  }
  throw new Error('It was saved.')
}

describe('Settings › VPN', () => {
  test('a new server is off, with the prototype’s defaults', () => {
    const { vpn } = testVpn()
    expect(vpn.settings()).toEqual({
      mode: 'off',
      provider: 'proton',
      configName: null,
      piaUsername: '',
      piaPasswordSet: false,
      piaRegion: 'Netherlands',
      staticPort: null,
      containerUrl: 'http://127.0.0.1:8000',
      containerKeySet: false,
      interface: 'wg0',
      useForwardedPort: true,
      indexersThroughVpn: false,
      echoUrl: 'https://ifconfig.co/json',
    })
  })

  test('secrets are sealed at rest, said to be set, and kept when left empty', async () => {
    const gluetun = await startFakeGluetun()
    try {
      const { vpn, db } = testVpn()
      const saved = await vpn.save({
        mode: 'container',
        containerUrl: `${gluetun.url}/`,
        containerKey: gluetun.state.apiKey,
        provider: 'pia',
        piaUsername: 'p1234567',
        piaPassword: 'hunter2',
        config: wgConfig(),
        configName: 'harbor-NL-FREE-P2P-21.conf',
      } as VpnSettingsInput)
      expect(saved.containerKeySet).toBe(true)
      expect(saved.piaPasswordSet).toBe(true)
      expect(saved.configName).toBe('harbor-NL-FREE-P2P-21.conf')
      expect(saved.containerUrl).toBe(gluetun.url)
      expect(JSON.stringify(saved)).not.toContain(gluetun.state.apiKey)

      const raw = JSON.stringify(readSetting(db, 'vpn', {}))
      for (const secret of [gluetun.state.apiKey, 'hunter2', 'PrivateKey'])
        expect(raw).not.toContain(secret)
      expect(openSecrets(readStored(db), sealer)).toEqual({
        config: wgConfig(),
        piaPassword: 'hunter2',
        containerKey: gluetun.state.apiKey,
      })

      await vpn.save({ containerKey: '', piaPassword: '', useForwardedPort: false })
      const kept = openSecrets(readStored(db), sealer)
      expect(kept.containerKey).toBe(gluetun.state.apiKey)
      expect(kept.piaPassword).toBe('hunter2')
      expect(vpn.settings().useForwardedPort).toBe(false)

      await vpn.save({ mode: 'off', configName: null })
      expect(readStored(db).configSealed).toBeNull()
      expect(vpn.settings().configName).toBeNull()
    } finally {
      await gluetun.close()
    }
  })

  test('each refusal has the prototype’s copy', async () => {
    const { vpn } = testVpn()
    expect(await refusal(vpn.save({ mode: 'builtin', provider: 'pia' }))).toEqual({
      message: 'Enter your PIA username.',
      field: 'piaUsername',
    })
    expect(
      await refusal(vpn.save({ mode: 'builtin', provider: 'pia', piaUsername: 'p1' })),
    ).toEqual({
      message: 'Enter your PIA password.',
      field: 'piaPassword',
    })
    expect(await refusal(vpn.save({ mode: 'builtin', provider: 'mullvad' }))).toEqual({
      message: 'Upload a WireGuard configuration from Mullvad.',
      field: 'config',
    })
    expect(
      await refusal(
        vpn.save({ mode: 'builtin', provider: 'proton', config: 'client\nremote x 1194' }),
      ),
    ).toEqual({
      message: 'That file isn’t a WireGuard configuration: it has no [Interface] section.',
      field: 'config',
    })
    expect(await refusal(vpn.save({ mode: 'container', containerUrl: 'gluetun:8000' }))).toEqual({
      message: 'Couldn’t reach the VPN container’s control server at gluetun:8000.',
      field: 'containerUrl',
    })
    expect(await refusal(vpn.save({ mode: 'container' }))).toEqual({
      message: 'Enter the control server’s API key.',
      field: 'containerKey',
    })
    expect(await refusal(vpn.save({ mode: 'interface', interface: 'wg0; reboot' }))).toEqual({
      message: 'Choose an interface.',
      field: 'interface',
    })
    expect((await refusal(vpn.save({ staticPort: 0 }))).field).toBe('staticPort')
    expect((await refusal(vpn.save({ provider: 'nordvpn' }))).field).toBe('provider')
    expect(vpn.settings()).toMatchObject({ mode: 'off', provider: DEFAULT_VPN_SETTINGS.provider })
  })

  test('the container mode’s key and address are tried against gluetun before saving', async () => {
    const gluetun = await startFakeGluetun()
    try {
      const { vpn } = testVpn()
      expect(
        await refusal(
          vpn.save({ mode: 'container', containerUrl: gluetun.url, containerKey: 'wrong' }),
        ),
      ).toEqual({
        message: `gluetun’s control server at ${gluetun.url} refused that API key.`,
        field: 'containerKey',
      })
      await gluetun.close()
      expect(
        await refusal(
          vpn.save({
            mode: 'container',
            containerUrl: gluetun.url,
            containerKey: gluetun.state.apiKey,
          }),
        ),
      ).toEqual({
        message: `Couldn’t reach the VPN container’s control server at ${gluetun.url}.`,
        field: 'containerUrl',
      })
    } finally {
      await gluetun.close()
    }
  })
})
