// SPDX-License-Identifier: AGPL-3.0-only
// ServerConnection (connectivity.md): a known server has candidate addresses, on the LAN and
// remote. Probing asks each for the server's public info at once; a LAN address that answers
// wins (the fastest, if several), else the fastest remote one. A call that can't reach the
// current address re-probes and retries once, so the app fails over without the person noticing.
import { routes } from '@highsea/api-contract'
import { createClient, type Fetch, type HighseaClient } from './client.ts'
import { ApiError } from './errors.ts'

export type Address = { url: string; kind: 'local' | 'remote' }

export type KnownServer = {
  id: string
  name: string
  addresses: Address[]
  /** This device's token for the server, once signed in. */
  token?: string
}

export type Probe = { address: Address; latencyMs: number }

export type ServerConnection = {
  server: KnownServer
  /** The address in use, after a probe. */
  current(): Address | null
  probe(): Promise<Probe | null>
  client: HighseaClient
}

export function createServerConnection({
  server,
  fetch: doFetch = (...args) => fetch(...args),
  now = () => performance.now(),
  timeoutMs = 2500,
}: {
  server: KnownServer
  fetch?: Fetch
  now?: () => number
  timeoutMs?: number
}): ServerConnection {
  let current: Address | null = null
  let probing: Promise<Probe | null> | null = null

  async function tryAddress(address: Address): Promise<Probe | null> {
    const started = now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await doFetch(
        `${address.url.replace(/\/$/, '')}${routes.system.publicInfo.path}`,
        {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        },
      )
      if (!res.ok) return null
      const info = (await res.json()) as { id?: string }
      // another server answering at this address isn't this one
      if (info.id !== server.id) return null
      return { address, latencyMs: now() - started }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  function probe(): Promise<Probe | null> {
    probing ??= (async () => {
      const results = (await Promise.all(server.addresses.map(tryAddress))).filter(
        (r): r is Probe => r !== null,
      )
      const fastest = (kind: Address['kind']) =>
        results.filter((r) => r.address.kind === kind).sort((a, b) => a.latencyMs - b.latencyMs)[0]
      const best = fastest('local') ?? fastest('remote') ?? null
      current = best?.address ?? null
      probing = null
      return best
    })()
    return probing
  }

  // calls go to the current address; when it can't be reached, probe once and retry
  const routed: Fetch = async (input, init) => {
    if (!current) await probe()
    if (!current) throw new ApiError('unavailable', `Can’t reach ${server.name}.`)
    const path = String(input)
    const attempt = (a: Address) => doFetch(a.url.replace(/\/$/, '') + path, init)
    try {
      return await attempt(current)
    } catch (e) {
      if ((init?.signal as AbortSignal | undefined)?.aborted) throw e
      const before = current
      await probe()
      if (!current || current === before) throw e
      return attempt(current)
    }
  }

  return {
    server,
    current: () => current,
    probe,
    client: createClient({ baseUrl: '', token: () => server.token ?? null, fetch: routed }),
  }
}
