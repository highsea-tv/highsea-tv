// SPDX-License-Identifier: AGPL-3.0-only
// A booted runtime in a temporary directory, with an owner and a way to sign people in.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { issueDevice } from '@highsea/auth'
import { boot, getRuntime, hasRuntime, loadConfig, type Runtime } from '@highsea/runtime'

export const meta = { address: '127.0.0.1', userAgent: 'bun test' }
export const OWNER = { username: 'ines', displayName: 'Ines', password: 'correct horse battery' }
export const tv = { name: 'Living room TV', client: 'tvos' as const, appVersion: '1.0.0' }

const dirs: string[] = []

export async function cleanup() {
  if (hasRuntime()) await getRuntime().shutdown()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
}

export async function bootRuntime(): Promise<Runtime> {
  const dir = mkdtempSync(join(tmpdir(), 'highsea-api-'))
  dirs.push(dir)
  return boot({
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
  return { owner, token: tokenFor(runtime, owner.id) }
}

/** Someone invited with `role` who has accepted; returns their id and a device token. */
export async function addMember(
  runtime: Runtime,
  ownerId: string,
  displayName: string,
  role: 'admin' | 'member' | 'restricted' = 'member',
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
