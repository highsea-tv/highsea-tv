// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { ACCESS, accessOf, ErrorBody, errors, PublicInfo, routes } from '../src/index.ts'

describe('contract', () => {
  test('every route has a method, a path under /api and a summary', () => {
    for (const [group, rs] of Object.entries(routes))
      for (const [name, r] of Object.entries(rs)) {
        expect(r.path, `${group}.${name}`).toMatch(/^\/api\//)
        expect(r.summary, `${group}.${name}`).toBeTruthy()
      }
  })

  test('every route declares who may call it, with matching security', () => {
    for (const [group, rs] of Object.entries(routes))
      for (const [name, r] of Object.entries(rs)) {
        const level = accessOf(r)
        expect(ACCESS, `${group}.${name}`).toContain(level as never)
        expect('security' in r, `${group}.${name}`).toBe(level !== 'public')
      }
  })

  test('no two routes share a method and path', () => {
    const seen = new Set<string>()
    for (const rs of Object.values(routes))
      for (const r of Object.values(rs)) {
        const key = `${r.method} ${r.path}`
        expect(seen.has(key), key).toBe(false)
        seen.add(key)
      }
  })

  test('errors() maps codes to statuses with the shared body', () => {
    const e = errors('not-found', 'forbidden')
    expect(Object.keys(e).sort()).toEqual(['403', '404'])
    expect(e[404].content['application/json'].schema).toBe(ErrorBody)
  })

  test('schemas validate what the server sends', () => {
    expect(
      PublicInfo.safeParse({
        id: 'srv_1',
        name: 'Harbor',
        version: '0.1.0',
        localAddresses: [],
        publicUrl: null,
        setupComplete: true,
        auth: { local: true, oidc: null, passkeys: false },
        sources: ['system'],
      }).success,
    ).toBe(true)
    expect(ErrorBody.safeParse({ error: { code: 'nope', message: 'x' } }).success).toBe(false)
  })
})
