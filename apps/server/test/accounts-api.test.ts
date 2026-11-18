// SPDX-License-Identifier: AGPL-3.0-only
// Renaming an account over HTTP (HT-37): the routes, their field errors and who may call them.
import { afterEach, describe, expect, test } from 'bun:test'
import { createApi } from '../src/api/app.ts'
import { addMember, bootRuntime, cleanup, clientFor, failure, OWNER, withOwner } from './helpers.ts'

afterEach(cleanup)

async function server() {
  const runtime = await bootRuntime()
  const app = createApi(runtime)
  const { owner, token } = await withOwner(runtime)
  return { runtime, app, owner, token, owners: clientFor(app, { token }) }
}

/** A raw call with a bearer token, for the error body's details. */
const put = (app: ReturnType<typeof createApi>, token: string, path: string, body: unknown) =>
  app.request(`http://localhost/api/v1${path}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('renaming an account', () => {
  test('the owner renames someone; their app stays signed in under the same id', async () => {
    const { runtime, app, owner, owners } = await server()
    const mara = await addMember(runtime, owner.id, 'Mara')
    const marasApp = clientFor(app, { token: mara.token })
    const renamed = await owners.users.rename({
      params: { id: mara.id },
      body: { username: 'Mara.J' },
    })
    expect(renamed).toMatchObject({ id: mara.id, username: 'mara.j' })
    // the app reads the new name the next time it asks
    expect((await marasApp.auth.session()).user).toMatchObject({ id: mara.id, username: 'mara.j' })
    const { items } = await owners.audit.list({ query: {} })
    expect(items[0]).toMatchObject({
      action: 'user.rename',
      actorId: owner.id,
      targetId: mara.id,
      detail: { from: 'mara', to: 'mara.j' },
    })
  })

  test('you rename yourself with your password', async () => {
    const { app, owner, owners } = await server()
    expect(
      await failure(owners.me.changeUsername({ body: { username: 'seb', password: 'wrong' } })),
    ).toMatchObject({ code: 'unauthorized', reason: 'invalid-credentials' })
    const you = await owners.me.changeUsername({
      body: { username: 'seb', password: OWNER.password },
    })
    expect(you).toMatchObject({ id: owner.id, username: 'seb' })
    const signIn = (username: string) =>
      app.request('http://localhost/api/v1/auth/sign-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost' },
        body: JSON.stringify({ username, password: OWNER.password }),
      })
    expect((await signIn('seb')).status).toBe(200)
    expect((await signIn(OWNER.username)).status).toBe(401)
  })

  test('a user can’t rename someone else, or themselves through the owner’s route', async () => {
    const { runtime, app, owner } = await server()
    const mara = await addMember(runtime, owner.id, 'Mara')
    const ruth = await addMember(runtime, owner.id, 'Ruth', 'admin')
    for (const who of [mara, ruth]) {
      const res = await put(app, who.token, `/users/${owner.id}/username`, { username: 'boss' })
      expect(res.status).toBe(403)
    }
    expect(
      (await put(app, mara.token, `/users/${mara.id}/username`, { username: 'mj' })).status,
    ).toBe(403)
    expect(runtime.auth.users.get(owner.id).username).toBe(OWNER.username)
    expect(runtime.auth.users.get(mara.id).username).toBe('mara')
  })

  test('taken and invalid names are field errors', async () => {
    const { runtime, app, owner, token } = await server()
    const mara = await addMember(runtime, owner.id, 'Mara')
    const taken = await put(app, token, `/users/${mara.id}/username`, { username: 'INES' })
    expect(taken.status).toBe(409)
    expect((await taken.json()).error).toMatchObject({
      code: 'conflict',
      details: { field: 'username', reason: 'username-taken' },
    })
    const invalid = await put(app, mara.token, '/me/username', {
      username: 'mara jensen',
      password: 'a long enough password',
    })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error).toMatchObject({
      code: 'invalid',
      details: { field: 'username', reason: 'username-invalid' },
    })
  })
})
