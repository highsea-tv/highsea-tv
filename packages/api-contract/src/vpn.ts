// SPDX-License-Identifier: AGPL-3.0-only
// VPN connections (docs/product/vpn.md, checkpoint 6a): Settings › VPN's settings and status, the
// checks, and the compose block the container mode shows. The status is staff's, as Downloads
// shows it; everything that changes the connection is the owner's, with the other network
// settings (ADR 0032's answers).
import { createRoute, z } from '@hono/zod-openapi'
import { API_PREFIX, access, body, errors, IsoDate, json } from './common.ts'

export const VPN_MODES = ['builtin', 'container', 'interface', 'off'] as const
export const VPN_STATES = ['off', 'connecting', 'connected', 'down', 'failed'] as const

export const VpnSettings = z
  .object({
    mode: z.enum(VPN_MODES),
    provider: z.string(),
    /** The uploaded WireGuard configuration's file name; its keys stay on the server. */
    configName: z.string().nullable(),
    piaUsername: z.string(),
    piaPasswordSet: z.boolean(),
    piaRegion: z.string(),
    staticPort: z.number().int().nullable(),
    containerUrl: z.string(),
    containerKeySet: z.boolean(),
    interface: z.string(),
    useForwardedPort: z.boolean(),
    indexersThroughVpn: z.boolean(),
    echoUrl: z.string(),
  })
  .openapi('VpnSettings')

/** The secrets are write-only: absent or empty keeps what's stored. */
export const VpnSettingsInput = VpnSettings.omit({ piaPasswordSet: true, containerKeySet: true })
  .extend({
    staticPort: z.number().int().min(1).max(65_535).nullable(),
    /** A new WireGuard configuration's text. */
    config: z.string().max(20_000),
    piaPassword: z.string().max(1000),
    containerKey: z.string().max(1000),
  })
  .partial()
  .openapi('VpnSettingsInput')

export const VpnCheck = z
  .object({
    id: z.enum(['tunnel', 'exit', 'names', 'killSwitch', 'portForwarding', 'ipv6']),
    label: z.string(),
    result: z.enum(['pass', 'warn', 'fail', 'info', 'pending']),
    title: z.string(),
    detail: z.string().optional(),
  })
  .openapi('VpnCheck')

export const VpnStatus = z
  .object({
    mode: z.enum(VPN_MODES),
    provider: z.string().nullable(),
    state: z.enum(VPN_STATES),
    /** The failing step's copy, when `state` is failed. */
    message: z.string().nullable(),
    /** Failed for want of NET_ADMIN: the page shows the compose lines to add. */
    needsCapability: z.boolean(),
    exitIp: z.string().nullable(),
    country: z.string().nullable(),
    forwardedPort: z.number().int().nullable(),
    checks: z.array(VpnCheck),
    checkedAt: IsoDate.nullable(),
  })
  .openapi('VpnStatus')

export const VpnProvider = z
  .object({
    id: z.string(),
    name: z.string(),
    connect: z.enum(['config', 'account']),
    steps: z.array(z.string()),
    portForwarding: z.enum(['natpmp', 'pia', 'static', 'none']),
    ipv6: z.boolean(),
    regions: z.array(z.string()).optional(),
  })
  .openapi('VpnProvider')

export const VpnInterface = z
  .object({ name: z.string(), ipv4: z.string().nullable(), ipv6: z.string().nullable() })
  .openapi('VpnInterface')

export const VpnComposeInput = z
  .object({
    provider: z.string().max(60),
    /** A key to write in, such as one gluetun's `genkey` made; else a placeholder. */
    apiKey: z.string().max(128).optional(),
  })
  .openapi('VpnComposeInput')

const VPN = `${API_PREFIX}/vpn`

const ownerPost = (path: string, summary: string) =>
  createRoute({
    method: 'post',
    path: `${VPN}/${path}`,
    tags: ['VPN'],
    summary,
    ...access('owner'),
    responses: {
      200: json(VpnStatus, 'The status afterwards'),
      ...errors('unauthorized', 'forbidden'),
    },
  })

export const vpn = {
  status: createRoute({
    method: 'get',
    path: `${VPN}/status`,
    tags: ['VPN'],
    summary: 'The mode, the tunnel’s state, the exit address and the checks',
    ...access('staff'),
    responses: { 200: json(VpnStatus, 'The status'), ...errors('unauthorized', 'forbidden') },
  }),
  check: ownerPost('check', 'Run the checks now'),
  reconnect: ownerPost('reconnect', 'Restart the tunnel, or look at the interface again'),
  providers: createRoute({
    method: 'get',
    path: `${VPN}/providers`,
    tags: ['VPN'],
    summary: 'The providers Settings › VPN offers, with their steps',
    ...access('owner'),
    responses: {
      200: json(z.array(VpnProvider), 'The providers'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  interfaces: createRoute({
    method: 'get',
    path: `${VPN}/interfaces`,
    tags: ['VPN'],
    summary: 'The network interfaces on this machine, for the interface mode',
    ...access('owner'),
    responses: {
      200: json(z.array(VpnInterface), 'The interfaces'),
      ...errors('unauthorized', 'forbidden'),
    },
  }),
  compose: createRoute({
    method: 'post',
    path: `${VPN}/compose`,
    tags: ['VPN'],
    summary: 'The compose block for gluetun beside highsea',
    ...access('owner'),
    request: { ...body(VpnComposeInput) },
    responses: {
      200: json(z.object({ yaml: z.string() }), 'The block'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
  settings: createRoute({
    method: 'get',
    path: `${API_PREFIX}/settings/vpn`,
    tags: ['Settings'],
    summary: 'Settings › VPN',
    ...access('owner'),
    responses: { 200: json(VpnSettings, 'The settings'), ...errors('unauthorized', 'forbidden') },
  }),
  save: createRoute({
    method: 'put',
    path: `${API_PREFIX}/settings/vpn`,
    tags: ['Settings'],
    summary: 'Save Settings › VPN, and reconnect with them',
    description:
      'The container mode’s address and key are tried against gluetun first: 400 with `details.field` when it refuses or can’t be reached.',
    ...access('owner'),
    request: { ...body(VpnSettingsInput) },
    responses: {
      200: json(VpnSettings, 'Saved'),
      ...errors('invalid', 'unauthorized', 'forbidden'),
    },
  }),
} as const

export type VpnSettings = z.infer<typeof VpnSettings>
export type VpnSettingsInput = z.infer<typeof VpnSettingsInput>
export type VpnCheck = z.infer<typeof VpnCheck>
export type VpnStatus = z.infer<typeof VpnStatus>
export type VpnProvider = z.infer<typeof VpnProvider>
export type VpnInterface = z.infer<typeof VpnInterface>
export type VpnComposeInput = z.infer<typeof VpnComposeInput>
