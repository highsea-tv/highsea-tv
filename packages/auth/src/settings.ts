// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Security (settings.md), stored in the `security` settings row. The OIDC client
// secret is sealed with the server's key and never leaves the server.

export type SecuritySettings = {
  /**
   * Whether the owner and admins must use two-step verification in the admin, the only people who
   * open it (ADR 0032). Apps are never blocked by it (ADR 0024).
   */
  twoFactor: boolean
  passkeys: boolean
  /** How long an admin session lasts. Apps stay signed in until their device is signed out. */
  sessionDays: number
  oidc: {
    enabled: boolean
    /** The button's label: "Sign in with {name}". */
    name: string
    issuer: string
    clientId: string
    clientSecretSealed: string | null
  }
  /** Sign-in by a forward-auth proxy's header (Authelia, Authentik), from trusted proxies only. */
  proxyAuth: { enabled: boolean; header: string }
}

export const SECURITY_KEY = 'security'

export const SESSION_DAYS = [1, 7, 30, 90] as const

export const defaultSecuritySettings: SecuritySettings = {
  // on for new servers; migration 0004 keeps an older server's choice
  twoFactor: true,
  passkeys: true,
  sessionDays: 30,
  oidc: { enabled: false, name: '', issuer: '', clientId: '', clientSecretSealed: null },
  proxyAuth: { enabled: false, header: 'Remote-User' },
}
