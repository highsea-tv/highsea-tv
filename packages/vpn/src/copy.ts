// SPDX-License-Identifier: AGPL-3.0-only
// What Settings › VPN says, word for word from docs/product/vpn.md and the approved prototype
// (design/prototypes/src/mock/vpn.ts: `vpnStatus` and `connectionFailure`). Lines the prototype
// didn't need, because real data forces them, are marked; the checkpoint report lists them.

export const failures = {
  piaUsername: 'Enter your PIA username.',
  piaRefused: 'PIA didn’t accept that username and password.',
  piaPassword: 'Enter your PIA password.',
  notWireGuard: 'That file isn’t a WireGuard configuration: it has no [Interface] section.',
  upload: (provider: string) => `Upload a WireGuard configuration from ${provider}.`,
  keyRefused: (url: string) => `gluetun’s control server at ${url} refused that API key.`,
  unreachable: (url: string) => `Couldn’t reach the VPN container’s control server at ${url}.`,
  containerKey: 'Enter the control server’s API key.',
  needsCapability:
    'highsea needs the NET_ADMIN capability to run the tunnel. Add it to highsea’s service in your compose file, then restart.',
  // Not in the prototype: highsea connects arrives in 6b (answer V1).
  builtinLater:
    'highsea connects arrives in the next update. Use a VPN container or an interface on this machine for now.',
  // Not in the prototype: the interface picker and the typed-in port can't be left wrong.
  interfaceName: 'Choose an interface.',
  staticPort: 'Enter a port from 1 to 65535.',
  echoUrl: 'Enter the address of an IP echo service, starting with http:// or https://.',
  provider: 'Choose a provider.',
  mode: 'Choose how torrents reach your VPN.',
}

/** The parser's refusals, past the one the prototype has. Not in the prototype. */
export const wireGuardFailures = {
  noInterface: failures.notWireGuard,
  noPrivateKey: 'That WireGuard configuration has no PrivateKey in its [Interface] section.',
  noPeer: 'That WireGuard configuration has no [Peer] section.',
  noPublicKey: 'A [Peer] in that WireGuard configuration has no PublicKey.',
  badKey: (key: string) => `That WireGuard configuration’s ${key} isn’t a WireGuard key.`,
  badValue: (key: string, value: string) =>
    `That WireGuard configuration’s ${key} isn’t valid: ${value}.`,
  badLine: (line: number) =>
    `Line ${line} of that WireGuard configuration isn’t a section or a Key = Value line.`,
}

export const labels = {
  tunnel: 'Tunnel',
  exit: 'Exit address',
  names: 'Names',
  killSwitch: 'Kill switch',
  portForwarding: 'Port forwarding',
  ipv6: 'IPv6',
} as const

export const checkCopy = {
  waiting: 'Waiting for the tunnel.',
  checkedLater: 'Checked again once the tunnel is back.',
  stopped: ['Torrents are stopped', 'Nothing leaks onto your own connection.'],
  // The prototype's down row is highsea connects' ("No handshake for 3 minutes"); these two say
  // what the other modes can actually see. Not in the prototype.
  containerDown: [
    'gluetun reports the tunnel stopped',
    'Reconnecting. Torrents are stopped until it’s back.',
  ],
  containerGone: (url: string) =>
    [`Couldn’t reach gluetun at ${url}`, 'Torrents are stopped until it answers again.'] as const,
  interfaceDown: (iface: string) =>
    [`${iface} has no address`, 'Torrents are stopped until it’s back.'] as const,
  containerTunnel: 'gluetun reports the tunnel running',
  interfaceTunnel: (iface: string, address: string) =>
    [`${iface} is up`, `Its address is ${address}.`] as const,
  exit: (ip: string, country: string | null) =>
    country ? `Torrents leave from ${ip} (${country})` : `Torrents leave from ${ip}`,
  exitContainer: 'From inside the container, highsea can’t see your own address to compare.',
  exitNotOwn: 'Not from your own address.',
  // Not in the prototype: in the interface mode, matching answers usually mean the whole machine
  // uses the VPN, and every socket is bound to the interface anyway, so it only warns.
  exitSame: (iface: string) =>
    [
      'Both answers came from the same address',
      `So highsea can’t compare them. That’s expected if your whole machine uses the VPN. Torrents still leave only through ${iface}.`,
    ] as const,
  // Not in the prototype: the echo service didn't answer, which isn't a leak, so it only warns.
  exitUnknown: [
    'Couldn’t check the exit address',
    'The IP echo service didn’t answer. Checked again in 5 minutes.',
  ],
  exitOwnUnknown: [
    'Couldn’t check your own address to compare',
    'The IP echo service didn’t answer outside the tunnel. Checked again in 5 minutes.',
  ],
  namesContainer: [
    'Names are looked up through the tunnel',
    'Like everything else in the container.',
  ],
  names: 'Tracker names are looked up through the tunnel',
  killSwitchContainer: [
    'Nothing can leave outside the tunnel',
    'The container has no other route.',
  ],
  killSwitchInterface: (iface: string) =>
    [
      `Bound to ${iface}`,
      'Your system’s routing decides the path; a VPN container or highsea connects guarantees it.',
    ] as const,
  listening: (port: number) =>
    [
      `Torrents listen on port ${port}`,
      'Forward it through your tunnel yourself, if your provider allows it.',
    ] as const,
  forwarded: (port: number, peers: number) =>
    [`Port ${port} is forwarded`, `${peers} peers have connected in.`] as const,
  notForwarding: ['Not using a forwarded port', 'Downloads still work; fewer peers can reach you.'],
  doesntForward: (name: string) =>
    [`${name} doesn’t forward ports`, 'Downloads still work; fewer peers can reach you.'] as const,
  ipv6: 'IPv6 goes through the tunnel too',
  ipv4Only: ['IPv4 only', 'The tunnel has no IPv6 address, so torrents use IPv4 only.'],
} as const

/** System's health checks. Not in the prototype: System's list had no VPN rows to draw. */
export const systemCopy = {
  down: 'The VPN is down. Torrents are stopped until it’s back.',
  failed: (message: string | null) =>
    message ? `The VPN couldn’t connect: ${message}` : 'The VPN couldn’t connect.',
  check: (title: string) => `VPN: ${title}. Open Settings › VPN to see why.`,
}
