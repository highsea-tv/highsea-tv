// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN (ADR 0021), in the prototype's copy (design/prototypes/src/admin/settings/vpn.tsx).
// The lines the server writes, a provider's steps, a check's title and a failure's message, come
// with the data. Added here: the interface list's empty state and the save errors.
import { defineMessages } from '@highsea-tv/i18n'

export const vpn = defineMessages({
  what: 'these settings',
  saved: 'Settings saved',
  saveError: 'Couldn’t save',
  'mode.legend': 'Mode',
  'mode.builtin': 'Built-in VPN',
  'mode.builtin.line':
    'highsea runs a WireGuard tunnel to your provider. Only torrents use it, and they can’t leave outside it.',
  'mode.container': 'A VPN container',
  'mode.container.line':
    'highsea shares a gluetun container’s network and reads its status and forwarded port.',
  'mode.interface': 'An interface on this machine',
  'mode.interface.line':
    'Torrents are bound to a tunnel you run yourself. Your system’s routing decides the path.',
  'mode.off': 'Off',
  'mode.off.line': 'Torrents use your own connection. Anyone in the swarm can see your address.',
  recommended: 'Recommended',

  'status.title': 'Status',
  'state.off': 'No VPN',
  'state.off.line': 'Torrents use your own connection. Anyone in the swarm can see your address.',
  'state.connecting': 'Connecting to {provider}…',
  'state.connecting.line': 'Torrents wait until the tunnel is up.',
  'state.bound': 'Bound to {provider}',
  'state.connected': 'Connected through {provider}',
  'state.connected.line': 'All torrent traffic leaves through {ip} ({country}).',
  'state.connected.lineNoCountry': 'All torrent traffic leaves through {ip}.',
  'state.connected.lineNoIp': 'All torrent traffic goes through the tunnel.',
  'state.down': '{provider} is down',
  'state.down.line':
    'Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection.',
  'state.capability': 'highsea can’t run the tunnel yet',
  'state.hostNetwork': 'highsea is on host networking',
  'state.failed': 'Couldn’t connect',
  checks: 'Checks',
  'mark.pass': 'Passed',
  'mark.warn': 'Warning',
  'mark.fail': 'Failed',
  'mark.info': 'Note',
  'mark.pending': 'Waiting',
  checkNow: 'Check now',
  checkedNow: 'Checked just now',
  checkError: 'Couldn’t run the checks',
  reconnect: 'Reconnect',
  reconnectError: 'Couldn’t reconnect',
  checkedAgo: 'Checked {ago}',
  // HT-82: Test, in the other settings pages' pattern, for the settings on the page
  test: 'Test',
  'test.hint':
    'Tries these settings without saving them. The built-in VPN brings its tunnel up for a moment; torrents don’t use it.',
  'test.ok': 'These settings work.',
  'test.okWarnings': 'These settings work. A line below has a warning.',
  'test.failed': 'These settings don’t work yet. The line marked below says why.',
  'test.results': 'Test results',
  // one-compose-file.md's part B, approved 2026-11-07: the status points to the mode's compose lines
  capabilityHelp: 'Compose for the built-in VPN, under Connection, has the lines to add.',
  composeLines: 'Compose lines',
  copy: 'Copy',
  copied: 'Copied',
  copyError: 'Couldn’t copy',
  copyErrorDetail: 'Select the text instead.',

  'connection.title': 'Connection',
  'connection.description': 'How torrents reach your VPN.',
  interface: 'Interface',
  interfaceHint: 'The ones this server has, besides the LAN.',
  interfaceChoose: 'Choose an interface',
  interfaceNone: 'This server has no network interfaces besides loopback.',
  provider: 'Provider',
  username: 'Username',
  password: 'Password',
  secretSet: 'Set. Type a new one to replace it.',
  region: 'Region',
  regionHint: 'Each forwards a port.',
  // HT-87: connecting with an access token
  token: 'Access token',
  tokenHint:
    'highsea sends it to {provider} for your WireGuard key and a server before the tunnel is up. Nothing else leaves outside the tunnel.',
  country: 'Country',
  countryHint: 'highsea asks for a recommended server there each time it connects.',
  countryAny: 'Any country',
  configInstead: 'Or a WireGuard configuration you wrote',
  config: 'WireGuard configuration',
  configReplace: 'Replace the file',
  configUpload: 'Upload a file',
  configPaste: 'Paste instead',
  configHide: 'Hide',
  configKept: '· its keys stay on the server',
  configPasteLabel: 'Paste the configuration',
  staticPort: 'Forwarded port',
  staticPortHint: 'Optional. Leave it empty if there isn’t one.',
  controlServer: 'Control server',
  controlServerHint: 'The containers share a network, so gluetun is on this machine’s loopback.',
  controlServerInvalid: 'Use a full address, like http://127.0.0.1:8000.',
  apiKey: 'API key',
  apiKeyHint: 'gluetun’s genkey makes one.',
  compose: 'Compose for your provider',
  composeBody:
    'A gluetun service for your compose file, with highsea joined to its network. Fill in what your provider gives you; highsea never gets the Docker socket.',
  composeBlock: 'Compose block',
  composeError: 'Couldn’t make the compose block.',
  'compose.builtin': 'Compose for the built-in VPN',
  'compose.builtin.body':
    'The lines highsea’s service needs for the tunnel. Add them to highsea in your compose file, take out network_mode: host, then recreate the container. The capability reaches only highsea’s own container, not the host. Apps on your network still find the server by its broadcast on port 7368.',

  'behaviour.title': 'Behaviour',
  stopWhenDown: 'Stop torrents when the VPN is down',
  'stopWhenDown.builtin':
    'Always on with the built-in VPN: a packet from the tunnel’s address can’t leave any other way.',
  'stopWhenDown.container': 'Always on in a VPN container: it has no other route.',
  'stopWhenDown.interface': 'Torrents stop the moment the interface or its address goes.',
  useForwardedPort: 'Use the forwarded port',
  useForwardedPortHint:
    'Torrents listen on the port your provider forwards, and tell trackers when it changes.',
  indexersThroughVpn: 'Send indexer searches through the VPN too',
  indexersThroughVpnHint:
    'Off by default: a private tracker’s account is often tied to your own address, and searches would fail while the tunnel is down.',
})
