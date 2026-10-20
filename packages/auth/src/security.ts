// SPDX-License-Identifier: AGPL-3.0-only
// Reading and saving Settings › Security. The OIDC client secret is write-only: it's sealed on
// save and the API only says whether one is set.
import { AppError } from '@highsea/core'
import { writeSetting } from '@highsea/db'
import type { Ctx, RequestMeta } from './context.ts'
import {
  SECURITY_KEY,
  SESSION_DAYS,
  type SecuritySettings,
  type TwoFactorPolicy,
} from './settings.ts'

export type SecurityView = Omit<SecuritySettings, 'oidc'> & {
  oidc: Omit<SecuritySettings['oidc'], 'clientSecretSealed'> & { clientSecretSet: boolean }
}

export type SecurityInput = {
  twoFactor: TwoFactorPolicy
  passkeys: boolean
  sessionDays: number
  oidc: {
    enabled: boolean
    name: string
    issuer: string
    clientId: string
    /** A new secret; omitted keeps the current one, null removes it. */
    clientSecret?: string | null
  }
  proxyAuth: { enabled: boolean; header: string }
}

export function securityView(ctx: Ctx): SecurityView {
  const { oidc, ...rest } = ctx.security()
  const { clientSecretSealed, ...shown } = oidc
  return { ...rest, oidc: { ...shown, clientSecretSet: clientSecretSealed !== null } }
}

// an HTTP field name is a token (RFC 9110 § 5.1)
const FIELD_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/

export function saveSecurity(
  ctx: Ctx,
  input: SecurityInput,
  actor: { id: string; name: string },
  meta: RequestMeta,
): SecurityView {
  const current = ctx.security()
  if (!(SESSION_DAYS as readonly number[]).includes(input.sessionDays))
    throw new AppError('invalid', 'Choose 1, 7, 30 or 90 days.', { field: 'sessionDays' })
  const issuer = input.oidc.issuer.trim()
  if (input.oidc.enabled) {
    let url: URL | null = null
    try {
      url = new URL(issuer)
    } catch {}
    // OIDC Discovery § 2: the issuer is an https URL with no query or fragment
    if (url?.protocol !== 'https:' || url.search || url.hash)
      throw new AppError(
        'invalid',
        'Use the provider’s https address, like https://auth.example.net.',
        {
          field: 'oidc.issuer',
        },
      )
    if (!input.oidc.clientId.trim())
      throw new AppError('invalid', 'Paste the client id from your provider.', {
        field: 'oidc.clientId',
      })
    if (!ctx.addresses().externalUrl)
      throw new AppError(
        'invalid',
        'Single sign-on needs the server’s external URL, so the provider can send people back.',
        {
          field: 'oidc.enabled',
          reason: 'external-url-missing',
        },
      )
  }
  const header = input.proxyAuth.header.trim()
  if (!FIELD_NAME.test(header))
    throw new AppError('invalid', 'Use a header name like Remote-User.', {
      field: 'proxyAuth.header',
    })
  const clientSecretSealed =
    input.oidc.clientSecret === undefined
      ? current.oidc.clientSecretSealed
      : input.oidc.clientSecret
        ? ctx.sealer.seal(input.oidc.clientSecret)
        : null
  const next: SecuritySettings = {
    twoFactor: input.twoFactor,
    passkeys: input.passkeys,
    sessionDays: input.sessionDays,
    oidc: {
      enabled: input.oidc.enabled,
      name: input.oidc.name.trim(),
      issuer,
      clientId: input.oidc.clientId.trim(),
      clientSecretSealed,
    },
    proxyAuth: { enabled: input.proxyAuth.enabled, header },
  }
  writeSetting(ctx.db, SECURITY_KEY, next, ctx.now())
  ctx.audit({
    action: 'settings.security',
    actor,
    address: meta.address,
    detail: {
      twoFactor: next.twoFactor,
      passkeys: next.passkeys,
      sessionDays: next.sessionDays,
      oidc: next.oidc.enabled,
      proxyAuth: next.proxyAuth.enabled,
    },
  })
  ctx.events.emit({ topic: 'settings.updated', ids: ['security'] })
  return securityView(ctx)
}
