// SPDX-License-Identifier: AGPL-3.0-only
// @highsea-tv/schemas/vpn: the VPN provider format, the catalog's `vpn-providers` kind
// (docs/plans/phase-3-checkpoint-6.md › Providers, ADR 0042). Facts are data, mechanisms are code:
// an entry says which of highsea's mechanisms a provider uses (a WireGuard configuration file or
// PIA's API to connect; NAT-PMP, PIA's API, a typed-in port or nothing to forward a port), and
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
export const VPN_ENGINE_VERSION = '1.0.0'

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

/** How highsea connects: a configuration file the owner uploads, or PIA's API. */
export const CONNECT_METHODS = ['config', 'pia'] as const

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
    /** PIA's regions by name, used when its server list can't be read. */
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

/** The shape, plus what a shape can't say: PIA's API connects and forwards together. */
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
