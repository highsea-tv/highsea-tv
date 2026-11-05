// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Network and remote access (ADR 0021). The groups follow the prototype's copy
// (design/prototypes/src/admin/settings/reference.tsx); what it doesn't show and the API has (the
// HTTPS port, why built-in TLS isn't serving, the addresses on this network, the discovery port)
// and the field errors are added in its voice.
import { defineMessages } from '@highsea-tv/i18n'

export const network = defineMessages({
  what: 'these settings',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
  ownerOnly: 'Only the owner can change how the server is reached.',
  thisServer: 'the server',
  'remote.title': 'Remote access',
  'remote.description':
    'The address the apps use away from home. On the LAN they find the server on their own.',
  externalUrl: 'External URL',
  'externalUrl.invalid': 'Use a full address, like https://harbor.example.net.',
  'tls.title': 'Reverse proxy and TLS',
  tls: 'TLS',
  'tls.proxy': 'My proxy handles it',
  'tls.built-in': 'Built in',
  'tls.off': 'Off (LAN only)',
  'tls.builtInHint': 'highsea serves HTTPS itself, on its own port.',
  'tls.offWarning': 'Without TLS, passwords cross the network in the clear. Keep it to the LAN.',
  httpsPort: 'HTTPS port',
  'httpsPort.invalid': 'Use a port from 1024 to 65535.',
  trustedProxies: 'Trusted proxies',
  trustedProxiesHint:
    'Addresses whose forwarded headers highsea believes, separated by commas. Ranges work too, like 172.16.0.0/12.',
  proxyHeaders: 'Use X-Forwarded-For and X-Forwarded-Proto',
  proxyHeadersHint: 'Only from the trusted proxies above.',
  'discovery.title': 'Discovery',
  discovery: 'Let apps on this network find {name}',
  discoveryHint:
    'Answers UDP broadcasts and mDNS. In Docker it needs host networking or the published UDP port {port}.',
  addresses: 'On this network',
  'addresses.none': 'No network addresses found.',
})
