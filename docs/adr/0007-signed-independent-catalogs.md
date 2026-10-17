# 0007. Signed catalogs released independently of apps

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Indexer definitions change often (site layout changes, new trackers). Rebuilding and republishing the server for each change is unacceptable. The same need applies to quality/custom-format presets, themes, sound packs and client device profiles.

## Decision
- `catalog/*` holds **declarative-only** content (no executable code), validated by schema packages such as `@highsea/indexer-schema`.
- A dedicated CI pipeline (triggered on `catalog/**`):
  1. validates and smoke-tests the content;
  2. builds versioned bundles;
  3. signs the manifests with **ed25519**;
  4. publishes to a static host on `stable` and `beta` channels.
- The server's `CatalogService`:
  - verifies signatures against an embedded public key;
  - filters by `minEngineVersion`;
  - caches and auto-updates installed items;
  - ships a seed snapshot for offline first run;
  - supports extra catalog URLs and local overrides in `/config/definitions`.
- Every catalog item records its source and license.

## Consequences
- Catalog updates reach users without app releases.
- The engine must stay backward compatible within a major `engineVersion`.
