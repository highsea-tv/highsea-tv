# The indexer catalog

Declarative indexer definitions (ADR 0007, ADR 0033), released on their own schedule and signed (ADR 0034).

- `definitions/`: YAML definitions, one per file, shipped on both channels.
- `beta/`: definitions shipped on the beta channel only. A file here replaces the stable one with the same id.
- `logos/`: SVG or PNG logos named by the definitions.
- `CHANGES.md`: one heading per catalog version, newest first. The newest heading is the version being built.
- `SOURCES.md`: where each definition comes from, and its licence.
- `verified.json`: when each definition was last checked against its real site, and whether it worked. `bun run catalog:verify` writes it; don't edit it by hand.

`bun run catalog:build` validates every definition, then writes both channels to `dist/catalog/`, signed with the development key. `bun run catalog:build --seed` also refreshes the seed snapshot the server ships with (`packages/catalog/seed/`). Publishing to a static host is written but switched off until the owner says to publish.

`bun run catalog:verify [id…]` checks each public definition against its real site, from your own machine (ADR 0034, 2026-11-18). For each one it runs the engine's search with the definition's `test` query, the latest releases when the test asks for something else, and a title search for a word from the first result, then fetches the first release's `.torrent` and parses it, or parses its magnet. Nothing is downloaded. It prints a table (working, failing with the reason, a challenge page, skipped) and records the date in `verified.json`; `--dry` leaves the file alone. A definition that needs an account or settings is skipped. It exits with 1 when any definition fails or meets a challenge, so you notice. It isn't a test and CI doesn't run it: it needs the network, and many public sites turn away datacentre addresses.
