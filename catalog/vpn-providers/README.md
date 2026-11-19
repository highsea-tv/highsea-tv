# The VPN provider catalog

The providers Settings › VPN › the built-in VPN offers ([vpn.md](../../docs/product/vpn.md), ADR 0042), in the format `@highsea-tv/schemas/vpn` defines, signed and released like the indexers (ADR 0034).

- `definitions/`: one YAML entry per provider, shipped on both channels.
- `beta/`: entries shipped on the beta channel only. A file here replaces the stable one with the same id.
- `logos/`: SVG or PNG logos named by the entries (none yet).
- `CHANGES.md`: one heading per catalog version, newest first.
- `SOURCES.md`: the provider documentation each entry is written from.

Facts are data and mechanisms are code. An entry says which of highsea's mechanisms the provider uses: `connect` is `config` (a WireGuard configuration file), `pia` (PIA's API) or `token` (an access token, with the API's addresses, how the token is sent and where the key and a server are in its answers described in the entry's `token` block; engine 1.1.0), and `portForwarding.method` is `natpmp`, `pia`, `static` (a port typed in) or `none`. A provider that fits these ships here without a server release; one that needs a new mechanism needs code first.

`bun run catalog:build` validates and signs this kind beside the indexers, into `dist/catalog/vpn-providers/`; `--seed` refreshes `packages/catalog/seed/vpn-providers/`.
