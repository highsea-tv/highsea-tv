# Indexers

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/indexers` (A9).
- **Roadmap:** [Phase 2 › A9](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Indexers and the independent catalog](../roadmap.md#indexers-and-the-independent-catalog), [ADR 0007](../adr/0007-signed-independent-catalogs.md).

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
- **Installed:** a `TableFrame`. Columns: indexer (privacy and priority under it), health (badge, with the error and "Trying again in 4m" under it when not healthy), queries 24h, grabs 24h, response time, success rate, an Enabled switch, actions (**Retry now** while backing off; More: Test, Remove).
- **Catalog:** a search field, a privacy segmented control (All, Public, Semi-private, Private), a language select; then cards in 1, 2 or 3 columns. Each card: name, privacy badge, description, then language · version · license in mono, and **Add** (public), **Set up** (others) or an **Installed** badge.
- **Private setup** dialog (`md`): one field per setting in the definition, each with its "where to find this" help as the hint; **Test and save**.
- **What changed** dialog: the catalog's recent versions with their notes.

## States

- **Loading:** row skeletons; catalog skeletons.
- **Empty:** "No indexers yet" · Indexers are where highsea looks for releases. Public ones are a single click. · **Browse the catalog**. A catalog filter with no matches: "Nothing in the catalog matches" · Try another filter. Missing one? Definitions are open source; anyone can add one.
- **Error:** "Couldn't load {your indexers | the catalog}" with **Try again**.
- **Live:** health changes as the clock runs (Driftnet backs off after a while; backoffs end on time).
- **Unhealthy:** Backing off (warning) with the reason and when it retries; Failing (danger); Disabled (neutral) when switched off.
- **Permission-limited:** staff only. Members get "Only owners and admins can open Indexers".

## Interactions

- **Add (public):** adds, then tests automatically. Toast: "{Name} added and tested · {result}", or a warning toast if the test fails (it stays added, so it can be fixed).
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

- `indexers.list()` → `GET /api/v1/indexers`: `Indexer` with `health`, `backoffUntil`, `lastError` and 24-hour `stats`.
- `indexers.catalog()` → `GET /api/v1/catalog/indexers`: `CatalogDefinition` with `settings: SettingField[]` (each with `help`), `privacy`, `language`, `version`, `source.license`.
- `indexers.add(definitionId, settings)` → `POST /api/v1/indexers`.
- `indexers.test(idOrDefinitionId, settings?)` → `POST /api/v1/indexers/test`: `{ ok, message, latencyMs }`. Testing a definition with settings tests before anything is saved.
- `indexers.toggle(id, enabled)`, `indexers.clearBackoff(id)`, `indexers.remove(id)`.
- `system.server().catalogVersion` for the header.
- Events: `indexers.updated`, `health.updated`.

## Decisions

- **Public is one click, then a test.** Public indexers need no settings; asking anything would only slow the common case. The automatic test catches a dead one at once.
- **Private is tested before saving.** A wrong key is the most common mistake; saving it would leave a failing indexer behind.
- **Help comes from the definition,** so the catalog, not the app, explains each tracker's fields, and fixes ship with catalog releases.
- **License on every card,** because every definition records its source and license (roadmap › indexers).
- **Retry now is in the row** only while backing off; it's the one action that state needs.

## Open questions

- **Priority.** The prototype shows priority but doesn't edit it. Drag to reorder, or a number field?
- **Per-indexer seeding rules** (ratio, time) for private trackers: here, or in a settings page per indexer?
- **Catalog updates.** Install new catalog versions automatically, or show "Catalog 2026.10.21 is available" and wait for the owner?
- **Proxies** (FlareSolverr-style) for indexers behind a challenge: in M1?
