# Sources

Every entry is written for highsea from the provider's own documentation, checked on 2026-10-20. Each entry lists them in `sources`; nothing is copied from another project. The entries are CC0-1.0.

| Entry | How highsea connects | Port forwarding | Written from |
| --- | --- | --- | --- |
| `proton` | A WireGuard configuration from Downloads, on a P2P server with NAT-PMP on | NAT-PMP to `10.2.0.1`, 60-second mappings renewed every 45 seconds, UDP and TCP; the public port is the client's listening port | [Proton: port forwarding, by hand](https://protonvpn.com/support/port-forwarding-manual-setup), [Proton: WireGuard on Linux](https://protonvpn.com/support/wireguard-manual-linux) |
| `pia` | PIA's API: a token from the username and password, the server list, then the key's registration | PIA's `getSignature` and `bindPort` on port 19999, bound again every 15 minutes | [pia-foss/manual-connections](https://github.com/pia-foss/manual-connections) (MIT): `get_token.sh`, `get_region.sh`, `connect_to_wireguard_with_token.sh`, `port_forwarding.sh` |
| `airvpn` | A WireGuard file from the Config Generator | A port reserved under Client Area › Forwarded ports, typed in | [AirVPN: remote port forwarding](https://airvpn.org/faq/port_forwarding/), [gluetun wiki › AirVPN](https://github.com/qdm12/gluetun-wiki/blob/main/setup/providers/airvpn.md) |
| `mullvad` | A WireGuard file from the account's WireGuard configuration page | None: removed on 2023-07-01 | [Mullvad: WireGuard on Linux](https://mullvad.net/en/help/easy-wireguard-mullvad-setup-linux), [Mullvad: removing forwarded ports](https://mullvad.net/en/blog/removing-the-support-for-forwarded-ports). Its connection check, `am.i.mullvad.net/json`, answers `mullvad_exit_ip` |
| `ivpn` | A WireGuard file from the Client Area's generator (accounts like i-XXXX-XXXX-XXXX) | None: removed on 2023-09-30 | [IVPN: configuration files](https://www.ivpn.net/knowledgebase/general/do-you-offer-openvpn-wireguard-config-files/), [IVPN: gradual removal of port forwarding](https://www.ivpn.net/blog/gradual-removal-of-port-forwarding) |
| `windscribe` | A WireGuard file from My Account › Config Generator (paid accounts) | An ephemeral port with Matching Port, for 7 days, typed in | [Windscribe: WireGuard configs](https://windscribe.com/knowledge-base/articles/where-do-i-access-my-wireguard-configs), [Windscribe: port forwarding](https://windscribe.com/knowledge-base/articles/do-you-support-port-forwarding), [Windscribe: ephemeral port forwarding](https://windscribe.com/knowledge-base/articles/what-is-ephemeral-port-forwarding-and-how-to-use-it) |
| `surfshark` | A WireGuard file from VPN › Manual setup | None | [Surfshark: manual WireGuard on Linux](https://support.surfshark.com/hc/en-us/articles/19262406140306), [Surfshark: what is VPN port forwarding](https://surfshark.com/blog/vpn-port-forwarding) ("Surfshark VPN does not support port forwarding") |
| `other` | Any WireGuard configuration file | A port typed in, if the provider gives one | [wg-quick(8)](https://git.zx2c4.com/wireguard-tools/about/src/man/wg-quick.8) |

## Adding a provider

1. Write it from the provider's own documentation for a manual WireGuard setup, and list those pages in `sources`.
2. Use a mechanism highsea has. A provider without a documented manual WireGuard setup comes through the VPN container instead.
3. Run `bun run catalog:build`, and add a line to `CHANGES.md` under a new version.
