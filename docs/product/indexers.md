# Indexers

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/indexers` (A9).
- **Roadmap:** [Phase 2 › A9](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Indexers and the independent catalog](../roadmap.md#indexers-and-the-independent-catalog), [ADR 0007](../adr/0007-signed-independent-catalogs.md).
- **Built:** Phase 3 checkpoint 5 ([plan](../plans/phase-3-checkpoint-5.md)), with [ADR 0033](../adr/0033-indexer-definitions.md), [0034](../adr/0034-catalog-service-and-signing.md) and [0035](../adr/0035-indexer-health-and-search.md).

## Purpose

Where highsea looks for releases. The page shows whether each indexer is working and how much it's used, and adds new ones from the catalog: public indexers in one click, private ones through a form that explains each field. The catalog is versioned and released on its own, so the page also says which version is installed and what changed.

## Entry points

- Sidebar: **Indexers** (staff).
- The dashboard's Indexers widget and its empty state's **Add indexers**.
- The System health line "No indexers are enabled…" on a new server.
- Setup's starter pack (A2) adds the first ones.

## Layout

- `PageHeader`: "Indexers"; the description "Catalog 2026.10.14, updated on its own schedule. **What changed**"; **Add indexer** (jumps to the Catalog tab).
- Tabs (line): **Installed** (count), **Catalog**.
- **Installed:** a `TableFrame`. Columns: indexer (privacy and priority under it), health (badge, with the error and "Trying again in 4m" under it when not healthy), queries 24h, grabs 24h, response time, success rate, an Enabled switch, actions (**Retry now** while backing off; More: **Edit**, Test, Remove). An indexer from `/config/definitions` carries a **Local** badge. One whose new definition version asks for a setting, or whose definition is gone, says so under its health and skips searches until it's fixed.
- **Catalog:** a search field, a privacy segmented control (All, Public, Semi-private, Private), a language select; then cards in 1, 2 or 3 columns. Each card: name, privacy badge (and **Local** for a definition from `/config/definitions`), description, then language · version · license in mono, and **Add** (public, with nothing to fill in), **Set up** (others, and public ones that need a setting such as an address) or an **Installed** badge.
- **Private setup** dialog (`md`): one field per setting in the definition, each with its "where to find this" help as the hint; **Test and save**.
- **Edit** dialog (`md`, from More): the same generated form, prefilled, plus the name and **Priority** (1 to 50, 25 by default, lower first). A secret field shows empty; leaving it empty keeps the saved one. New settings are tested before saving, as in setup. *As built (8c):* the dialog adds **Tags** after Priority: an indexer with tags is used only for movies sharing one, in a search and in RSS; with none, for every movie (Radarr's rule, [wiki.servarr.com/radarr/settings#tags](https://wiki.servarr.com/radarr/settings#tags)). Not in the prototype.
  - **Seeding** (checkpoint 6a, 2026-10-20): **Ratio**, **Time, in hours** and **Minimum, in hours** ("For trackers with hit-and-run rules."), under "Stops at the ratio or the time, whichever comes first, and never before the minimum. An empty ratio or time uses Settings › Download client's." An empty ratio or time reads **Default**, an empty minimum **None**. A torrent grabbed from the indexer keeps the rule it was grabbed with, shown on Downloads' Seeding tab.
- **What changed** dialog: the catalog's recent versions with their notes. When updates ask first (Settings › General › Catalog), a waiting version is shown at the top with **Install**.

## States

- **Loading:** row skeletons; catalog skeletons.
- **Empty:** "No indexers yet" · Indexers are where highsea looks for releases. Public ones are a single click. · **Browse the catalog**. A catalog filter with no matches: "Nothing in the catalog matches" · Try another filter. Missing one? Definitions are open source; anyone can add one.
- **Error:** "Couldn't load {your indexers | the catalog}" with **Try again**.
- **Live:** health changes as the clock runs (Driftnet backs off after a while; backoffs end on time).
- **Unhealthy:** Backing off (warning) with the reason and when it retries; Failing (danger); Disabled (neutral) when switched off.
- **No reduced states.** Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md)); users get the refusal page.

## Interactions

- **Add (public):** tests, then adds only if the test passed. Toast: "{Name} added and tested · {result}". A failed test adds nothing and says why in an error toast. (Changed at checkpoint 5 from "stays added": the server never stores an indexer that didn't answer, so public and private work the same way.)
- **Set up (private):** fields are validated on submit ("Enter your username."). The test runs before saving; a failed test keeps the dialog open with the indexer's message in an alert, e.g. "Bosun rejected the API key (401). Copy it again from your profile." Nothing is saved until it passes.
- **Retry now** clears a backoff and puts the indexer back in rotation.
- **Test** (menu) shows the result as a toast with the latency.
- **Enabled** saves on change.
- **Keyboard:** every control is native or Radix, in reading order.
- **Sound:** none.

## Copy

| Where | Text |
| --- | --- |
| Header description | Catalog {version}, updated on its own schedule. What changed |
| Setup dialog | Set up {Name} · highsea tests these before saving. They stay on your server. |
| Field help (private) | On {Name}, open your profile, then Security. Copy the key labelled "API". |
| Test ok toast | {Name} works · {message} ({n} ms) |
| Test failed toast | {Name} didn't answer · {message} |
| Retry toast | {Name} is back in rotation |

## Data

As built at checkpoint 5 (`@highsea/api-contract`'s `indexers.ts`). All routes are staff; the catalog's settings are the owner's.

| SDK | Route | Notes |
| --- | --- | --- |
| `indexers.list()` | `GET /api/v1/indexers` | `Indexer`: `health`, `backoffUntil`, `failingSince`, `lastError`, `needsAttention`, `missing`, `local`, 24-hour `stats` (response time and success rate are null before the first query), and `settings` as plain values plus whether each secret is set |
| `catalog.indexers({ starter? })` | `GET /api/v1/catalog/indexers` | `CatalogIndexer`: `settings: SettingField[]`, `privacy`, `kind`, `protocol`, `language`, `version`, `source` (`author`, `documentation`), `license`, `local`, `origin`, `installed`. `?starter=true` for setup |
| `indexers.add({ definitionId, settings, name?, priority? })` | `POST /api/v1/indexers` | Tests first and adds only on a pass; returns `{ indexer, test }`. A failed test answers 400 with the result in `details.test` |
| `indexers.test({ id, settings? })` | `POST /api/v1/indexers/test` | `{ ok, message, latencyMs }`. `id` is an installed indexer or a definition |
| `indexers.update(id, { name?, enabled?, priority?, settings?, seeding? })` | `PATCH /api/v1/indexers/{id}` | Replaces the draft's `toggle`; new settings start over (no backoff, no saved sign-in). `seeding` (checkpoint 6a) is `IndexerSeeding`: `ratio`, `minutes`, `minMinutes`, each null for Settings › Download client's; `Indexer` carries it too |
| `indexers.retry(id)` | `POST /api/v1/indexers/{id}/retry` | The draft's `clearBackoff` |
| `indexers.remove(id)` | `DELETE /api/v1/indexers/{id}` | |
| `catalog.status()` | `GET /api/v1/catalog` | The version, channel, last check, `changes` for What changed, and `available` when updates ask first |
| `catalog.check()` | `POST /api/v1/catalog/check` | Checks now |
| `catalog.install()` | `POST /api/v1/catalog/install` | Installs the waiting version |
| `catalog.settings()`, `catalog.updateSettings(patch)` | `GET`, `PATCH /api/v1/catalog/settings` | Owner only: channel, automatic updates, extra catalogs |

- `system.server().catalogVersion` for System › About.
- Events: `indexers.updated`, `catalog.updated`, `health.updated`.

## Decisions

- **Public is one click, then a test.** Public indexers need no settings; asking anything would only slow the common case. The automatic test catches a dead one at once.
- **Private is tested before saving.** A wrong key is the most common mistake; saving it would leave a failing indexer behind.
- **Help comes from the definition,** so the catalog, not the app, explains each tracker's fields, and fixes ship with catalog releases.
- **License on every card,** because every definition records its source and license (roadmap › indexers).
- **Retry now is in the row** only while backing off; it's the one action that state needs.

- **Priority is a number** (1 to 50, 25 by default, lower first, the scale Radarr and Prowlarr document) in an Edit dialog from the row's More menu (checkpoint 5, answer 5; the Edit item is an approved change to the locked layout).
- **Catalog updates install on their own,** with the version and What changed here; Settings › General › Catalog switches to "Ask first" (answer 4).
- **Seeding rules are per indexer** (checkpoint 5, answer 5), in the Edit dialog since checkpoint 6a, falling back to Settings › Download client's default rule (a ratio of 2 or 7 days). Times are entered in hours.
- **Definitions are highsea's own,** written from each site's documentation under CC0-1.0 (ADR 0033): Prowlarr's have no licence and Jackett's are GPL-2.0.

## Open questions

- **Proxies** (FlareSolverr-style) for indexers behind a challenge: in M1?
