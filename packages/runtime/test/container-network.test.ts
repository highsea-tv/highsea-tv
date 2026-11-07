// SPDX-License-Identifier: AGPL-3.0-only
// The container's network, from the interfaces it sees (injected: nothing is read from this
// machine): host networking, a bridge, and outside a container. Setup's address and Settings ›
// VPN read the same answer.
import { describe, expect, test } from 'bun:test'
import type { NetworkInterfaceInfo } from 'node:os'
import { detectAddress, detectContainerNetwork, loadConfig } from '../src/index.ts'

const nic = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  family: 'IPv4',
  internal,
  netmask: '255.255.255.0',
  mac: '00:00:00:00:00:00',
  cidr: null,
})

/** What a container on host networking sees: the host's own interfaces, Docker's among them. */
const host = {
  lo: [nic('127.0.0.1', true)],
  eth0: [nic('192.168.1.20')],
  docker0: [nic('172.17.0.1')],
  'br-3f2a9c1d7e4b': [nic('172.18.0.1')],
  veth1a2b3c4: [],
}
/** What a container on a bridge sees: its own loopback and eth0, nothing of the host's. */
const bridge = { lo: [nic('127.0.0.1', true)], eth0: [nic('172.18.0.5')] }

describe('the container’s network', () => {
  test('in a container with host networking, Docker’s interfaces show', () => {
    expect(detectContainerNetwork({ interfaces: host, inContainer: true })).toBe('host')
    // any one of them is enough: a host with only a compose network has no docker0's addresses
    expect(
      detectContainerNetwork({
        interfaces: { lo: host.lo, eth0: host.eth0, 'br-3f2a9c1d7e4b': [] },
        inContainer: true,
      }),
    ).toBe('host')
    expect(
      detectContainerNetwork({
        interfaces: { lo: host.lo, eth0: host.eth0, veth9f8e7d6: [] },
        inContainer: true,
      }),
    ).toBe('host')
  })

  test('in a bridge network, only the container’s own interfaces', () => {
    expect(detectContainerNetwork({ interfaces: bridge, inContainer: true })).toBe('bridge')
    // a name that only starts like Docker's isn't one of them
    expect(
      detectContainerNetwork({
        interfaces: { ...bridge, dockerish: [], 'br-lan': [] },
        inContainer: true,
      }),
    ).toBe('bridge')
  })

  test('outside a container there’s no compose file to change, whatever the interfaces', () => {
    expect(detectContainerNetwork({ interfaces: host, inContainer: false })).toBeNull()
    expect(detectContainerNetwork({ interfaces: bridge, inContainer: false })).toBeNull()
  })

  test('setup’s address follows the same answer', () => {
    const config = loadConfig({ HIGHSEA_DATA_DIR: '/data' })
    for (const [interfaces, inContainer, address] of [
      [host, true, `192.168.1.20:${config.port}`],
      [bridge, true, null],
      [host, false, `192.168.1.20:${config.port}`],
    ] as const) {
      const network = detectContainerNetwork({ interfaces, inContainer })
      expect(detectAddress(config, { interfaces, inContainer })).toBe(address)
      // a bridge is the one network where highsea can't see the host's address
      expect(network === 'bridge').toBe(address === null)
    }
  })
})
