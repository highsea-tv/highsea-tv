// SPDX-License-Identifier: AGPL-3.0-only
// The gate's shared rules (connectivity.md): what a typed address tries, how a row shows it,
// single sign-on's start and words, and the TV's pairing link.
import { describe, expect, test } from 'bun:test'
import { createT } from '@highsea-tv/i18n'
import {
  candidates,
  forgetMessages,
  hostOf,
  OIDC_REDIRECT,
  oidcMessage,
  oidcStart,
  pairingLink,
  pairingPage,
  reachedRemotely,
  reasonOf,
  seenWhen,
  signInMessages,
} from '../src/gate/index.ts'

describe('the gate', () => {
  test('a typed address tries its guess, then the other scheme', () => {
    expect(candidates('192.168.1.20:3000')).toEqual([
      'http://192.168.1.20:3000',
      'https://192.168.1.20:3000',
    ])
    expect(candidates('harbor.example.net')).toEqual([
      'https://harbor.example.net',
      'http://harbor.example.net',
    ])
    expect(candidates('http://harbor.example.net/')).toEqual(['http://harbor.example.net'])
    expect(candidates('  ')).toBeNull()
  })

  test('an address is shown without its scheme', () => {
    expect(hostOf('http://192.168.1.20:3000/')).toBe('192.168.1.20:3000')
    expect(hostOf('https://harbor.example.net')).toBe('harbor.example.net')
  })

  test('the address in use says whether it’s remote', () => {
    const addresses = [
      { url: 'http://192.168.1.20:3000', kind: 'local' as const },
      { url: 'https://harbor.example.net', kind: 'remote' as const },
    ]
    expect(reachedRemotely(addresses, 'https://harbor.example.net')).toBe(true)
    expect(reachedRemotely(addresses, 'http://192.168.1.20:3000')).toBe(false)
    expect(reachedRemotely(addresses, 'http://elsewhere')).toBe(false)
  })

  test('a server seen in the last minute was seen just now', () => {
    const now = Date.parse('2026-11-02T12:00:00Z')
    expect(seenWhen(now - 30_000, now)).toBe('now')
    expect(seenWhen(now - 3_600_000, now)).toBe('2026-11-02T11:00:00.000Z')
  })

  test('single sign-on starts at the server with the challenge, and words its refusals', () => {
    expect(oidcStart('http://h:3000', 'ios', 'a+b')).toBe(
      'http://h:3000/api/v1/auth/oidc/start?app=ios&challenge=a%2Bb',
    )
    expect(OIDC_REDIRECT).toBe('highsea://oidc')
    expect(oidcMessage('oidc-denied')).toBe('oidc.oidc-denied')
    expect(oidcMessage('something-else')).toBe('oidc.other')
    expect(oidcMessage(undefined)).toBe('oidc.other')
    const t = createT(signInMessages)
    expect(t(oidcMessage('oidc-unknown'), { name: 'Harbor', provider: 'Authentik' })).toBe(
      'There’s no account on Harbor for you yet. Ask its owner for an invite.',
    )
    expect(reasonOf({ details: { reason: 'challenge-expired' } })).toBe('challenge-expired')
    expect(reasonOf(new Error('x'))).toBeUndefined()
    expect(reasonOf(null)).toBeUndefined()
  })

  test('the TV’s QR opens the phone at the code, and its page is typed without it', () => {
    expect(pairingLink('srv 1', 'KQ74PM')).toBe('highsea://link?server=srv%201&code=KQ74PM')
    expect(pairingPage('http://h:3000/link?code=KQ74PM')).toBe('http://h:3000/link')
  })

  test('forgetting says which device signs out', () => {
    const t = createT(forgetMessages)
    expect(t('detail', { device: 'tv' })).toStartWith('This TV signs out')
    expect(t('detail', { device: 'phone' })).toStartWith('This phone signs out')
    expect(t('detail', { device: 'web' })).toStartWith('This browser signs out')
  })
})
