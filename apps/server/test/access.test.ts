// SPDX-License-Identifier: AGPL-3.0-only
// The guard's role table (ADR 0032): every route in the contract, asked by each kind of caller,
// against the access it declares. The real guard runs in front of a stub handler, so nothing a
// route does happens; only the guard answers. The `user` routes are listed by name, so a new one
// is a decision, not an accident: nothing administrative is `user`.
import { afterEach, describe, expect, test } from 'bun:test'
import { ACCESS, ACCESS_KEY, type Access, routes } from '@highsea/api-contract'
import { isAppError } from '@highsea/core'
import { Hono } from 'hono'
import { type Env, guard } from '../src/api/guard.ts'
import { addMember, bootRuntime, cleanup, meta, ORIGIN, withOwner } from './helpers.ts'

afterEach(cleanup)

const all = Object.entries(routes).flatMap(([group, rs]) =>
  Object.entries(rs).map(([name, r]) => ({
    name: `${group}.${name}`,
    method: r.method.toUpperCase(),
    // a concrete address for the route: each `{param}` becomes a placeholder segment
    path: r.path.replace(/\{\w+\}/g, 'x1'),
    access: (r as Record<string, unknown>)[ACCESS_KEY] as Access,
  })),
)

type Caller = 'nobody' | 'user' | 'admin' | 'admin key' | 'owner' | 'owner key'

/** The table: who gets past the guard for each access. 401 is signed out, 403 refused. */
const expected: Record<Access, Record<Caller, 200 | 401 | 403>> = {
  public: { nobody: 200, user: 200, admin: 200, 'admin key': 200, owner: 200, 'owner key': 200 },
  user: { nobody: 401, user: 200, admin: 200, 'admin key': 200, owner: 200, 'owner key': 200 },
  staff: { nobody: 401, user: 403, admin: 200, 'admin key': 200, owner: 200, 'owner key': 200 },
  // a key never acts as the owner (ADR 0023)
  owner: { nobody: 401, user: 403, admin: 403, 'admin key': 403, owner: 200, 'owner key': 403 },
}

/** The client API and each person's own account: everything signed-in users may call. */
const USER_ROUTES = [
  'announcements.active',
  'announcements.seen',
  'appearance.get',
  'appearance.soundPack',
  'auth.approvePairing',
  'auth.pairingRequest',
  'auth.session',
  'auth.signOut',
  'connections.pushKey',
  'devices.revoke',
  'home.layout',
  'home.saveLayout',
  'home.sections',
  'library.collection',
  'library.collections',
  'library.item',
  'library.list',
  'library.search',
  'me.addPasskey',
  'me.changePassword',
  'me.devices',
  'me.disableTwoFactor',
  'me.enableTwoFactor',
  'me.passkeyOptions',
  'me.passkeys',
  'me.recoveryCodes',
  'me.removePasskey',
  'me.renamePasskey',
  'me.startTwoFactor',
  'me.twoFactor',
  'me.update',
  'metadata.collection',
  'metadata.image',
  'metadata.movie',
  'metadata.person',
  'metadata.recommendations',
  'movies.recent',
  'movies.upcoming',
  'preferences.get',
  'preferences.save',
  'pushSubscriptions.add',
  'pushSubscriptions.list',
  'pushSubscriptions.remove',
  'system.events',
  'system.server',
]

describe('the contract', () => {
  test('every route declares one of the four levels', () => {
    for (const r of all) expect(ACCESS, r.name).toContain(r.access)
  })

  test('the user routes are the client API and the account’s own, and nothing else', () => {
    expect(
      all
        .filter((r) => r.access === 'user')
        .map((r) => r.name)
        .sort(),
    ).toEqual(USER_ROUTES)
  })
})

describe('the guard', () => {
  test('answers every route, for every caller, as the table says', async () => {
    const runtime = await bootRuntime()
    const { owner, token } = await withOwner(runtime)
    const user = await addMember(runtime, owner.id, 'Mara')
    const admin = await addMember(runtime, owner.id, 'Ruth', 'admin')
    const key = (id: string, name: string) =>
      runtime.auth.apiKeys.create({ name: 'Scripts', scope: 'full' }, { id, name }, meta).secret
    const callers: Record<Caller, string | null> = {
      nobody: null,
      user: user.token,
      admin: admin.token,
      'admin key': key(admin.id, 'ruth'),
      owner: token,
      'owner key': key(owner.id, 'ines'),
    }
    // the real guard, then a handler that only says the guard let the request through
    const app = new Hono<Env>()
    app.onError((e, c) =>
      isAppError(e)
        ? c.json({ code: e.code }, e.code === 'unauthorized' ? 401 : 403)
        : c.text('', 500),
    )
    app.use(guard(runtime))
    app.all('*', (c) => c.json({ through: true }, 200))

    const wrong: string[] = []
    for (const r of all)
      for (const [caller, secret] of Object.entries(callers) as [Caller, string | null][]) {
        const res = await app.request(`${ORIGIN}${r.path}`, {
          method: r.method,
          headers: secret ? { authorization: `Bearer ${secret}` } : {},
        })
        const want = expected[r.access][caller]
        if (res.status !== want)
          wrong.push(`${r.name} (${r.access}) as ${caller}: ${res.status}, expected ${want}`)
      }
    expect(wrong).toEqual([])
  })
})
