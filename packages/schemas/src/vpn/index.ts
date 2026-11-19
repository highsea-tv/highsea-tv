// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/schemas/vpn: the VPN provider format, the catalog's `vpn-providers` kind
// (docs/plans/phase-3-checkpoint-6.md › Providers, ADR 0042). Facts are data, mechanisms are code:
// an entry says which of highsea's mechanisms a provider uses (a WireGuard configuration file, PIA's
// API or an access token to connect; NAT-PMP, PIA's API, a typed-in port or nothing to forward a
// port), and
// carries the steps and links for finding what highsea needs in the provider's account. Pure: no
// I/O, so the catalog pipeline, the server and the tests share it.
import { isIP } from 'node:net'
import { z } from 'zod'
import { compareVersions, engineSupports, isSemver } from '../indexers/version.ts'

/**
 * The provider format's version. An entry names the oldest it needs (`minEngineVersion`); the
 * server skips an entry it can't use, as it does indexer definitions (ADR 0007). Raise the minor
 * when a mechanism is added, the major only when an old entry would mean something else.
 */
export const VPN_ENGINE_VERSION = '1.1.0'

export { compareVersions as compareProviderVersions }

/** Whether this server can use an entry needing `required`. */
export function vpnEngineSupports(required: string, engine: string = VPN_ENGINE_VERSION): boolean {
  return engineSupports(required, engine)
}

const semver = z.string().refine(isSemver, 'Use a version like 1.0.0.')
const https = z
  .string()
  .max(300)
  .regex(/^https:\/\/[^\s]+$/, 'Use an https:// address.')
const line = z.string().min(1).max(300)

/**
 * How highsea connects: a configuration file the owner uploads, PIA's API, or an access token the
 * owner pastes, with which highsea fetches a WireGuard key and a server (engine 1.1.0, HT-87).
 */
export const CONNECT_METHODS = ['config', 'pia', 'token'] as const

/**
 * Where a value is in a JSON answer: field names joined by dots, and on an array a `[field=value]`
 * that picks the first item whose field equals the value (`technologies[id=35].metadata[name=public_key].value`).
 */
export const ANSWER_PATH =
  /^[a-z_][a-z0-9_]{0,40}(\[[a-z_][a-z0-9_]{0,40}=[A-Za-z0-9_-]{1,60}\])?(\.[a-z_][a-z0-9_]{0,40}(\[[a-z_][a-z0-9_]{0,40}=[A-Za-z0-9_-]{1,60}\])?){0,8}$/
/** The value at `path` in a parsed JSON answer, or undefined. */
export function readAnswerPath(value: unknown, path: string): unknown {
  let here: unknown = value
  for (const part of path.split('.')) {
    const m = /^([a-z0-9_]+)(?:\[([a-z0-9_]+)=([^\]]+)\])?$/i.exec(part)
    if (!m || here === null || typeof here !== 'object' || Array.isArray(here)) return undefined
    here = (here as Record<string, unknown>)[m[1] as string]
    if (m[2] !== undefined) {
      if (!Array.isArray(here)) return undefined
      const [field, wanted] = [m[2], m[3]]
      here = here.find(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          String((item as Record<string, unknown>)[field]) === wanted,
      )
    }
  }
  return here
}

const answerPath = z
  .string()
  .regex(ANSWER_PATH, 'Use field names joined by dots, like a.b[id=1].c.')
const queryName = z
  .string()
  .max(60)
  .regex(/^[A-Za-z0-9_[\].-]+$/, 'A query parameter’s name.')
const ipv4 = z.string().refine((v) => isIP(v) === 4, 'An IPv4 address.')

/**
 * `connect: token`: the owner pastes an access token, and highsea asks the provider's API for the
 * WireGuard private key it unlocks and for a recommended server, then builds the tunnel from them
 * and the fixed facts below. Like `pia`, the requests go out before the tunnel is up; unlike it,
 * the key is the account's own (nothing is registered), and the server comes from a list rather
 * than a region's fixed host. Every part is data, so another token-based provider needs an entry,
 * not code.
 */
export const tokenConnectSchema = z
  .object({
    /**
     * How the token goes with each request, always in a header and never in an address: HTTP Basic
     * with this user name and the token as the password, or `Authorization: Bearer <token>`.
     */
    auth: z.discriminatedUnion('scheme', [
      z.object({ scheme: z.literal('basic'), username: z.string().min(1).max(40) }).strict(),
      z.object({ scheme: z.literal('bearer') }).strict(),
    ]),
    /** The account's WireGuard private key: a GET with the token, and the field holding the key. */
    key: z.object({ url: https, field: answerPath }).strict(),
    /** Recommended servers, best first: a GET without the token. */
    servers: z
      .object({
        url: https,
        /** Where the list is in the answer; absent when the answer is the list. */
        list: answerPath.optional(),
        /** Each server's address to connect to (an IPv4 address or a host name). */
        host: answerPath,
        /** Each server's WireGuard public key. */
        publicKey: answerPath,
        /** The query parameter that narrows the list to a country, given the country's id. */
        country: queryName.optional(),
      })
      .strict(),
    /** The countries the owner can pick from: a GET without the token. */
    countries: z
      .object({
        url: https,
        list: answerPath.optional(),
        id: answerPath,
        name: answerPath,
        /** A short code the owner can type instead of the name. */
        code: answerPath.optional(),
      })
      .strict()
      .optional(),
    /** What every server shares: the tunnel's address, the servers' port and the DNS servers. */
    tunnel: z
      .object({
        address: z
          .string()
          .regex(
            /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/,
            'An IPv4 address with its prefix, like 10.5.0.2/32.',
          )
          .refine((v) => isIP(v.split('/')[0] ?? '') === 4, 'An IPv4 address with its prefix.'),
        port: z.number().int().min(1).max(65_535),
        dns: z.array(ipv4).min(1).max(4),
      })
      .strict(),
  })
  .strict()
export type TokenConnect = z.infer<typeof tokenConnectSchema>

/** RFC 6886 to the tunnel's gateway, as Proton documents it. */
const natpmp = z.object({
  method: z.literal('natpmp'),
  /** The gateway inside the tunnel the requests go to. */
  gateway: z.string().refine((v) => isIP(v) === 4, 'The gateway is an IPv4 address.'),
  /** The lifetime asked for each mapping, in seconds. */
  lifetimeSeconds: z.number().int().min(30).max(86_400),
  /** How often the mappings are asked for again; less than the lifetime. */
  renewSeconds: z.number().int().min(10).max(86_400),
})

export const portForwardingSchema = z.discriminatedUnion('method', [
  natpmp,
  /** PIA's getSignature and bindPort (pia-foss/manual-connections, port_forwarding.sh). */
  z.object({ method: z.literal('pia') }),
  /** A port the provider reserves in its account, typed in. */
  z.object({ method: z.literal('static') }),
  /** No port forwarding: the check's row says so. */
  z.object({ method: z.literal('none') }),
])
export type PortForwarding = z.infer<typeof portForwardingSchema>

export const vpnProviderSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Lowercase letters, digits and hyphens.'),
    version: semver,
    minEngineVersion: semver,
    name: z.string().min(1).max(60),
    /** A file in the catalog's `logos/`. */
    logo: z
      .string()
      .regex(/^[a-z0-9-]+\.(svg|png)$/)
      .optional(),
    connect: z.enum(CONNECT_METHODS),
    /** Where to find what highsea needs in the provider's account, in order. */
    steps: z.array(line).min(1).max(8),
    /** The provider's own pages the steps point to. */
    links: z
      .array(z.object({ label: z.string().min(1).max(80), url: https }))
      .max(5)
      .default([]),
    portForwarding: portForwardingSchema,
    /** Whether the provider's tunnels carry IPv6. */
    ipv6: z.boolean(),
    /** `connect: token`'s API: where the key and a server are, and the tunnel's fixed facts. */
    token: tokenConnectSchema.optional(),
    /**
     * PIA's regions by name, used when its server list can't be read; with `connect: token`, the
     * countries the owner can pick, matched by name against the live list as highsea connects.
     */
    regions: z.array(z.string().min(1).max(60)).max(200).optional(),
    /**
     * The provider's own connection check, where it documents one: a JSON page that answers `field`
     * true when the request came through its tunnel (Mullvad's am.i.mullvad.net/json).
     */
    check: z.object({ url: https, field: z.string().regex(/^[a-z_][a-z0-9_]{0,40}$/i) }).optional(),
    /** The provider's documentation each fact comes from. */
    sources: z.array(https).min(1).max(10),
  })
  .strict()
export type VpnProviderDefinition = z.infer<typeof vpnProviderSchema>

export type ProviderIssue = { path: string; message: string }
export type ProviderValidation =
  | { ok: true; definition: VpnProviderDefinition }
  | { ok: false; errors: ProviderIssue[] }

/**
 * The shape, plus what a shape can't say: PIA's API connects and forwards together, and a token
 * block goes with `connect: token`.
 */
export function validateVpnProvider(input: unknown): ProviderValidation {
  const parsed = vpnProviderSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    }
  const d = parsed.data
  const errors: ProviderIssue[] = []
  const pf = d.portForwarding
  if (pf.method === 'pia' && d.connect !== 'pia')
    errors.push({
      path: 'portForwarding.method',
      message: 'PIA’s port forwarding needs connect: pia.',
    })
  if (d.connect === 'pia' && !d.regions?.length)
    errors.push({
      path: 'regions',
      message: 'connect: pia needs a list of regions to fall back on.',
    })
  if (d.connect === 'token' && !d.token)
    errors.push({ path: 'token', message: 'connect: token needs a token block.' })
  if (d.token && d.connect !== 'token')
    errors.push({ path: 'token', message: 'A token block needs connect: token.' })
  if (d.connect === 'token' && d.token?.servers.country && !d.token.countries)
    errors.push({
      path: 'token.countries',
      message: 'A country filter needs the countries list to find the id.',
    })
  if (d.connect === 'token' && d.regions?.length && !d.token?.servers.country)
    errors.push({
      path: 'regions',
      message: 'Countries to pick from need token.servers.country to filter by.',
    })
  if (pf.method === 'natpmp' && pf.renewSeconds >= pf.lifetimeSeconds)
    errors.push({
      path: 'portForwarding.renewSeconds',
      message: 'Renew before the mapping expires: renewSeconds must be less than lifetimeSeconds.',
    })
  return errors.length ? { ok: false, errors } : { ok: true, definition: d }
}

/** One line per problem, for logs and the pipeline's output. */
export function formatProviderIssues(issues: readonly ProviderIssue[]): string {
  return issues.map((i) => `${i.path || '(root)'}: ${i.message}`).join('\n')
}
