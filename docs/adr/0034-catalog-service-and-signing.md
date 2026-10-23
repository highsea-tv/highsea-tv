# 0034. The catalog service and signing

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
ADR 0007 decided that catalogs are signed and released apart from the server, and that stays the decision. This ADR records how checkpoint 5 builds it ([phase-3-checkpoint-5.md › The catalog](../plans/phase-3-checkpoint-5.md#the-catalog)).

The owner's answers shaped three parts of it:
- the release key comes later, and a development key signs the seed until then (answer 3);
- new versions install on their own unless the owner chooses "Ask first" (answer 4);
- the catalog's settings are the owner's, in Settings › General (answer 7).

## Decision
- **`@highsea/catalog`** holds the format, signing, the pipeline's build and the server's service, so the pipeline and the server can't disagree about what a valid catalog is.
- **What a channel publishes:**
  - `{channel}/manifest.json` is a signed envelope: the manifest's exact text, its signature and the id of the key that made it;
  - the manifest names the bundle by SHA-256, so one signature covers both;
  - the manifest also carries its `kind` (`indexers` for now), channel, version (`2026.10.21`, with a suffix for a second release that day), the oldest engine it needs, and up to 20 changelog entries for What changed;
  - the signature covers the published bytes, so nothing is re-serialized before it's checked.
- **ed25519** through Node's crypto, with no dependency: `crypto.sign(null, data, key)` ([Node: crypto.sign](https://nodejs.org/api/crypto.html#cryptosignalgorithm-data-key-callback)). Public keys are base64 SPKI DER, private keys PKCS #8 PEM. Signatures are deterministic ([RFC 8032 § 5.1.6](https://www.rfc-editor.org/rfc/rfc8032#section-5.1.6)), so a test can tell when the committed seed is stale.
- **Keys:**
  - The server trusts a list of keys (`RELEASE_KEYS`), and a manifest names its key's id, so a key can be rotated by listing the new one beside the old.
  - The release key is created by the owner when publishing begins and kept as a GitHub Actions secret. The list is empty until then.
  - Until then, a **development key** signs the seed snapshot. Its private half is in the repository on purpose, so it protects nothing. The server trusts it unless `NODE_ENV` is `production`, and `HIGHSEA_CATALOG_DEV_KEY` overrides that.
  - Tests generate a throwaway key per run.
- **The pipeline** (`bun run catalog:build`, `.github/workflows/catalog.yml` on `catalog/**`) runs four steps:
  1. validate every definition, run the tests against the fake indexer, and audit the licences;
  2. bundle the definitions with their logos;
  3. write the manifest from `CHANGES.md`;
  4. sign it.

  The publish step to GitHub Pages is written but switched off until the owner says so.
- **The service's sources,** with the higher one winning when two have the same id:
  - **`local`**: YAML in `/config/definitions`, validated but unsigned, marked Local in A9;
  - **`main`**: the seed snapshot shipped in the server, then the main catalog's updates from `HIGHSEA_CATALOG_URL`, which stays unset until publishing begins;
  - **`extra:{url}`**: extra catalogs the owner adds, each with its own trusted key.
- **A check** runs at boot, after a minute, and then every 6 hours. It is a job, safe to repeat, and it takes these steps:
  1. fetch the manifest with `If-None-Match`;
  2. verify the signature before anything else is downloaded;
  3. refuse a manifest for another channel or older than the installed version, so an old, validly signed catalog can't be replayed to undo a fix;
  4. fetch the bundle (at most 20 MB) and verify its size and hash;
  5. validate every definition and skip those the engine can't run.

  A failure keeps what was installed, logs why, and raises a health warning ("… Keeping 2026.10.21.").
- **Updates** install on their own. With "Ask first", the verified files wait in `/config/catalog/` and A9's What changed offers Install, which verifies them again first.
- **Installed indexers follow their definition:**
  - settings are kept;
  - a dropped setting is removed;
  - a new required setting with no default marks the indexer as needing attention, and it skips searches until it's set;
  - a definition that disappears does the same.
- **Caching:** definitions live in `catalog_definitions`, so a restart works offline, and the verified files are copied to `/config/catalog/` for anyone inspecting them.
- **Settings** (channel, automatic updates, extra catalogs) are owner-only, like the other trust settings (ADR 0032's answers). The search timeout is a fixed 30 seconds.

## Consequences
- Nothing unsigned or tampered with is ever loaded from a catalog. Only the owner's own files in `/config/definitions` are unsigned.
- Until the release key exists, a production build (`NODE_ENV=production`, as the Docker image sets) trusts no key. It boots with no catalog, so A9's catalog is empty unless the owner sets `HIGHSEA_CATALOG_DEV_KEY=1` or adds local definitions. This is decision 3 working as intended, and it ends when the owner creates the release key.
- Other content (presets, sound packs) can use the same manifest, signing and service with a new `kind` (answer 8).

## 2026-10-22: the release key and publishing (checkpoint 9b)

ADR 0050 sets out how highsea is released. Four things change here:

- **Where the release key lives.** It's a secret of the repository's `release` environment, not a repository-wide secret, so it reaches only the jobs the owner approves. `catalog/keys/README.md` has the steps for the first publish.
- **The image's seed.** A release re-signs the seed snapshot it ships with the release key (`HIGHSEA_CATALOG_SEED_RELEASE=1`), so production servers trust it from their first boot. The committed seed stays signed with the development key.
- **Who publishes.** `release.yml` deploys the catalog's channels to Pages as part of a release. `catalog.yml` still builds and checks every change to `catalog/**`, and its switched-off publish step is gone, so the channels change only with a release.
- **The address.** A production server checks `https://catalog.highsea.tv` unless `HIGHSEA_CATALOG_URL` names another address or is `off`. Development and tests have no default.
