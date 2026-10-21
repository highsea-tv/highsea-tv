// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { isWireGuardKey, parseWireGuard, WireGuardError, wireGuardFailures } from '../src/index.ts'
import { KEY_A, KEY_B, wgConfig } from './helpers.ts'

const refusal = (text: string) => {
  try {
    parseWireGuard(text)
  } catch (e) {
    expect(e).toBeInstanceOf(WireGuardError)
    return (e as Error).message
  }
  throw new Error('It was accepted.')
}

describe('WireGuard configurations', () => {
  test('a provider’s file reads into its parts', () => {
    const c = parseWireGuard(
      `# Proton VPN\r\n${wgConfig('ListenPort = 51820\nMTU = 1420\nPostUp = iptables -A FORWARD')}PresharedKey = ${KEY_A}\nPersistentKeepalive = 25\n`,
    )
    expect(c).toEqual({
      privateKey: KEY_A,
      addresses: ['10.2.0.2/32'],
      dns: ['10.2.0.1'],
      listenPort: 51820,
      mtu: 1420,
      peers: [
        {
          publicKey: KEY_B,
          presharedKey: KEY_A,
          endpoint: { host: '185.159.157.4', port: 51820 },
          allowedIps: ['0.0.0.0/0', '::/0'],
          persistentKeepalive: 25,
        },
      ],
    })
  })

  test('keys match without regard to case, bare addresses get a full prefix, and names stay', () => {
    const c = parseWireGuard(`[interface]
privatekey = ${KEY_A}
address = 10.64.1.2, fc00:bbbb::2
dns = 10.64.0.1, home.arpa
[PEER]
publickey = ${KEY_B}
endpoint = [2001:db8::1]:51820
allowedips = 0.0.0.0/0
persistentkeepalive = off
[Peer]
PublicKey = ${KEY_A}
Endpoint = nl.example.net:1637
`)
    expect(c.addresses).toEqual(['10.64.1.2/32', 'fc00:bbbb::2/128'])
    expect(c.dns).toEqual(['10.64.0.1'])
    expect(c.peers[0]?.endpoint).toEqual({ host: '2001:db8::1', port: 51820 })
    expect(c.peers[0]?.persistentKeepalive).toBeNull()
    expect(c.peers[1]?.endpoint).toEqual({ host: 'nl.example.net', port: 1637 })
  })

  test('a file without [Interface] is refused with the spec’s copy', () => {
    expect(refusal('client\ndev tun\nremote nl.example.net 1194')).toBe(
      'That file isn’t a WireGuard configuration: it has no [Interface] section.',
    )
    expect(refusal(`[Peer]\nPublicKey = ${KEY_B}\n`)).toBe(wireGuardFailures.noInterface)
    expect(refusal('')).toBe(wireGuardFailures.noInterface)
  })

  test('missing keys and peers are refused', () => {
    expect(refusal(`[Interface]\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = ${KEY_B}`)).toBe(
      wireGuardFailures.noPrivateKey,
    )
    expect(refusal(`[Interface]\nPrivateKey = ${KEY_A}\n`)).toBe(wireGuardFailures.noPeer)
    expect(refusal(`[Interface]\nPrivateKey = ${KEY_A}\n[Peer]\nEndpoint = 1.2.3.4:5`)).toBe(
      wireGuardFailures.noPublicKey,
    )
  })

  test('bad values are refused, naming the key', () => {
    expect(refusal(wgConfig().replace(KEY_A, 'abc='))).toBe(wireGuardFailures.badKey('PrivateKey'))
    expect(refusal(wgConfig().replace('10.2.0.2/32', '10.2.0.2/33'))).toBe(
      wireGuardFailures.badValue('Address', '10.2.0.2/33'),
    )
    expect(refusal(wgConfig().replace('185.159.157.4:51820', '185.159.157.4'))).toBe(
      wireGuardFailures.badValue('Endpoint', '185.159.157.4'),
    )
    expect(refusal(wgConfig('ListenPort = 70000'))).toBe(
      wireGuardFailures.badValue('ListenPort', '70000'),
    )
    expect(refusal(wgConfig('just words'))).toBe(wireGuardFailures.badLine(5))
  })

  test('a key is 32 bytes of base64', () => {
    expect(isWireGuardKey(KEY_A)).toBe(true)
    expect(isWireGuardKey(Buffer.alloc(31).toString('base64'))).toBe(false)
    expect(isWireGuardKey(Buffer.alloc(33).toString('base64'))).toBe(false)
    expect(isWireGuardKey(`${KEY_A.slice(0, 42)}B=`)).toBe(false)
  })
})
