// SPDX-License-Identifier: AGPL-3.0-only
// The catalog's `vpn-providers` kind (ADR 0042, docs/plans/phase-3-checkpoint-6.md › Providers):
// the providers Settings › VPN › highsea connects offers, in `@highsea-tv/schemas/vpn`'s format,
// signed and verified exactly as the indexers are (ADR 0034). It's a small reader beside the
// indexer service rather than a part of it: the entries are a short list read whole, so they're
// kept in memory and in `/config/catalog/vpn-providers/`, not in the definitions table.
//
// Where they come from, newest version first:
// - the main catalog, `{mainUrl}/vpn-providers/{channel}/manifest.json`, verified with the release
//   keys only, and cached once installed;
// - the seed snapshot shipped in the server, `seed/vpn-providers/{channel}/`. It's verified with
//   the release keys and the development key: it ships inside the build, as trusted as the code,
//   and highsea connects must work before publishing begins (judgement call in the 6b report).
// A failure keeps what was there; nothing unsigned or tampered is loaded.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Clock, Fetch, Logger } from '@highsea-tv/core'
import type { JobQueue } from '@highsea-tv/jobs'
import {
  formatProviderIssues,
  type VpnProviderDefinition,
  validateVpnProvider,
  vpnEngineSupports,
} from '@highsea-tv/schemas/vpn'
import { z } from 'zod'
import {
  bundleSchema,
  type Channel,
  compareCatalogVersions,
  type Manifest,
  manifestSchema,
} from './format.ts'
import { DEVELOPMENT_KEY } from './keys.ts'
import { SignatureError, sha256, type TrustedKey, verifyEnvelope } from './signing.ts'

export const VPN_PROVIDERS_KIND = 'vpn-providers'
export const VPN_PROVIDERS_CHECK_JOB = 'catalog.check.vpn-providers'
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 30_000
const MAX_BYTES = 2 * 1024 * 1024

export type VpnProviderCatalogDeps = {
  logger: Logger
  clock: Clock
  fetch: Fetch
  /** `/config`: verified updates are cached in `catalog/vpn-providers/{channel}/`. */
  configDir: string
  /** The release keys (and the development key in development builds). */
  trustedKeys: readonly TrustedKey[]
  /** Holds `{channel}/manifest.json` and its bundle; null when the build ships none. */
  seedDir: string | null
  /** The main catalog's base URL; null until publishing begins (decision 5). */
  mainUrl: string | null
  /** The indexer catalog's channel and automatic updates, which this kind follows. */
  settings(): { channel: Channel; autoUpdate: boolean }
  jobs?: JobQueue
}

type Installed = { version: string; providers: VpnProviderDefinition[] }

export function createVpnProviderCatalog(deps: VpnProviderCatalogDeps) {
  const log = deps.logger.child('catalog')
  let installed: Installed | null = null
  const cacheDir = (channel: Channel) =>
    join(deps.configDir, 'catalog', VPN_PROVIDERS_KIND, channel)

  function verify(envelope: unknown, bytes: Uint8Array, keys: readonly TrustedKey[]) {
    const manifest = manifestSchema.parse(JSON.parse(verifyEnvelope(envelope, keys)))
    if (manifest.kind !== VPN_PROVIDERS_KIND)
      throw new SignatureError('That catalog isn’t VPN providers.')
    if (bytes.byteLength !== manifest.bundle.size || sha256(bytes) !== manifest.bundle.sha256)
      throw new SignatureError('The catalog bundle doesn’t match its signed manifest.')
    const bundle = bundleSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8')))
    if (bundle.version !== manifest.version || bundle.kind !== manifest.kind)
      throw new SignatureError('The catalog bundle doesn’t match its signed manifest.')
    return { manifest, bundle }
  }

  /** The entries this server can use; the rest are logged and skipped. */
  function entries(raw: readonly unknown[]): VpnProviderDefinition[] {
    const out: VpnProviderDefinition[] = []
    for (const item of raw) {
      const result = validateVpnProvider(item)
      if (!result.ok) {
        log.warn('skipped a VPN provider that doesn’t validate', {
          problems: formatProviderIssues(result.errors),
        })
        continue
      }
      if (!vpnEngineSupports(result.definition.minEngineVersion)) {
        log.info('skipped a VPN provider for a newer server', { id: result.definition.id })
        continue
      }
      out.push(result.definition)
    }
    return out
  }

  /** A verified pair of files on disk, or null. */
  function readDir(dir: string, keys: readonly TrustedKey[]) {
    const file = join(dir, 'manifest.json')
    if (!existsSync(file)) return null
    try {
      const envelope: unknown = JSON.parse(readFileSync(file, 'utf8'))
      const peek = manifestSchema.parse(
        JSON.parse(z.object({ manifest: z.string() }).parse(envelope).manifest),
      )
      return verify(envelope, readFileSync(join(dir, peek.bundle.path)), keys)
    } catch (e) {
      log.warn('couldn’t use a VPN provider catalog', { dir, error: (e as Error).message })
      return null
    }
  }

  function install(manifest: Manifest, definitions: readonly unknown[]) {
    installed = { version: manifest.version, providers: entries(definitions) }
    log.info('installed VPN providers', {
      version: manifest.version,
      providers: installed.providers.length,
    })
  }

  function load() {
    const channel = deps.settings().channel
    const seedKeys = [
      ...deps.trustedKeys,
      ...(deps.trustedKeys.some((k) => k.id === DEVELOPMENT_KEY.id) ? [] : [DEVELOPMENT_KEY]),
    ]
    const found = [
      deps.seedDir ? readDir(join(deps.seedDir, channel), seedKeys) : null,
      readDir(cacheDir(channel), deps.trustedKeys),
    ].filter((f) => f !== null && f.manifest.channel === channel) as ReturnType<typeof verify>[]
    const newest = found.sort((a, b) =>
      compareCatalogVersions(b.manifest.version, a.manifest.version),
    )[0]
    installed = null
    if (newest) install(newest.manifest, newest.bundle.definitions)
  }

  async function get(url: string) {
    return deps.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  }

  async function bytesOf(response: Response) {
    if (Number(response.headers.get('content-length') ?? 0) > MAX_BYTES)
      throw new Error('The catalog bundle is too large.')
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) throw new Error('The catalog bundle is too large.')
    return bytes
  }

  /** Checks the main catalog for newer providers. Returns what happened, for the log. */
  async function check(): Promise<'off' | 'unchanged' | 'waiting' | 'installed'> {
    if (!deps.mainUrl) return 'off'
    const { channel, autoUpdate } = deps.settings()
    const root = `${deps.mainUrl.replace(/\/+$/, '')}/${VPN_PROVIDERS_KIND}/${channel}`
    const response = await get(`${root}/manifest.json`)
    if (!response.ok) throw new Error(`The catalog answered ${response.status}.`)
    const envelope: unknown = await response.json()
    const manifest = manifestSchema.parse(JSON.parse(verifyEnvelope(envelope, deps.trustedKeys)))
    if (manifest.channel !== channel)
      throw new SignatureError('The catalog manifest is for another channel.')
    if (installed && compareCatalogVersions(manifest.version, installed.version) <= 0)
      return 'unchanged'
    // "Ask first" holds VPN providers back too; they install with the next automatic update
    if (!autoUpdate) return 'waiting'
    const bundleResponse = await get(`${root}/${manifest.bundle.path}`)
    if (!bundleResponse.ok) throw new Error(`The catalog bundle answered ${bundleResponse.status}.`)
    const bytes = await bytesOf(bundleResponse)
    const verified = verify(envelope, bytes, deps.trustedKeys)
    const dir = cacheDir(channel)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, verified.manifest.bundle.path), bytes)
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(envelope, null, 2))
    install(verified.manifest, verified.bundle.definitions)
    return 'installed'
  }

  return {
    /** Loads the newest verified providers: the seed or what's cached. Call once at boot. */
    start: load,
    /** Reads them again, after the channel changes. */
    reload: load,
    check,
    defineJobs() {
      deps.jobs?.define({
        type: VPN_PROVIDERS_CHECK_JOB,
        payload: z.object({}),
        attempts: 2,
        timeoutMs: 5 * 60_000,
        async run() {
          try {
            log.info('checked the VPN providers', { result: await check() })
          } catch (e) {
            log.warn('a VPN provider check failed', { error: (e as Error).message })
          }
        },
      })
    },
    schedule(now: number) {
      deps.jobs?.schedule(VPN_PROVIDERS_CHECK_JOB, CHECK_EVERY_MS, { firstRunAt: now + 90_000 })
    },
    providers: (): VpnProviderDefinition[] => installed?.providers ?? [],
    version: () => installed?.version ?? null,
  }
}

export type VpnProviderCatalog = ReturnType<typeof createVpnProviderCatalog>
