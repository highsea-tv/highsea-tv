// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Users and devices, Network, Security and VPN (one-client-platform-d.md › D3),
// answered from the mock's api in the contract's shapes. The transport's access check has
// already turned away anyone the route isn't for (owner or staff), so these answer only what the
// server decides past that: its refusals with their `details.field`, and the fields the mock's
// own settings never kept (Network's remote access and HTTPS port, Security's client secret and
// proxy sign-in, the VPN's echo address), held here per server kind with the server's defaults.
// `users.list` and `vpn.status` are the dashboard's answers (dashboard.ts); `devices.revoke` and
// `me.devices` the transport's.
// `vpn.compose` is `@highsea-tv/vpn`'s own `composeFor` (its `./compose` subpath, which imports
// nothing), so the text is defined once.
import type { routes } from '@highsea-tv/api-contract'
import { createT, defineMessages } from '@highsea-tv/i18n'
import type { Output } from '@highsea-tv/sdk'
import { composeFor } from '@highsea-tv/vpn/compose'
import type { VpnSettings } from '../vpn.ts'
import { type AdminKit, type Answers, type Ctx, refuse } from './kit.ts'

type Routes = typeof routes
type SecurityOut = Output<Routes['settings']['security']>
type NetworkOut = Output<Routes['settings']['network']>
type VpnOut = Output<Routes['vpn']['settings']>

export const peopleMessages = defineMessages({
  'users.unknown': 'There’s no one with that id.',
  'users.notInvited': 'They’ve already finished their account. Reset their password instead.',
  'security.sessionDays': 'Choose 1, 7, 30 or 90 days.',
  'security.issuer': 'Use the provider’s https address, like https://auth.example.net.',
  'security.clientId': 'Paste the client id from your provider.',
  'security.externalUrl':
    'Single sign-on needs the server’s external URL, so the provider can send people back.',
  'security.header': 'Use a header name like Remote-User.',
  'vpn.echoUrl': 'Enter the address of an IP echo service, starting with http:// or https://.',
  'vpn.provider': 'That provider isn’t one highsea knows.',
})

const t = createT(peopleMessages)

const DAY = 86_400_000
/** packages/auth's choices of how long a sign-in lasts. */
const SESSION_DAYS = [1, 7, 30, 90]
/** An HTTP field name is a token (RFC 9110 § 5.1), as packages/auth checks it. */
const FIELD_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
/** The server's default echo service (packages/vpn's echo.ts). */
const DEFAULT_ECHO_URL = 'https://ifconfig.co/json'
/** The mock's machine: its own addresses and the discovery port (ADR 0020's default). */
const LOCAL_ADDRESSES = ['http://192.168.1.20:3000', 'http://harbor.local:3000']
const DISCOVERY_PORT = 7359

const invalid = (message: string, field: string, details: Record<string, unknown> = {}) =>
  refuse('invalid', message, { field, ...details })

/** What the server keeps that the mock's settings don't, per server kind. */
type Extra = {
  remoteAccess: NetworkOut['remoteAccess']
  httpsPort: number
  clientSecretSet: boolean
  proxyAuth: SecurityOut['proxyAuth']
  echoUrl: string
}

export function peopleAnswers({ wall, emit, userOf, devicesOf }: AdminKit): Answers {
  const extras = new Map<string, Extra>()
  const extra = (ctx: Ctx): Extra => {
    let e = extras.get(ctx.srv.kind)
    if (!e) {
      // the seeded Authentik sign-in has its secret, as the owner set it up
      e = {
        remoteAccess: 'reverse-proxy',
        httpsPort: 8443,
        clientSecretSet: true,
        proxyAuth: { enabled: false, header: 'Remote-User' },
        echoUrl: DEFAULT_ECHO_URL,
      }
      extras.set(ctx.srv.kind, e)
    }
    return e
  }

  const userAt = (ctx: Ctx, id: string) => {
    const u = ctx.srv.state.users.find((x) => x.id === id)
    if (!u) throw refuse('not-found', t('users.unknown'))
    return u
  }

  /** A single-use link, valid for a week, as the server's invites and resets are. */
  const linkFor = (ctx: Ctx, kind: 'invite' | 'reset', username: string) => {
    const now = ctx.srv.clock.now()
    return {
      link: `https://harbor.example.net/${kind}/${username.slice(0, 3).toUpperCase()}-${(now % 9000) + 1000}`,
      expiresAt: wall(new Date(now + 7 * DAY).toISOString()),
      // the mock has no mail server, so links are only shown to copy
      emailedTo: null,
    }
  }

  const keyOf = (k: ReturnType<Ctx['api']['apiKeys']['list']>[number]) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    scope: k.scope,
    userId: k.userId,
    createdAt: wall(k.createdAt),
    lastUsed: k.lastUsed && wall(k.lastUsed),
  })

  const networkOf = (ctx: Ctx): NetworkOut => {
    const e = extra(ctx)
    return {
      ...ctx.api.settings.get('network'),
      remoteAccess: e.remoteAccess,
      httpsPort: e.httpsPort,
      localAddresses: LOCAL_ADDRESSES,
      discoveryPort: DISCOVERY_PORT,
      tlsProblem: null,
    }
  }

  const securityOf = (ctx: Ctx): SecurityOut => {
    const s = ctx.api.settings.get('security')
    const e = extra(ctx)
    return {
      twoFactor: s.twoFactor,
      passkeys: s.passkeys,
      sessionDays: s.sessionDays,
      oidc: { ...s.oidc, clientSecretSet: e.clientSecretSet },
      proxyAuth: e.proxyAuth,
    }
  }

  const vpnOf = (ctx: Ctx): VpnOut => {
    const { config: _c, piaPassword: _p, containerKey: _k, ...v } = ctx.api.settings.get('vpn')
    return { ...v, echoUrl: extra(ctx).echoUrl }
  }

  return {
    users: {
      invite: ({ body }, ctx) => {
        const { user } = ctx.api.users.invite({
          displayName: body.displayName,
          role: body.role,
          libraries: body.libraries,
        } as Parameters<Ctx['api']['users']['invite']>[0])
        return { user: userOf(user), ...linkFor(ctx, 'invite', user.username) }
      },
      update: ({ params, body }, ctx) => {
        const { displayName, ...rest } = body
        const u = ctx.api.users.update(params.id, rest)
        if (displayName?.trim()) {
          u.displayName = displayName.trim()
          emit('users.updated')
        }
        return userOf(u)
      },
      remove: ({ params }, ctx) => {
        ctx.api.users.remove(params.id)
      },
      resetPassword: ({ params }, ctx) => linkFor(ctx, 'reset', userAt(ctx, params.id).username),
      resetTwoFactor: ({ params }, ctx) => {
        userAt(ctx, params.id).twoFactor = false
        emit('users.updated')
      },
      inviteLink: ({ params }, ctx) => {
        const u = userAt(ctx, params.id)
        if (!u.invited) throw refuse('invalid', t('users.notInvited'))
        return linkFor(ctx, 'invite', u.username)
      },
    },

    devices: {
      list: ({ query }, ctx) =>
        devicesOf(ctx).filter((d) => !query.userId || d.userId === query.userId),
    },

    apiKeys: {
      list: (_, ctx) => ctx.api.apiKeys.list().map(keyOf),
      create: ({ body }, ctx) => {
        const k = ctx.api.apiKeys.create(
          body.name,
          // the mock's keys are read or full; Wanted's calendar key isn't made here
          body.scope as Parameters<Ctx['api']['apiKeys']['create']>[1],
        )
        return { ...keyOf(k), secret: k.secret }
      },
      revoke: ({ params }, ctx) => {
        ctx.api.apiKeys.revoke(params.id)
      },
    },

    settings: {
      network: (_, ctx) => networkOf(ctx),
      saveNetwork: ({ body }, ctx) => {
        const { remoteAccess, httpsPort, ...kept } = body
        ctx.api.settings.save('network', kept)
        Object.assign(extra(ctx), { remoteAccess, httpsPort })
        return networkOf(ctx)
      },
      security: (_, ctx) => securityOf(ctx),
      // packages/auth's saveSecurity, in its order
      saveSecurity: ({ body }, ctx) => {
        if (!SESSION_DAYS.includes(body.sessionDays))
          throw invalid(t('security.sessionDays'), 'sessionDays')
        const issuer = body.oidc.issuer.trim()
        if (body.oidc.enabled) {
          let url: URL | null = null
          try {
            url = new URL(issuer)
          } catch {}
          if (url?.protocol !== 'https:' || url.search || url.hash)
            throw invalid(t('security.issuer'), 'oidc.issuer')
          if (!body.oidc.clientId.trim()) throw invalid(t('security.clientId'), 'oidc.clientId')
          if (!ctx.api.settings.get('network').externalUrl)
            throw invalid(t('security.externalUrl'), 'oidc.enabled', {
              reason: 'external-url-missing',
            })
        }
        const header = body.proxyAuth.header.trim()
        if (!FIELD_NAME.test(header)) throw invalid(t('security.header'), 'proxyAuth.header')
        const { clientSecret, ...oidc } = body.oidc
        ctx.api.settings.save('security', {
          twoFactor: body.twoFactor,
          passkeys: body.passkeys,
          sessionDays: body.sessionDays,
          oidc: { ...oidc, name: oidc.name.trim(), issuer, clientId: oidc.clientId.trim() },
        })
        const e = extra(ctx)
        if (clientSecret !== undefined) e.clientSecretSet = !!clientSecret
        e.proxyAuth = { enabled: body.proxyAuth.enabled, header }
        return securityOf(ctx)
      },
    },

    vpn: {
      settings: (_, ctx) => vpnOf(ctx),
      // the mock's saveVpn checks the connection and reconnects; the echo address is kept here
      save: ({ body }, ctx) => {
        const { echoUrl, ...input } = body
        const echo = echoUrl?.trim()
        if (echo !== undefined && !/^https?:\/\/[^\s/]+/.test(echo))
          throw invalid(t('vpn.echoUrl'), 'echoUrl')
        const current = ctx.api.settings.get('vpn')
        ctx.api.settings.save('vpn', { ...current, ...input } as VpnSettings)
        if (echo !== undefined) extra(ctx).echoUrl = echo
        return vpnOf(ctx)
      },
      providers: (_, ctx) => ctx.api.vpn.providers(),
      // the server's check, then its text (apps/server/src/api/downloads.ts)
      compose: ({ body }, ctx) => {
        if (!ctx.api.vpn.providers().some((p) => p.id === body.provider))
          throw refuse('invalid', t('vpn.provider'), { field: 'provider' })
        return { yaml: composeFor(body) }
      },
      // the machine's interfaces, as the prototype offers them
      interfaces: () => [
        { name: 'eth0', ipv4: '192.168.1.20', ipv6: null },
        { name: 'wg0', ipv4: '10.2.0.15', ipv6: null },
        { name: 'tun0', ipv4: '10.8.0.6', ipv6: null },
      ],
      check: (_, ctx) => {
        const s = ctx.api.vpn.check()
        return { ...s, checkedAt: s.checkedAt && wall(s.checkedAt) }
      },
      reconnect: (_, ctx) => {
        const s = ctx.api.vpn.reconnect()
        return { ...s, checkedAt: s.checkedAt && wall(s.checkedAt) }
      },
    },
  }
}
