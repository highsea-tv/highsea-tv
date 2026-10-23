# The indexer catalog

Declarative indexer definitions (ADR 0007, ADR 0033), released on their own schedule and signed (ADR 0034).

- `definitions/`: YAML definitions, one per file, shipped on both channels.
- `beta/`: definitions shipped on the beta channel only. A file here replaces the stable one with the same id.
- `logos/`: SVG or PNG logos named by the definitions.
- `CHANGES.md`: one heading per catalog version, newest first. The newest heading is the version being built.
- `SOURCES.md`: where each definition comes from, and its licence.

`bun run catalog:build` validates every definition, then writes both channels to `dist/catalog/`, signed with the development key. `bun run catalog:build --seed` also refreshes the seed snapshot the server ships with (`packages/catalog/seed/`). Publishing to a static host is written but switched off until the owner says to publish.
