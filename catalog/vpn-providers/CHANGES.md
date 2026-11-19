# VPN provider changes

Newest first. The newest heading is the version being built.

## 2026.11.19

- NordVPN connects with an access token alone: highsea fetches the NordLynx key and a recommended server, in a country you pick or one NordVPN picks. A hand-written WireGuard file still works as the fallback. Needs a server with VPN engine 1.1.0; older ones skip the entry.

## 2026.11.18

- NordVPN, with a WireGuard configuration built from its access token and server list. NordVPN forwards no ports.

## 2026.10.21

- The first providers for highsea connects: Proton VPN, Private Internet Access, AirVPN, Mullvad, IVPN, Windscribe and Surfshark, and any other WireGuard configuration.
