// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Security (ADR 0021). Signing in and Single sign-on follow the prototype's copy
// (design/prototypes/src/admin/settings/reference.tsx); proxy sign-in, which the prototype doesn't
// show and the API has, removing the client secret, and the field errors are added in its voice.
import { defineMessages } from '@highsea-tv/i18n'

export const security = defineMessages({
  what: 'these settings',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
  'signIn.title': 'Signing in',
  twoFactor: 'Require two-step for the owner and admins',
  twoFactorHint:
    'A code from an authenticator app, after the password, to open the admin. Apps never ask for it.',
  passkeys: 'Allow passkeys',
  passkeysHint: 'Sign in with Face ID, Touch ID or a security key.',
  sessionDays: 'Stay signed in for',
  sessionDaysHint: 'On the admin. Apps stay signed in until their device is signed out.',
  days: '{count, plural, one {# day} other {# days}}',
  proxyAuth: 'Trust a sign-in header from my proxy',
  proxyAuthHint:
    'For Authelia, Authentik and other forward-auth proxies. It names an existing account, and only the trusted proxies in Network can send it.',
  proxyHeader: 'Header',
  'proxyHeader.invalid': 'Use a header name like Remote-User.',
  'oidc.title': 'Single sign-on (OIDC)',
  'oidc.description': 'Sign in with Authentik, Authelia, Keycloak or any OpenID Connect provider.',
  'oidc.enabled': 'Offer single sign-on',
  'oidc.name': 'Button label',
  'oidc.nameHint': 'Sign in with {name}',
  'oidc.clientId': 'Client ID',
  'oidc.clientId.missing': 'Paste the client ID from your provider.',
  'oidc.issuer': 'Issuer URL',
  'oidc.issuer.invalid': 'Use the provider’s https address, like https://auth.example.net.',
  'oidc.secret': 'Client secret',
  'oidc.secretHint': 'Stored encrypted. Paste a new one to replace it.',
  'oidc.secretNone': 'None stored. Paste the one from your provider.',
  'oidc.secretRemove': 'Remove the stored secret',
  'oidc.secretRemoved': 'The stored secret goes when you save.',
  'oidc.secretKeep': 'Keep it',
  'oidc.redirect': 'Redirect URL',
  'oidc.redirectHint': 'Give this to your provider.',
  'oidc.redirectMissing':
    'Single sign-on needs the server’s external URL, so the provider can send people back. Set it in Network.',
  'oidc.openNetwork': 'Open Network',
  copy: 'Copy',
  copied: 'Copied',
})
