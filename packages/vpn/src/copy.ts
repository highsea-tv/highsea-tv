// SPDX-License-Identifier: AGPL-3.0-only
// What Settings › VPN says, word for word from docs/product/vpn.md and the approved prototype
// (packages/mock/src/vpn.ts: `vpnStatus` and `connectionFailure`). Lines the prototype
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
  hostNetwork:
    'On host networking, the tunnel’s interface and routes would land in the host’s network beside everything else, so highsea won’t start it. Put the lines from Compose for the built-in VPN in place of network_mode: host, then recreate the container.',
  // Not in the prototype: what the built-in VPN can meet that the prototype didn't play (6b).
  linuxOnly:
    'The built-in VPN runs on Linux, as highsea’s Docker image does. Use a VPN container or an interface on this machine here.',
  noDevice:
    'highsea couldn’t create the WireGuard interface: the kernel has no WireGuard, and /dev/net/tun isn’t there for wireguard-go. Add the /dev/net/tun device to highsea’s service in your compose file, then restart.',
  notInstalled:
    'highsea couldn’t find the ip and wg programs. They come with highsea’s Docker image.',
  tunnelFailed: (reason: string) => `highsea couldn’t set up the tunnel: ${reason}`,
  noAddress:
    'The built-in VPN needs an IPv4 Address in the WireGuard configuration’s [Interface] section.',
  noEndpoint:
    'A [Peer] in that WireGuard configuration has no Endpoint, so highsea can’t reach it.',
  piaRegion: (region: string) => `PIA has no WireGuard server in ${region}. Pick another region.`,
  // Not in the prototype: connecting with an access token (HT-87)
  token: (provider: string) => `Paste your ${provider} access token.`,
  // Not in the prototype: the interface picker and the typed-in port can't be left wrong.
  interfaceName: 'Choose an interface.',
  staticPort: 'Enter a port from 1 to 65535.',
  echoUrl: 'Enter the address of an IP echo service, starting with http:// or https://.',
  provider: 'Choose a provider.',
  mode: 'Choose how torrents reach your VPN.',
}

/**
 * Connecting with an access token (HT-87), with the provider's name. Not in the prototype. None of
 * them carries the token or an address with it.
 */
export const tokenFailures = {
  refused: (provider: string) =>
    `${provider} didn’t accept that access token. Generate a new one in your ${provider} account and paste it here.`,
  unreachable: (provider: string) =>
    `Couldn’t reach ${provider}’s API. highsea tries again shortly.`,
  status: (provider: string, status: number) => `${provider}’s API answered ${status}.`,
  answer: (provider: string) => `${provider}’s API answered, but not in a way highsea understands.`,
  noKey: (provider: string) =>
    `${provider} answered without a WireGuard key for that token. Check that the account has an active subscription.`,
  noCountry: (provider: string, country: string) =>
    `${provider} has no country called ${country}. Pick another one.`,
  noServersIn: (provider: string, country: string) =>
    `${provider} recommends no WireGuard server in ${country} right now. Pick another country, or leave it to ${provider}.`,
  noServers: (provider: string) =>
    `${provider} recommends no WireGuard server right now. highsea tries again shortly.`,
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
  // The prototype's down row is the built-in VPN's ("No handshake for 3 minutes"); these two say
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
      'Your system’s routing decides the path; a VPN container or the built-in VPN guarantees it.',
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
  // The built-in VPN’s rows, from vpn.md's table; the ones marked weren't in the prototype
  builtinTunnel: (provider: string, seconds: number) =>
    [`Connected to ${provider}`, `Last handshake ${seconds} seconds ago.`] as const,
  noHandshake: [
    'No handshake for 3 minutes',
    'Reconnecting. Torrents are stopped until it’s back.',
  ],
  // Not in the prototype: the provider's API didn't answer while connecting.
  providerUnreachable: (provider: string) =>
    [`Couldn’t reach ${provider}`, 'Reconnecting. Torrents are stopped until it’s back.'] as const,
  exitOwn: ['The exit address is your own', 'Torrents are stopped.'],
  // Not in the prototype: the provider's own check (Mullvad's) says the exit isn't theirs.
  exitNotProvider: (provider: string, ip: string) =>
    [`${provider} says ${ip} isn’t one of its addresses`, 'Torrents are stopped.'] as const,
  namesOutside: [
    'Names are being looked up outside the tunnel',
    'The WireGuard configuration has no DNS line, so torrents are stopped. Upload one that has it.',
  ],
  killSwitchBuiltin: ['If the tunnel drops, torrents stop', 'Nothing can leave outside it.'],
  killSwitchMissing: [
    'The routing rule is missing',
    'Torrents are stopped until highsea puts it back.',
  ],
  noForwardedPortSet: ['No forwarded port set', 'Downloads still work; fewer peers can reach you.'],
  // Not in the prototype: asking for the port, and the provider not giving one.
  askingForPort: (provider: string) => `Asking ${provider} for a forwarded port.`,
  forwardingFailed: (provider: string) =>
    [
      `${provider} didn’t forward a port`,
      'Downloads still work; fewer peers can reach you. Trying again in a minute.',
    ] as const,
  // Not in the prototype: the built-in VPN routes IPv4 only for now (6b, judgement call).
  ipv4OnlyBuiltin: [
    'IPv4 only',
    'The built-in VPN carries IPv4 for now, so torrents use IPv4 only.',
  ],
  ipv6: 'IPv6 goes through the tunnel too',
  ipv4Only: ['IPv4 only', 'The tunnel has no IPv6 address, so torrents use IPv4 only.'],
} as const

/** System's health checks. Not in the prototype: System's list had no VPN rows to draw. */
export const systemCopy = {
  down: 'The VPN is down. Torrents are stopped until it’s back.',
  failed: (message: string | null) =>
    message ? `The VPN couldn’t connect: ${message}` : 'The VPN couldn’t connect.',
  check: (title: string) => `VPN: ${title}. Open Settings › VPN to see why.`,
  // Not in the prototype: an indexer search while the VPN it goes through is down (answer V6).
  indexersWaiting:
    'Indexer searches go through the VPN, and it’s down. They work again once it’s back.',
  forwarding: (provider: string) =>
    `VPN: ${provider} didn’t forward a port. Downloads still work; fewer peers can reach you.`,
}

/**
 * Settings › VPN's Test (HT-82): one line for each thing it proves, with a plain reason when it
 * doesn't. Not in the prototype: Test came after it, in the other settings pages' pattern.
 */
export const testCopy = {
  tunnelUp: (provider: string) =>
    [`The tunnel came up with ${provider}`, 'WireGuard shook hands with the server.'] as const,
  tunnelLive: (provider: string) =>
    [
      `The tunnel to ${provider} is up`,
      'highsea checked the connection it already has, without touching it.',
    ] as const,
  noHandshake: (provider: string) =>
    [
      `${provider} didn’t answer`,
      'The tunnel was set up, but no handshake came back in 15 seconds. Check the file’s keys and Endpoint, and that the server still exists.',
    ] as const,
  containerUp: 'gluetun reports the tunnel running',
  containerNotRunning: (state: string) =>
    [`gluetun reports the tunnel ${state}`, 'Look at gluetun’s log for the reason.'] as const,
  interfaceUp: (iface: string, address: string) =>
    [`${iface} is up`, `Its address is ${address}.`] as const,
  interfaceMissing: (iface: string) =>
    [`${iface} has no IPv4 address`, 'Start the VPN that owns it, or choose another.'] as const,
  notChecked: 'Not checked: the tunnel didn’t come up.',
  exitPass: (ip: string, country: string | null) =>
    [
      country ? `Traffic leaves from ${ip} (${country})` : `Traffic leaves from ${ip}`,
      'A different address from the one seen without the tunnel.',
    ] as const,
  exitOwn: (ip: string) =>
    [
      'The exit address is your own',
      `Both answers came from ${ip}, so traffic isn’t going through the VPN.`,
    ] as const,
  exitUnknown: [
    'Couldn’t check the exit address',
    'The IP echo service didn’t answer through the tunnel.',
  ],
  exitOwnUnknown: (ip: string) =>
    [
      `Traffic leaves from ${ip}`,
      'The IP echo service didn’t answer outside the tunnel, so highsea couldn’t compare.',
    ] as const,
  exitContainer: (ip: string, country: string | null) =>
    [
      country ? `gluetun’s exit is ${ip} (${country})` : `gluetun’s exit is ${ip}`,
      'From inside the container, highsea can’t see your own address to compare.',
    ] as const,
  namesPass: (servers: readonly string[]) =>
    [
      'Names resolve through the tunnel',
      `Asked ${servers.join(', ')} from the tunnel’s address.`,
    ] as const,
  namesNoDns: [
    'The file has no DNS line',
    'Names would be looked up outside the tunnel, so highsea would stop torrents. Add your provider’s DNS servers to [Interface].',
  ],
  namesFailed: (servers: readonly string[]) =>
    [
      'Names didn’t resolve through the tunnel',
      `${servers.join(', ')} didn’t answer from the tunnel’s address.`,
    ] as const,
  namesContainer: [
    'Names are looked up through the tunnel',
    'Like everything else in the container.',
  ],
  namesSystem: [
    'Names use your system’s resolver',
    'The interface mode looks names up the way the rest of the machine does.',
  ],
  forwarded: (port: number) =>
    [`${port} is forwarded`, 'Peers can reach you, which helps seeding.'] as const,
  forwardFailed: (provider: string, reason: string) =>
    [
      `${provider} didn’t forward a port`,
      `${reason} Downloads still work; fewer peers can reach you.`,
    ] as const,
  doesntForward: (provider: string) =>
    [
      `${provider} doesn’t forward ports`,
      'Downloads work, but peers can’t connect in, so seeding reaches only peers that accept connections. Ratios on private trackers grow slowly.',
    ] as const,
  staticPort: (port: number) =>
    [
      `Port ${port} is set by hand`,
      'highsea can’t ask your provider about it; it listens there and tells trackers.',
    ] as const,
  noStaticPort: [
    'No forwarded port set',
    'Enter the port your provider reserved for you, or leave it empty: downloads still work.',
  ],
  notForwarding: ['Not using a forwarded port', 'Turned off under Behaviour.'],
  listening: (port: number) =>
    [
      `Torrents listen on port ${port}`,
      'highsea can’t ask an interface’s VPN for a port; forward it yourself if your provider allows it.',
    ] as const,
  // refusals
  modeOff: 'Choose a connection to test.',
  busy: 'A test is already running.',
  connecting: 'highsea is connecting with the saved settings. Test again in a moment.',
  liveDiffers:
    'The built-in VPN is connected with the saved settings. Save these instead: highsea checks them as it connects, and torrents stay stopped if a check fails.',
}
