# 0069. Keeping the indexer catalog fresh: stages, a weekly check from home, and catalog-only publishes

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

The indexer catalog ([ADR 0007](0007-signed-independent-catalogs.md), [ADR 0034](0034-catalog-service-and-signing.md)) changed only with an app release, so a fixed definition waited for the next one, and nothing said whether a definition still worked. [The upkeep plan](../plans/indexer-catalog-upkeep.md), approved with the owner's answers of 2026-11-19, decides how the catalog stays honest: a weekly live check from the owner's own connection, Beta before stable, a broken status servers keep searching under backoff, retirement after 30 days broken, public indexers never on by default, catalog-only publishes behind the owner's approval, and other projects' lists watched by file name only. HT-94 builds the machinery for parts A and B and the data part C's admin will show.

## Decision

**Stages live beside the definitions, not in them.** `catalog/indexers/stages.json` keeps, per definition (by id, or `beta/<id>` for the beta channel's, as `verified.json` does): its status (`working`, `broken`, `retired`), since when, a note for owners, and the counts the rules read (the version they're for, its first check, its passing checks, its failures in a row). A status change needs no new definition version. Its schema (`stagesFileSchema` in `packages/catalog/src/stages.ts`) is checked by the build, as `verified.json`'s is. The rules (`applyChecks`):

- A definition in `beta/` moves to stable when its version has been checked for at least 7 days with two passing checks, it passed this week, and no open "An indexer isn't working" report names it.
- Two failing checks in a row make it broken; a challenge page counts as a failure, a skipped check counts as nothing. One pass recovers it. The owner may also set broken by hand when the NAS and a report agree.
- Broken for 30 days is reported as due for retirement; retiring is the owner's call (`catalog:check retire <id> --note`), since only they know whether a fix is in sight. A retired definition's file goes, so older servers see it disappear (ADR 0034's needs-attention path), and its note stays in the bundle for 183 days (about 6 months), counted from the catalog version's date so the build stays deterministic.
- `stages.json`'s `starters` lists the only definitions setup may check by default; the build refuses any other `starter`, and any starter on Beta (the owner's answer 4).

**The bundle carries each definition's standing.** The build puts, per id, the stage, status, since, note, and the last check's date, result and last working date in an optional `status` field of the bundle, so it's signed with the definitions. A check or status for another version of the definition isn't carried: a new version reads as not checked yet and working. **Versions:** the bundle's format stays 1. `bundleSchema` is a Zod object, which strips keys it doesn't declare ([Zod: objects](https://zod.dev/api#objects)), so older servers install such a bundle and ignore the field; newer servers parse each entry on its own (`readStatuses`) and skip one they can't read, so a later status or field never stops an install. The catalog service keeps the map per origin and answers `statusOf(id)`, retired ids included.

**The weekly check runs on the owner's Mac** (`bun run catalog:check`), by a per-user launchd agent (`StartCalendarInterval`, Mondays at 09:00; launchd runs a missed interval on wake, `launchd.plist(5)`), installed with `bun run catalog:check schedule` and loaded with `launchctl bootstrap` (`launchctl(1)`). Never CI: datacentre addresses meet challenges, scheduled workflows can be delayed or switched off, and self-hosted runners don't suit a public repository (the plan's B). It updates `verified.json`, `stages.json`, moves promoted files, adds a `CHANGES.md` version for each change of status, refreshes the seed, and prints a report; it commits and pushes nothing. With `--github` it reads open reports with the owner's `gh` and keeps one "Catalog check" issue up to date.

**A catalog-only publish** (`catalog-release.yml`) is run by hand from `next`, checks first (the catalog's tests, the licence audit, and `catalog.ts publishable`: a `CHANGES.md` version newer than both live channels and a `releases.json` equal to what's published), then builds and signs in the `release` environment, so it waits for the owner's approval each time ([Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)), then deploys Pages. It reuses the release's catalog steps through a composite action, `.github/actions/catalog` ([Creating a composite action](https://docs.github.com/en/actions/sharing-automations/creating-actions/creating-a-composite-action)), rather than a reusable workflow: the calling job keeps its name, `needs` and `environment`, so `release.yml`'s gate and its one approval are unchanged. Both workflows share the `release` concurrency group, so they never deploy Pages at once.

**Other projects' lists are read for names only** (`bun run catalog:watch`): the file names in Prowlarr's, Jackett's and qBittorrent's folders through the Git trees API, never a file's contents, kept month to month in `watch.json`.

## Consequences

- A fix reaches servers within a day of its merge without an app release, and every publish carries the latest check.
- The seed changes whenever `verified.json` or `stages.json` does; `catalog:check` refreshes it, and anything else that edits them runs `bun run catalog:build --seed`.
- The checks depend on the owner's Mac being on; the issue's date shows a missed week.
- The admin's "Checked working on …", Broken and Retired lines (part C) read `statusOf` and the definition's `status`; the API contract carries them when that part is built.
