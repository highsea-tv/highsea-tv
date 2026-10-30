// SPDX-License-Identifier: AGPL-3.0-only
// The native apps' server list (connectivity.md), as the desktop app's servers.rs keeps it.
import { describe, expect, test } from 'bun:test'
import {
  addressesOf,
  forget,
  looksLocal,
  normalize,
  remember,
  tokenKey,
} from '../src/servers/index.ts'

describe('servers', () => {
  test('typed addresses get the scheme a home server or a domain needs', () => {
    expect(normalize('192.168.1.20:3000')).toBe('http://192.168.1.20:3000')
    expect(normalize('harbor.local:3000/')).toBe('http://harbor.local:3000')
    expect(normalize('harbor.example.net')).toBe('https://harbor.example.net')
    expect(normalize(' http://harbor.example.net ')).toBe('http://harbor.example.net')
    expect(normalize('')).toBeNull()
    expect(normalize('https://')).toBeNull()
    expect(normalize(':3000')).toBeNull()
    expect(normalize('not an address')).toBeNull()
  })

  test('local hosts', () => {
    expect(looksLocal('localhost:3000')).toBe(true)
    expect(looksLocal('[fe80::1]:3000')).toBe(true)
    expect(looksLocal('nas.example.net')).toBe(false)
  })

  test('addresses: the LAN ones, the remote one, then the one used, once each', () => {
    const info = {
      localAddresses: ['http://192.168.1.20:3000/'],
      publicUrl: 'https://harbor.example.net',
    }
    expect(addressesOf(info, 'http://192.168.1.20:3000')).toEqual([
      { url: 'http://192.168.1.20:3000', kind: 'local' },
      { url: 'https://harbor.example.net', kind: 'remote' },
    ])
    expect(
      addressesOf({ localAddresses: [], publicUrl: null }, 'http://harbor.local:3000'),
    ).toEqual([{ url: 'http://harbor.local:3000', kind: 'local' }])
  })

  test('the list keeps the most recent first, once per server', () => {
    const a = { id: 'a', name: 'A', addresses: [], lastSeen: 1 }
    const b = { id: 'b', name: 'B', addresses: [], lastSeen: 2 }
    const list = remember(remember([], a), b)
    expect(list.map((k) => k.id)).toEqual(['b', 'a'])
    expect(remember(list, { ...a, lastSeen: 3 }).map((k) => k.id)).toEqual(['a', 'b'])
    expect(forget(list, 'b').map((k) => k.id)).toEqual(['a'])
  })

  test('keychain keys are safe for SecureStore', () => {
    expect(tokenKey('srv_5k2m9x0q')).toBe('highsea.token.srv_5k2m9x0q')
    expect(tokenKey('a/b:c')).toBe('highsea.token.a_b_c')
  })
})
