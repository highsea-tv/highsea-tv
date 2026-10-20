// SPDX-License-Identifier: AGPL-3.0-only
// A booted runtime in a temporary directory, with an owner and a way to sign people in.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defaultSecuritySettings, issueDevice, SECURITY_KEY } from '@highsea/auth'
import { writeSetting } from '@highsea/db'
import { createReplayFetch, type ReplayFetch } from '@highsea/metadata/replay'
import { boot, getRuntime, hasRuntime, loadConfig, type Runtime } from '@highsea/runtime'
import { ApiError, createClient } from '@highsea/sdk'
import type { createApi } from '../src/api/app.ts'

export const meta = { address: '127.0.0.1', userAgent: 'bun test' }
export const OWNER = { username: 'ines', displayName: 'Ines', password: 'correct horse battery' }
export const tv = { name: 'Living room TV', client: 'tvos' as const, appVersion: '1.0.0' }

const dirs: string[] = []

export async function cleanup() {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
}

/**
 * A booted runtime whose outside requests go to TMDB's recordings (ADR 0029): no test reaches the
 * network, and one with no recording fails. Pass `fetch` to count or fail requests.
 */
export async function bootRuntime(options: { fetch?: ReplayFetch } = {}): Promise<Runtime> {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-api-'))
  dirs.push(dir)
  return boot({
    fetch: options.fetch ?? createReplayFetch(),
    config: loadConfig({
      HIGHSEA_CONFIG_DIR: join(dir, 'config'),
      HIGHSEA_DATA_DIR: join(dir, 'data'),
    }),
    version: '0.1.0',
    quiet: true,
    memory: true,
    manualTicks: true,
  })
}

/** An app's device token for someone, as pairing or an app sign-in would issue it. */
export const tokenFor = (runtime: Runtime, userId: string) =>
  issueDevice(runtime.auth.ctx, userId, 'password', meta, tv).secret

export async function withOwner(runtime: Runtime) {
  const owner = await runtime.auth.createOwner(OWNER, meta)
  // a new server requires two-step for staff (ADR 0032); these tests sign in without it unless one
  // turns it on
  writeSetting(
    runtime.db,
    SECURITY_KEY,
    { ...defaultSecuritySettings, twoFactor: false },
    Date.now(),
  )
  return { owner, token: tokenFor(runtime, owner.id) }
}

/** Someone invited with `role` who has accepted; returns their id and a device token. */
export async function addMember(
  runtime: Runtime,
  ownerId: string,
  displayName: string,
  role: 'admin' | 'user' = 'user',
) {
  const invite = runtime.auth.users.invite(
    { displayName, email: null, role, libraries: 'all' },
    { id: ownerId, name: OWNER.username },
    meta,
  )
  const token = invite.link.split('/').pop() as string
  const accepted = await runtime.auth.links.accept(
    token,
    { password: 'a long enough password' },
    meta,
  )
  return { id: invite.user.id, token: tokenFor(runtime, accepted.session.user.id) }
}

export const ORIGIN = 'http://localhost'

/** An SDK client over the app in memory, as a browser on this origin or as an app with a token. */
export function clientFor(
  app: ReturnType<typeof createApi>,
  auth: { token?: string; cookie?: string } = {},
) {
  return createClient({
    token: auth.token,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      if (auth.cookie) {
        headers.set('cookie', auth.cookie)
        headers.set('sec-fetch-site', 'same-origin')
      }
      return app.request(`${ORIGIN}${input}`, { ...init, headers })
    },
  })
}

/** The error an SDK call fails with. */
export async function failure(call: Promise<unknown>) {
  try {
    await call
  } catch (e) {
    if (e instanceof ApiError)
      return { code: e.code, reason: (e.details as { reason?: string })?.reason }
    throw e
  }
  throw new Error('expected the call to fail')
}
