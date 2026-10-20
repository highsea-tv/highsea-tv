# 0031. Quality and the decision engine: Radarr's documented behaviour, written fresh

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Checkpoint 4 needs highsea to say whether a profile wants a release, and why, before checkpoint 5's indexers feed it any ([phase-3-checkpoint-4.md › Quality](../plans/phase-3-checkpoint-4.md#quality)). Owners arriving from Radarr expect its vocabulary and rules: the quality names, profiles with groups and a cutoff, custom formats with scores, sizes per minute. The TRaSH Guides' custom formats and profiles are how most of them configure it.

Radarr is GPL-3.0. GPL-3.0 code may be combined with AGPL-3.0 code, but copying it would tie highsea's design to Radarr's and its tests to Radarr's internals. The TRaSH Guides are MIT.

## Decision
- **Clean room.** `@highsea/quality` is written from documentation:
  - the Servarr wiki's [Radarr settings](https://wiki.servarr.com/radarr/settings) (Quality Profiles, Qualities Defined, Custom Format Conditions, File Management) and [FAQ](https://wiki.servarr.com/radarr/faq) (MULTi);
  - the [TRaSH Guides](https://trash-guides.info/) and their published JSON;
  - Radarr's API enum order, for reading TRaSH's numeric values, confirmed against the presets' own names.

  No Radarr source or test is read or copied. The behaviour is stated in highsea's own tests.
- **Pure.** No database, clock or I/O, and browser-safe, so the server, the prototype and later the clients share it.
- **The vocabulary:**
  - **Qualities** are Radarr's documented names, from Unknown to Remux-2160p: a source, a resolution and a modifier each (`QUALITY_NAMES`, `QUALITIES`).
  - **WEB-DL and WEBRip** stay separate qualities, so sizes and formats can tell them apart. Profiles group them as "WEB 480p" to "WEB 2160p", as Radarr's and TRaSH's profiles do (`WEB_GROUPS`).
  - **The order** is Radarr's default profile order as TRaSH's profiles record it, with two changes. BR-DISK sits just below Remux-2160p and Raw-HD just above HDTV-1080p, where Radarr puts both above Remux-2160p. A disc image or a raw capture isn't playable on most clients, so neither should outrank a remux by default.
  - **`qualityOf`** turns the parser's source, resolution and modifier into a name. Where the name leaves something out, it picks the lowest quality consistent with what it says (1080p with no source is HDTV-1080p), so a release never ranks higher than its name shows.
  - **The prototype's strings** ("Bluray 1080p", "WEB 2160p") map onto these with `fromPrototypeQuality`.
- **Profiles** follow the wiki's rules:
  - **Items** come highest first; a group's qualities are equal, and only allowed items are wanted. The shape is TRaSH's profile JSON (`items` with `name`, `allowed` and the qualities).
  - **Upgrades:** the cutoff, `upgradeAllowed`, `minFormatScore`, `cutoffFormatScore` and `minUpgradeFormatScore`.
  - **The language** is `any`, `original` or an ISO 639-1 code.
- **Custom formats** are sets of conditions `{ kind, value, negate, required, name }` with ten kinds: release title, edition and release group (regular expressions), language, indexer flag, source, resolution, modifier, size (GiB) and year. Matching is the wiki's rule:
  - conditions of one kind are alternatives, and different kinds must all hold;
  - a required condition must hold on its own;
  - `negate` inverts a condition;
  - regular expressions are case-insensitive.

  A regex compiles once. An invalid one never holds, even negated, and `validateFormat` reports it.
- **Sizes** are MiB per minute (min, preferred, max) times the runtime, or 110 minutes when it isn't known.
  - The defaults are TRaSH's documented quality sizes: a minimum for the HD and UHD qualities, with the preferred size and the maximum unlimited (`null`).
  - Radarr's own shipped defaults aren't documented outside its source, so they aren't used.
- **The decision engine** is a registry of specifications, run in order. Each returns `DecisionReason[]` in the prototype's shape, and a release is approved when none rejects it.
  - **This checkpoint's specifications:** quality, size, format score, language, upgrade allowed, cutoff and upgrade.
  - **Slots for later checkpoints:** seeders, minimum age, blocked indexer, already queued, already imported and blocklisted. Each is registered and silent until its checkpoint fills it with `withSpecification`.
  - **Reasons** are ICU messages in a catalog (ADR 0021), in the prototype's words: "Bluray-1080p isn’t allowed in HD 1080p", "Too large: 32.1 GB, the limit is 18.0 GB for 2h 12m".
- **Ranking:** quality as the profile orders it, then revision, then format score. Checkpoint 5 adds its keys (protocol, indexer priority, seeders, size nearest the preferred size) as tiebreakers.
- **TRaSH presets:**
  - a few TRaSH custom formats are bundled unchanged as JSON, with the commit and the MIT notice in `packages/quality/src/presets/SOURCES.md`;
  - `importTrashFormat` reads TRaSH's shape into the condition model, and lists what it can't express rather than guessing;
  - the seeded formats are the prototype's four, built from the presets they stand for.

## Consequences
- An owner's TRaSH formats import directly, and the same rules give the same answers as Radarr's documentation describes.
- The engine is easy to test against a large corpus, and checkpoints 5 and 6 add rules without touching the ones here.
- With TRaSH's unlimited maximum, "Too large" only appears once an owner sets a maximum. Custom formats do the choosing, as TRaSH recommends.
- Where the documentation is silent, highsea decides for itself, and its tests record the call. A Radarr user may then see a different result, for example from BR-DISK's rank.
- Updating the presets means copying newer TRaSH JSON and recording the commit. Nothing is fetched at runtime.
