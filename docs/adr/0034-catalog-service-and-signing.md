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

## 2026-11-18: a live check with a date on record (HT-75)

The tests run every definition against the fake indexer, and they stay offline. That proves a definition is well formed, not that its site still answers it. Before the catalog grows past the Internet Archive, each definition needs a dated fact: it worked against its real site on this day.

- **`bun run catalog:verify [id…]`** (`scripts/catalog-verify.ts`) runs each public definition through the engine's own `runSearch` and `fetchRelease`, under its own rate limit (one request a second for a definition without one) and the server's 30-second timeout. It makes up to three probes: the definition's `test` query, the latest releases when the test asks for something else, and a title search for a word from the first result. RSS skips the title search, since a feed can't be searched. A probe works only when it finds releases with a title, a size or none, and a torrent address or a magnet. The first release's `.torrent` is then fetched and parsed with `@highsea-tv/torrent`'s own `parseTorrentFile` (BEP 3), or its magnet with `parseMagnet` (BEP 9), so "working" means the torrent engine would take it. Nothing is downloaded and no peer is contacted. One definition failing never stops the rest.
- **Skipped:** a definition that's private or semi-private, needs a sign-in, has a required setting without a default, or takes its address from a setting. Each one is listed with its reason.
- **A challenge page** is reported as one, not as "found nothing". Cloudflare marks its challenge pages with `cf-mitigated: challenge` ([Detect a Challenge Page response](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/detect-response/)). The engine's `checkStatus` now names that header in its error, so the admin's Test button says it too. The check also notices a page that loads Turnstile, hCaptcha or reCAPTCHA by their documented script addresses.
- **`catalog/indexers/verified.json`** keeps, for each definition by id (`beta/<id>` for the beta channel's), the version checked, the result and its reason in words, `checked` (the UTC date of the last run), `verified` (the last date this version worked, kept through a later failure and dropped when the version changes) and the counts. A run for some ids keeps the others' entries. The catalog's loader reads only `definitions/` and `beta/`, so the file never reaches a bundle.
- **Not in the admin yet.** Showing "Verified <date>" on A9's catalog cards would mean carrying the dates in the signed bundle, so `bundleSchema`, the build, the catalog service, the indexers' `DefinitionSource`, the contract's catalog entry, the admin, its mock and the seed would all change. Every run would then need a new catalog version to reach servers, because servers fetch a bundle only when the version moves. That ties each check to a catalog release, and it's left for when the catalog's list is approved.
- **No scheduled run.** A weekly GitHub Actions run would be small, but it wouldn't be honest. Scheduled workflows run only on the default branch, can be delayed under load, and are switched off in a public repository after 60 days without activity ([Events that trigger workflows § schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). Worse, many public torrent sites put Cloudflare in front of datacentre addresses like GitHub's runners, so a CI run would report challenges the owner's own connection never sees, and open issues for definitions that work. The check is run by hand from the owner's connection, the one highsea really searches from. It's never a gate on merges or releases.

## 2026-11-19: publishing without a release, and each definition's standing in the bundle (HT-94)

The catalog no longer waits for a release: `catalog-release.yml` publishes it on its own, from `next`, behind the `release` environment, with the release's own catalog steps ([ADR 0069](0069-keeping-the-indexer-catalog-fresh.md)). The bundle gains an optional `status` field: per definition, its stage, its status (working, broken or retired) with a note, and its last check from `verified.json`, built from `stages.json`. Older servers ignore the field; the service reads each entry on its own and answers `statusOf(id)`, which still knows a retired definition after it has left `definitions()`. The 2026-11-18 section's "not in the admin yet" stands for the admin; the data is now on servers.
