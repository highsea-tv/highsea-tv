# Plan: keeping the indexer catalog fresh and accurate

- **Status:** scoped on 2026-11-19 (HT-78), docs only, and approved the same day with [the owner's answers](#the-owners-answers) (HT-81), two of them [changes](#the-owners-changes): challenge solving is a later, optional part ([question 9](#open-questions-for-the-owner)), and private trackers are native definitions, never through Prowlarr or Jackett ([question 11](#open-questions-for-the-owner)). Nothing is built yet.
- **Asked for by the owner on 2026-11-19:** "let's also make a plan moving forward for how we are going to actively maintain our own list of indexers that stays fresh and accurate."
- **Gate:** each part below is reviewed on its own. The parts that change a locked admin screen (C and D) are prototyped and approved first, as for any change to a locked layout; the owner's approval of 2026-11-19 is to prototype C's change to A9, and the prototype still needs their sign-off before it's built.
- **Parent plans:** [phase-5-real-use.md](phase-5-real-use.md), whose real use is where a broken indexer is first felt, and [phase-3-server.md](phase-3-server.md)'s standing rules. The catalog itself was built in [phase-3-checkpoint-5.md](phase-3-checkpoint-5.md).

## Read first

1. [ADR 0007](../adr/0007-signed-independent-catalogs.md) (signed catalogs released apart from the apps), [ADR 0033](../adr/0033-indexer-definitions.md) (the definition format), [ADR 0034](../adr/0034-catalog-service-and-signing.md) with its dated sections (the service, signing, and the release key), [ADR 0035](../adr/0035-indexer-health-and-search.md) (health, backoff, rate limits) and [ADR 0050](../adr/0050-release-and-versioning.md) (releases, and how the catalog is published today).
2. [phase-3-checkpoint-5.md › Where definitions come from](phase-3-checkpoint-5.md#where-definitions-come-from): why nothing is copied from Prowlarr or Jackett.
3. `catalog/indexers/README.md`, `SOURCES.md` and `CHANGES.md`; the definitions in `catalog/indexers/definitions/`.
4. The specs: [indexers.md](../product/indexers.md) (A9) and [setup.md](../product/setup.md) (the starter pack).
5. Pull request #80 (HT-75, `bun run catalog:verify` and `catalog/indexers/verified.json`), and the tasks in flight: HT-77 (YTS, Knaben, BitSearch, Torrents-CSV) and HT-76 (web seeds).
6. The research of 2026-11-19 on licences, other catalogues and candidate sites, summarised in [Where things stand](#where-things-stand) and carried into [the candidates file](#the-candidates-file-b).

## Goal

highsea's own indexer catalog stays honest without anyone watching it by hand every day. A definition that stops working is noticed within a week at the latest, usually sooner, and the fix reaches every server within hours of being published, without an app release. Each definition says when it was last seen working, and a broken or retired one says so in the admin in plain words instead of failing silently. New indexers are added in a known order, against a written bar, from each site's own documentation, never copied. There's one tracked list of every site considered, with its status and why. Someone outside can send a definition and knows exactly what's asked of them. Owners' servers send nothing about their indexers anywhere.

## Out of scope

- **Writing the next definitions.** HT-77 writes the four film indexers; the TV and anime ones come with shows' downloading (Phase 5's part C1). This plan sets the order and the bar, not the definitions.
- **Usenet.** The roadmap keeps it for later. The Newznab kind is built and the catalog lists no Newznab definitions ([phase-3-checkpoint-5.md, answer 2](phase-3-checkpoint-5.md#open-questions-for-the-owner)). See [Private trackers, Usenet and Newznab](#private-and-semi-private-trackers-usenet-and-newznab).
- **Solving browser challenges** (Cloudflare's and the like) now. The owner's answer of 2026-11-19 is "your own solver, later": a later, optional part (F4), with no catalog definition relying on it ([question 9](#open-questions-for-the-owner)).
- **Private trackers' definitions now.** They are a planned later part, G, which needs sign-in support in the engine and a member to verify each one; nothing is written here ([question 11](#open-questions-for-the-owner)).
- **Anime's own numbering and mappings.** A later part of shows (the owner, 2026-11-19, HT-71). Anime indexers wait for shows' downloading like the TV ones.
- **A highsea service that receives anything from servers.** highsea publishes the catalog as static files on GitHub Pages (ADR 0050) and runs no service of its own. This plan doesn't add one ([question 2](#open-questions-for-the-owner)).

## Where things stand

- **The catalog** (`catalog/indexers/`): three definitions. `generic-torznab` and `generic-rss` are generic and need an address; `internet-archive` is the only real site, and the only `starter`. Each is CC0-1.0 and records `source.author`, `source.documentation` and `license`; `SOURCES.md` lists what each was written from and has the four steps for adding one.
- **Two channels:** `definitions/` ships on both; a file in `beta/` replaces the stable one with the same id on Beta only (the catalog README). Servers choose the channel in Settings › General, the same setting that picks the release channel (ADR 0050).
- **Updates reach servers without an app update** (ADR 0007): a server checks the manifest at boot, after a minute, then every 6 hours, verifies the signature, refuses an older or other-channel manifest, and installs on its own unless the owner chose "Ask first" (ADR 0034).
- **But the channels change only with a release.** ADR 0034's section of 2026-10-22: "`release.yml` deploys the catalog's channels to Pages as part of a release … so the channels change only with a release." The Pages site is only `dist/catalog/` (`release.yml`'s `catalog` job uploads that folder alone). So today a fixed definition waits for the next app release, which is the main gap in freshness.
- **A server already notices a failing indexer** (ADR 0035): health is healthy, backing off, failing or disabled; backoff grows from 5 minutes to 6 hours; auth errors go straight to failing; the admin's A9 shows the reason and "Trying again in …", and System's health line counts them. Nobody outside the server is told, and the server can't tell a broken definition from a site that's down for an hour.
- **A definition that disappears** from the catalog marks the installed indexer as needing attention, and it skips searches until the owner acts (ADR 0034). There's no way to say *why* it went.
- **Addresses:** a definition's `links` holds up to 10 of the site's addresses, "first is the default" (`packages/schemas/src/indexers/definition.ts`), and the engine only ever uses `links[0]` (`packages/indexers/src/engine.ts`). There's no fallback and no way for the owner to pick another.
- **In flight, #80 (HT-75):** `bun run catalog:verify [id…]` searches each public definition on its real site through the engine's own `runSearch` and `fetchRelease`, fetches and parses the first release's torrent or magnet, names a Cloudflare challenge as one, and writes `catalog/indexers/verified.json` (per definition: version, result, reason, `checked`, and `verified`, the last date this version worked). The file never reaches a bundle. Its pull request leaves out a "Verified" date in the admin, because servers would only see it with a new catalog version, and a scheduled CI run, because many public sites challenge datacentre addresses and GitHub may delay or switch off scheduled workflows ([GitHub: the `schedule` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)). It also lists what the engine lacks for HTML sites: a details-page step, pagination, and dates in a site's own format.
- **The licence rule, which is firm:** Prowlarr's definitions have no licence (GitHub's API returns `license: null`), so by default "no one may reproduce, distribute, or create derivative works" ([GitHub Docs: Licensing a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)). Jackett's are GPL-2.0 with no "or later", and "the GNU AGPL is not compatible with GPLv2" ([FSF licence list](https://www.gnu.org/licenses/license-list.html#AGPLv3.0)). Even an MIT or Apache source would force its own licence on the copy, never CC0. So highsea writes each definition from the site's own documentation or its pages as served, under CC0-1.0 or MIT. Other projects' lists show which sites exist, nothing more.
- **The candidates as researched on 2026-11-19:** seven of the ten most reliable public sites have official API documentation (Internet Archive, YTS, EZTV, Knaben, BitSearch, AnimeTosho, Torrents-CSV); Nyaa, showRSS, SubsPlease and Tokyo Toshokan have plain RSS without docs; The Pirate Bay's `apibay.org` answers JSON but is undocumented; LimeTorrents, Torlock, TorrentDownloads and TheRARBG are HTML-only for search; 1337x answered with a confirmed Cloudflare challenge. Eight more sites couldn't be confirmed as up. Each result was one request from one residential address on one day.
- **The owner's approvals so far:** the film indexers first (HT-77); TV and anime (EZTV, Nyaa, AnimeTosho, showRSS, SubsPlease) wait for shows' downloading; apibay is held for the owner's word (given on 2026-11-19: Beta, after TV and anime); HTML-only sites are later, and challenged sites wait for the owner's own solver (F4).

## The parts, and their size

Seven parts. A to E are upkeep and each is a task of its own; F is the growth that runs alongside, in batches; G is native private-tracker definitions, a later part. None needs the others to start except where the table says so.

| Part | What it gives | Rough size | Needs the owner | When |
| --- | --- | --- | --- | --- |
| **A. Catalog-only publishes** | A fixed or new definition reaches servers within hours, without an app release | Half a day | Approves each publish (the `release` environment), and the first run | Next, after HT-77 |
| **B. The watch** | The candidates file; a weekly check from a home connection; others' lists watched for new and dead sites; one issue that says what's broken | 1 day | Where the check runs ([question 1](#open-questions-for-the-owner)) | After A |
| **C. Verified, broken and retired, on servers** | Each definition carries when it was last seen working and a status; the admin says "Broken: …" or "Retired: …" in words; a Report link on a failing indexer | 2 days, after a prototype | Approves the prototype of A9's changes | After A; alongside B |
| **D. Addresses** | Mirrors tried in order when the first address can't be reached; the owner can choose the address; domain moves handled as a routine fix | 1 day, after a prototype | Approves the Edit dialog's change | When a site in the catalog first moves, or with F2 |
| **E. Contributions** | A public guide to writing a definition and testing it in `/config/definitions`; issue forms for a new and a broken indexer; a pull request checklist | Half a day, docs | Reviews the guide | Any time after C |
| **F. Growth** | F1, the film indexers (HT-77, in flight); F2, TV and anime with Phase 5's C1; F3, the engine's HTML gaps, then HTML sites; F4, the owner's own challenge solver, later and optional | F2 1 to 2 days, F3 2 to 3 days | Each batch's review; apibay's word is given ([question 10](#open-questions-for-the-owner)) | F2 with C1; F3 after F2; F4 later |
| **G. Private trackers** | Sign-in support in the engine, then native definitions one tracker at a time, each written from the tracker's own API documentation and verified by a member | Scoped when it starts | A member with an account for each tracker; the review of each | Later, after F2 and C; its own plan |

**Tied into Phase 5:** A and B are small and can go between Phase 5's parts as tasks of their own, the way HT-75 and HT-77 do. F2 is part of C1's scope (shows' monitoring and downloading need TV indexers), so Phase 5's C1 names this plan. C and D change A9, a locked screen, so each starts with a prototype.

## Progress

- **2026-11-19 (HT-84), E's issue forms:** `.github/ISSUE_TEMPLATE/` has **An indexer isn't working** (the form the Report a problem link will fill; its field ids and an example URL are in [catalog/indexers/README.md](../../catalog/indexers/README.md#issue-forms)), **Suggest an indexer**, **A site moved or shut down**, a general bug report and feature idea, and `config.yml` with blank issues allowed. Not yet built: the guide, `CONTRIBUTING.md` and the pull request template.
- **2026-11-19 (HT-95), C's Report a problem, built:** in A9's More menu for an indexer from highsea's own catalog (not a Local one, one from an extra catalog or one gone from the catalog). It opens `indexer-broken.yml` in the browser with `title`, `indexer`, `indexer-version`, `catalog-version`, `highsea-version` and `channel`; never the owner's name for the indexer, its settings, an address, a search or the last error's text (which can hold an address), so `kind` and `details` are left for the owner. It's offered on every catalog indexer, not only one failing for a day: a wrong size or a failed grab never makes an indexer fail (a question for the owner). `packages/admin/src/report-problem.ts`; the public guide is Indexers › Health and backoff.
- **2026-11-19 (HT-95), C's A9 change, prototyped for the owner's sign-off:** "Checked working on …" ("Last checked working on …" after 30 days, "Not checked yet" without a date), and Beta, Broken (with "Broken since {date}. {note}") and Retired ("Retired on {date}. {note}"), drawn in the catalog's cards, the Installed table (badges by the name, lines under the health) and the Set up and Edit dialogs; a retired definition leaves the catalog's list. Drawn over the mock only: `DefinitionCheck` is optional on `CatalogIndexer` and the server leaves it out. What the server will need when it's built: the catalog build reads `verified.json` and a status per definition into `bundleSchema`, beside each definition (`verified`, `channel`, `status`, `since`, `note`), and `catalog.indexers` passes it on.

## Freshness: noticing a broken definition (B, C)

A definition breaks in four ways: the site moves (a new domain), changes its API or pages (fields go missing or the request fails), turns on a challenge, or closes. Four signals catch them, each where it's honest.

### 1. The weekly check, from a home connection (B)

`bun run catalog:verify` (HT-75) is the one check that says "this definition works", because it searches the real site and parses a real torrent or magnet. Where it runs matters more than how often:

- **Not on GitHub's hosted runners.** Many public torrent sites challenge datacentre addresses, so a run there reports challenges for definitions that work from a home (HT-75's finding). GitHub also runs scheduled workflows only on the default branch, may delay them, and turns them off in a public repository after 60 days without activity ([the `schedule` event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)).
- **Not on a self-hosted runner.** The repository is public, and GitHub says "self-hosted runners should almost never be used for public repositories on GitHub, because any user can open pull requests against the repository and compromise the environment" ([GitHub: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)).
- **From the owner's own connection,** the one highsea really searches from, on a schedule on a machine the owner controls ([question 1](#open-questions-for-the-owner)). **Decided (2026-11-19):** a weekly run on the owner's Mac by launchd ([Apple: Scheduling timed jobs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/ScheduledJobs.html)), which writes `verified.json` and keeps one GitHub issue up to date (below). It never gates anything and never pushes; the owner commits `verified.json` with the next catalog change.
- **Rate limits:** each probe is a few requests at most, inside each definition's own `rateLimit`, once a week. BitSearch allows 200 requests a day per address without a key ([BitSearch API](https://bitsearch.eu/api)), so a weekly check takes a tiny share of it.

### 2. The owner's own server (C)

The owner's NAS is the first real server, and every server already tracks its indexers' health (ADR 0035). **Decided:** the owner installs every public catalog indexer on the NAS, enabled, so a site that breaks shows up in A9 there within hours, between weekly checks. It's the same signal every owner gets; the NAS just has them all.

### 3. Owners telling us, by choice (C)

When an indexer has been failing for a day, A9's row offers **Report a problem**, which opens a new GitHub issue in the browser from an issue form ([GitHub: Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)), filled in through the URL's query parameters ([GitHub: Creating an issue from a URL query](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query)) with the definition's id, its version, the catalog version, highsea's version and the kind of failure ("Timed out", "Couldn't sign in"). No address, no settings, no search terms. Nothing is sent unless the owner reads it and submits it, under their own GitHub account. A server without a browser (the TV) doesn't show it.

### 4. No anonymous health signals (C)

**Decided: none** ([question 2](#open-questions-for-the-owner)). An opt-in count of failures per definition would find breakage sooner, but:
- highsea has nowhere to send it: the catalog is static files on Pages and there's no service to receive, store or answer anything;
- it would be the first thing a highsea server sends about what it does, and owners coming from the *arr apps self-host to keep that at home; the brand's promise is "Your own streaming platform, fully yours" ([brief.md § 1](../brand/brief.md#1-positioning));
- what an indexer is used for is sensitive in itself, and even counts by definition id show who uses which site.

The weekly check, the owner's NAS and the Report link together cover the same ground for a catalog of tens of definitions. The question stays open if the catalog grows past what one maintainer's checks can cover.

### Who is told

- **The maintainer (the owner today):** one pinned GitHub issue, "Catalog check", which the weekly run edits with its table and comments on when a result changes (`gh issue edit` and `gh issue comment`), so a change notifies the people watching the repository and the history stays in one place. Reports from owners arrive as issues with a `catalog` label.
- **Owners:** their own A9, as today (ADR 0035), plus, once a definition is marked broken in the catalog (part C), a line saying it's known and why: "The site changed how it answers searches. A fix is being worked on." Nothing else interrupts them.

### Getting a fix to servers (A)

Today a fix waits for the next app release ([Where things stand](#where-things-stand)). Part A adds a **catalog-only publish**:

- A workflow run by hand (`catalog-release.yml`), from the branch releases are made from, with the same `catalog` job `release.yml` has: build both channels from `catalog/indexers/`, sign with the release key, check production would trust it, upload `dist/catalog/` to Pages. It names the `release` environment, so it needs the owner's approval each time and the key never reaches another job ([GitHub: Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)) ([question 3](#open-questions-for-the-owner)).
- It needs a new heading in `CHANGES.md` (the catalog's version, `2026.11.20` or `2026.11.20.2`), which is what makes servers fetch the bundle (ADR 0050: a server fetches a bundle "only when the manifest's version is newer than the one installed"). `scripts/catalog.ts` refuses to publish a version that's already published.
- It keeps `releases.json` as it is, so the app releases servers know of don't change. A later app release builds the catalog the same way, so the two never disagree about what's in it.
- **How fast:** a server sees a published version at its next check, within 6 hours (ADR 0034), and Pages serves the new files within minutes. Under a day from the fix's merge to every server that installs on its own; the owner's NAS can be told to check now from A9's What changed.

## Accuracy (B, C, D)

### What "verified" means

A definition version is **verified on a date** when `catalog:verify` passed for it from a home connection on that date: its test search and, where it can search, a title search each returned at least one release with a title and a torrent address or magnet, and the first release's torrent or magnet parsed (HT-75's probes). It doesn't mean every search works, that the site is safe, or that what it lists is lawful to download. `verified` is kept through a later failure and dropped when the version changes, as HT-75 built it.

Part C carries it to servers:
- The catalog build reads `verified.json` and puts each definition's `verified` date and `status` in the bundle beside the definition (`bundleSchema` in `@highsea-tv/catalog`), so it's signed with everything else. The definitions themselves don't change.
- A9's catalog list and the indexer's Edit dialog show "Checked working on 18 Nov 2026", or "Not checked yet" for a definition with no date. Dates older than 30 days read "Last checked working on …", nothing stronger.
- Since the date only reaches servers with a new catalog version, each publish carries the latest check. That's why A comes first.

### Beta before stable

- **A new definition** goes in `beta/` first, and moves to `definitions/` after **a week on Beta with two passing weekly checks** and no reports ([question 6](#open-questions-for-the-owner)). The owner's NAS on the Beta channel is its first real user ([question 7](#open-questions-for-the-owner)).
- **A changed definition** (a new field, a new request) goes the same way.
- **A fix to a definition that's already broken on stable** may go straight to stable once `catalog:verify` passes for it: stable is already failing, so the fix can only help. The publish's notes say what was fixed.
- **Moving one to stable** is a pull request that moves the file and adds a line to `CHANGES.md`.

### Broken and retired

Part C adds an optional `status` to the bundle's entry for each definition (not to the definition's YAML, so a status change needs no new definition version):

- **Working:** the default.
- **Broken:** two weekly checks in a row failed, or the owner's NAS and a report agree. The catalog publishes it with a note written for owners. Servers keep searching it, under ADR 0035's backoff, and A9 says "Broken: The site changed how it answers searches. A fix is being worked on." A one-off failure is never enough, since a site down for an hour isn't broken ([question 5](#open-questions-for-the-owner)).
- **Retired:** the site closed, or a definition stayed broken for 30 days with no fix in sight. It disappears from A9's catalog list; an installed one needs attention as ADR 0034 already does for a definition that disappears, now with the reason: "Retired on 20 Dec 2026: the site closed." A retired entry stays in the bundle for 6 months so servers can show the note, then goes.
- Every change of status is a line in `CHANGES.md`, so What changed shows it.

### Domain moves and mirrors (D)

Public sites move often: on 2026-11-19, `yts.mx` no longer resolved and YTS answered at `yts.pw`, and EZTV, LimeTorrents, BitSearch and The Pirate Bay redirected from older domains.

- **A move is a routine fix:** the definition's `links` gets the new address first, a new patch version, `catalog:verify`, then a stable publish under the broken-fix rule above.
- **Only addresses the site itself names** go in `links`: where its old domain redirects, or the address its own pages or API docs give. Look-alike clones (the research found clones of KickassTorrents and Zooqle) are never added as mirrors, because a clone can serve anything under a familiar name.
- **The engine tries the next address** in `links` when the first can't be reached at all (DNS failure, connection refused, TLS error), not on an HTTP error, so a site that's up but failing isn't hidden. It remembers which answered until the next restart. This touches `packages/indexers/src/engine.ts` and its tests against the fake indexer.
- **The owner can choose** the address in the Edit dialog when a definition lists more than one, the way they choose any setting. A9's Edit dialog is locked, so it's prototyped first.

## Growth (F)

### The bar for adding a definition

In order of preference, and a site qualifies at the first rung it reaches:

1. **A documented API** (JSON, XML or Torznab), written from the site's own API documentation and cited in `source.documentation`. Internet Archive, YTS, EZTV, Knaben, BitSearch, AnimeTosho and Torrents-CSV.
2. **An RSS feed** linked from the site's own pages, written from the feed as served and the site's help pages. Nyaa, showRSS, SubsPlease, Tokyo Toshokan.
3. **HTML pages,** written from the pages as served, only once the engine's HTML gaps are closed (F3).

And every definition, at any rung:
- needs no account (public), or is a generic one (Torznab, RSS) the owner points at their own address;
- passes `catalog:verify` from a home connection before it's merged;
- isn't behind a challenge on its search (`catalog:verify` reports one);
- respects what the site asks of API clients: its stated rate limit in `rateLimit`, caching where the site asks for it (YTS: "Please cache responses where possible and keep request rates reasonable", [YTS API](https://yts.pw/api)), backoff on 429 (ADR 0035 already uses `Retry-After`);
- carries `license` CC0-1.0 or MIT, `source.author` and `source.documentation`, and a line in `SOURCES.md`;
- isn't a clone of a closed site.

**Undocumented APIs** (apibay, the JSON backend of The Pirate Bay) sit with HTML: they're the site's own pages as served, so writing from them is allowed, but they can change without notice and nobody promised them to anyone. **Decided (2026-11-19):** apibay goes on Beta only, after the documented ones and after TV and anime, marked "Unofficial API" in its description ([question 10](#open-questions-for-the-owner)).

### The order

1. **F1, films** (HT-77, in flight): YTS, Knaben, BitSearch, Torrents-CSV, all with documented APIs.
2. **F2, TV and anime, with Phase 5's C1:** EZTV (documented, searched by IMDb id, with its RSS for the latest), AnimeTosho (documented Torznab; its feed host didn't resolve on 2026-11-19, so it's checked first), Nyaa and SubsPlease (RSS), showRSS (RSS, latest only). Anime's search waits for anime's own part of shows, but these feeds' latest releases work for RSS sync as soon as C1 has it.
3. **apibay** on Beta, after TV and anime (the owner's word, 2026-11-19).
4. **F3, the engine's HTML gaps, then HTML sites.** HT-75 listed what's missing: a details-page step (a field read from each release's own page, ideally only for the release being grabbed), pagination, and dates in a site's own format. Each is a schema addition within engine major 1, so older servers skip definitions that need it (`minEngineVersion`, ADR 0007). Then LimeTorrents, Torlock, TorrentDownloads and TheRARBG, each on Beta first. HTML definitions break most often, so they're added only as many as the weekly check can watch.
5. **F4, challenged sites: your own solver, later** (the owner's change, 2026-11-19, [question 9](#open-questions-for-the-owner)). highsea doesn't solve a browser challenge itself, and the catalog lists no site that needs one. Later, and optionally, an owner who runs a challenge solver of their own (FlareSolverr's kind) can point highsea at it in Settings, and a search that meets a challenge goes through it. Rules for it:
   - **Optional and off by default.** highsea ships no solver and starts none; without one, a challenged site simply reports "Behind a browser challenge", as `catalog:verify` already names it.
   - **No catalog definition relies on it.** Every definition passes `catalog:verify` without a solver, so the catalog stays honest for owners who run none. A site that works only through a solver may be added as a Local definition by the owner who wants it, never to the catalog.
   - **It is a client of the owner's solver, nothing more:** an address and a timeout, the request handed over and the answer read back, written from the solver's own documentation when F4 starts. It gets its own scope and the owner's review, and waits behind F3.
   - Meanwhile Knaben's API already reaches 1337x's listings among others ("the `t` parameter filters by source tracker", [Knaben API](https://knaben.org/api/v2)), which covers most of what 1337x would add.

### The cadence

- **Weekly:** the check from the owner's connection; the issue updated.
- **When something breaks:** a fix as soon as one is written, published on its own (A), under a day to servers.
- **Monthly:** the watch over other projects' lists (below); the candidates file reviewed; anything on Beta for a week with two passes moved to stable in one publish.
- **New definitions:** in batches of two to four, each batch a task, each on Beta first. One maintainer can watch about as many definitions as the weekly check's table fits on a phone: tens, not hundreds. The catalog grows to cover films, TV and anime well, not to match the size of other projects' lists.

## Sources of truth (B)

### The candidates file (B)

One tracked file, `catalog/indexers/candidates.yml`, lists every site considered, in the catalog or not. The catalog's loader reads only `definitions/` and `beta/`, so it never reaches a bundle. Each entry:

```yaml
- id: yts                         # the definition's id when there is one
  name: YTS
  links: [https://yts.pw/]        # where the site answered, newest first
  status: in-catalog              # candidate, in-catalog, beta, held, rejected, gone
  rung: api                       # api, rss, html, none
  documentation: https://yts.pw/api
  focus: films                    # films, tv, anime, music, general
  protection: cloudflare          # none, cloudflare, ddos-guard, challenge, proof-of-work
  terms: "Free, no key. Cache responses and keep request rates reasonable."
  checked: 2026-11-19             # when this entry was last looked at
  notes: yts.mx stopped resolving; yts.lt and yts.bz redirect here.
```

- `held` and `rejected` carry the reason and, for held, whose word it waits on (apibay: the owner's).
- A test in `packages/catalog` checks it against the definitions: every definition has an entry marked `in-catalog` or `beta` on the right channel, and every such entry has a definition. It reads only the repository, so it needs no network.
- It starts from the research of 2026-11-19: the 22 candidates, the 8 sites that couldn't be confirmed as up (as `gone` with that day's result) and the 7 home pages seen but not examined (as `candidate`).
- `SOURCES.md` stays the licence record for what's in the catalog; `candidates.yml` is the list of everything considered.

### Watching other projects' lists (B)

Other catalogs show which sites exist and which have gone. They're read for names only:

- **A script,** `bun run catalog:watch`, reads the **file names** in Prowlarr's `definitions/v11` and Jackett's `src/Jackett.Common/Definitions/` through GitHub's Git trees API ([GitHub REST: Get a tree](https://docs.github.com/en/rest/git/trees#get-a-tree)), and the names in qBittorrent's official search plugins. It downloads no definition and reads no file's contents. It compares them with the last run (kept in `catalog/indexers/watch.json`, names and dates only) and with `candidates.yml`, and prints what's new and what's gone since.
- A new name becomes a `candidate` entry only after someone finds the site's own documentation or pages; a name gone from both lists is a hint to check that site, nothing more.
- A site's name and address are facts, not a definition's expression, which is why reading them is fine where copying a definition isn't. That's the research's reading of the licences, not legal advice; only names are read so that nothing of the definitions themselves is ever on hand.
- It runs monthly by hand with the weekly check's machine, and never in tests (no network in tests).
- [Question 8](#open-questions-for-the-owner) asks whether to do this at all.

## Contributions (E)

How someone outside sends a definition:

1. **Write it** from the site's own documentation, or its pages as served, never from another project's definition. The JSON Schema for the format is already exported (`packages/schemas/src/indexers/json-schema.ts`); E publishes it with the guide so editors can check a file as it's written.
2. **Try it locally:** put the YAML in the server's `/config/definitions`. The server validates it, loads it unsigned and marks it Local in A9 (ADR 0034), where Test and a search show whether it works.
3. **Run** `bun run catalog:build` (it validates every definition) and `bun run catalog:verify <id> --dry`, and paste the table into the pull request.
4. **Open a pull request** that adds the file to `beta/`, a line to `SOURCES.md`, an entry in `candidates.yml` and a line in `CHANGES.md`. The pull request template asks them to confirm, in a checkbox, that they wrote it from the site's own documentation or pages and didn't copy another project's definition, and that they license it as CC0-1.0 (or MIT) ([question 12](#open-questions-for-the-owner)).
5. **Review:** the catalog workflow validates it, runs the tests and audits the licence; the maintainer reads it against the cited documentation, runs `catalog:verify` from the home connection, and merges it to Beta.

E writes: a public guide in `apps/docs/content/indexers/` ("Write a definition", with the local path and the format reference), a `CONTRIBUTING.md` section for the catalog (the repository has none yet), two issue forms (**Suggest an indexer**: the site, its documentation, why; **An indexer is broken**: the fields the Report link fills), and the pull request template's catalog checklist. `SOURCES.md`'s "Adding a definition" points to the guide.

## Private and semi-private trackers, Usenet and Newznab

- **Private and semi-private trackers: native definitions, a planned later part (G)** (the owner's change, 2026-11-19, [question 11](#open-questions-for-the-owner)). highsea replaces Prowlarr and Jackett; it doesn't ask owners to run either beside it, and this plan leans on neither. A private tracker's search is a native definition, in highsea's own format, like any other. The generic Torznab definition stays only for a feed a tracker or site serves itself, with the key the site gives its members. Part G:
  - **Sign-in support in the engine first.** The format has an API key, a cookie and a form login (ADR 0033). G starts by listing what the first trackers' own documentation asks for beyond that (a passkey in the address, a token endpoint, a session that expires and signs in again, a refusal of automated sign-in) and adds only what a documented tracker needs, as a schema addition within the engine's major version (`minEngineVersion`, ADR 0007). Two-factor sign-in and solving anything for a person are not part of it.
  - **Each definition written from the tracker's own API documentation,** cited in `source.documentation`, never from another project's definition, and only where the tracker's rules allow API clients. Documentation is often behind a member's sign-in, so a member supplies it.
  - **Verified by a member with an account.** highsea can't test without one, and `catalog:verify` skips private definitions. The gate for a definition is a member who writes or reads it against the documentation, runs it on their own account, and says so in the pull request; it goes on Beta, and the maintainer records who verified it and when in `candidates.yml`. Without a member to keep checking it, it isn't added, and a private definition no member has checked in 90 days is marked "Not checked recently" rather than Broken.
  - **Never unasked.** Trackers are taken one at a time, when a member offers; nothing is written on spec. Seeding rules per tracker are already built (checkpoint 6a).
  - G gets its own plan when a member and a tracker are ready. It follows F2 and C, since the verified date and the status are what show a member's check.
- **Usenet and Newznab: with Usenet.** Newznab indexers all need accounts and are useless without a Usenet download client, which the roadmap keeps for later. When Usenet comes, the catalog adds a generic Newznab definition first, like the Torznab one, and the bar above applies to any named one.

## What highsea ships by default

- **The `starter` flag** puts a public definition in setup's indexer step, checked by default ([setup.md](../product/setup.md), step 5: "Public indexers checked"). Today only the Internet Archive has it.
- **Decided (2026-11-19):** `starter` stays for sources whose whole catalog is lawful to share, like the Internet Archive's public domain and openly licensed films. General public torrent indexers are never `starter` and never on by default: the owner adds each in A9, knowing what it is ([question 4](#open-questions-for-the-owner)). Setup keeps working with no general indexer, as it does today.
- **What A9 says** about a general public indexer, in the brief's voice ([brief.md § 6](../brand/brief.md#6-voice-and-tone)), as its description's last line: "A public site that lists torrents other people share. Check you have the right to download what you grab." Plain, once, no warning colours, and nothing about the law of any one country.
- **The guides** say the same in Indexers › Add an indexer, and that highsea neither hosts nor checks what an indexer lists.

## ADRs

- **New: "Keeping the indexer catalog fresh"** (the next free number when it's written; 0069 at the time of writing): catalog-only publishes; verified dates and a status carried in the signed bundle; Beta before stable and the broken-fix exception; the weekly check from a home connection, never CI; no health signals from servers; the bar for adding a definition and its rungs; names-only watching of other projects. Written with part A and extended by C.
- **ADR 0034, a dated section (A, C):** the catalog publishes without a release, and the bundle carries `verified` and `status` per definition.
- **ADR 0050, a dated section (A):** a catalog-only publish beside the release, from the same job, with its own `CHANGES.md` version and `releases.json` unchanged.
- **ADR 0033, a dated section (D, F3, G):** the engine falls back through `links`; the HTML additions (details page, pagination, date formats) and their engine version; later, the sign-in additions private trackers need.
- **A later ADR (F4, G):** the optional challenge-solver address, and native private-tracker definitions with a member's verification, each when its part is scoped.
- **ADR 0035, a dated section (C):** a broken definition keeps its backoff and gains the catalog's note; Report a problem.

## Risks

- **One maintainer.** The weekly check and the monthly watch depend on the owner's machine and time. The catalog is kept small on purpose, the check is automatic, and the Report link brings owners' eyes in. If the Mac is off for a week the issue simply isn't updated, and its date shows that.
- **A bad catalog publish reaches every server within hours.** Signing, replay protection, validation of every definition before install (ADR 0034) and the Beta channel limit it; the broken-fix path skips Beta only for a definition already failing. A server that fails to install a catalog keeps the one it had.
- **Sites change faster than weekly.** Between checks, owners see ADR 0035's backoff, which is honest about it; the owner's NAS usually sees it first.
- **A copied definition slips in.** The pull request checkbox, a cited `source.documentation` and the maintainer's read against that documentation are the guard. No automatic comparison with Prowlarr's or Jackett's text is planned, since that would mean downloading their files.
- **Takedown notices.** The definitions hold no copyrighted media, only how to search a site, but a site or a rights holder may still send GitHub a notice under its DMCA policy ([GitHub's DMCA Takedown Policy](https://docs.github.com/en/site-policy/content-removal-policies/dmca-takedown-policy)). Keeping general public indexers off by default and the catalog to documented APIs keeps highsea's position simple; the owner decides what to do with any notice.
- **Rate limits and goodwill.** The check, the owner's NAS and owners' searches all share each site's per-address limits. Weekly probes are a few requests; Knaben's operator asks that no one client keep the server busy ([Knaben API](https://knaben.org/api/)).
- **Domain fallback hides a hijacked domain.** If a site's old domain is taken over, its next address is only used when the first can't be reached at all, and only addresses the site itself named are listed; a takeover that answers is caught by the check's parse, not by the fallback.

## Open questions for the owner

1. **Where the weekly check runs.**
   - **Recommended:** on the owner's Mac by launchd, weekly, keeping one "Catalog check" issue up to date; the NAS with every public indexer installed as the second signal. A home connection, nothing new to host.
   - Or: on the NAS in a container through DSM's Task Scheduler, the exact connection highsea searches from, but it needs the repository and Bun on the NAS and a token there to update the issue.
   - Or: a GitHub-hosted scheduled run limited to whether each site answers at all (DNS, TLS, status), labelled as such; it's free and always on, but it can't say a definition works, and challenges from datacentre addresses would make it noisy.
2. **Health signals from owners' servers.**
   - **Recommended:** none. A **Report a problem** link on a failing indexer opens a pre-filled GitHub issue the owner chooses to send. Nothing leaves a server on its own.
   - Or: an opt-in, anonymous count of failures per definition, sent daily; faster to notice, but it needs a service highsea doesn't run, a privacy notice, and it would be the first thing a server sends about what it does.
3. **How a catalog fix is published.**
   - **Recommended:** a separate workflow run by hand, with the `release` environment's approval each time, publishing only the catalog. Under a day from fix to servers; the owner stays the one who publishes.
   - Or: publish automatically when a catalog change merges, still behind the environment's approval; one step less, but every catalog merge asks for an approval whether it's urgent or not.
   - Or: keep publishing only with app releases; nothing to build, but a fix waits for the next release.
4. **Public indexers on by default.**
   - **Recommended:** never. `starter` stays for lawful-to-share sources like the Internet Archive; YTS and the rest are added by the owner in A9.
   - Or: offer the film indexers in setup's step, unchecked; easier to find, but setup then suggests sites whose contents highsea can't vouch for.
5. **What servers do with a definition marked broken.**
   - **Recommended:** keep searching it under the usual backoff and say "Broken: …" with the note; retire it after 30 days with no fix.
   - Or: skip it in searches until a fix arrives; quieter logs, but a site that recovers on its own stays unused until a new catalog version.
6. **How long a new definition stays on Beta.**
   - **Recommended:** a week and two passing weekly checks, no reports; fixes to an already broken stable definition may skip Beta.
   - Or: until the owner moves it by hand; more control, more to remember.
7. **The owner's NAS on the Beta channel.**
   - **Recommended:** yes, so new definitions have a real user before stable. Beta also announces beta app releases, which the NAS's Package Center install doesn't take on its own.
   - Or: keep the NAS on Stable and test Beta definitions only with `catalog:verify`.
8. **Watching other projects' lists.**
   - **Recommended:** monthly, file names only, from Prowlarr's and Jackett's trees and qBittorrent's plugins, by a script that downloads no definition.
   - Or: by hand when the candidates are reviewed; no script, easier to forget.
   - Or: not at all; new sites come only from owners' suggestions.
9. **Sites behind a browser challenge (1337x and the like).**
   - **Recommended:** never in the catalog, and no challenge solving in highsea. Knaben's API covers much of what they list.
   - Or: later, let an owner point highsea at a challenge solver they run themselves (FlareSolverr's kind), with no definition in the catalog relying on it.
10. **The Pirate Bay's apibay.**
    - **Recommended:** on Beta, after F2, marked "Unofficial API", held to the same weekly check; it's the largest general index and answers plain JSON, but nothing promises it.
    - Or: keep it held until the HTML sites (F3), treated as one of them.
    - Or: never, as an undocumented backend.
11. **Private and semi-private trackers.**
    - **Recommended:** through the generic Torznab definition and Prowlarr or Jackett; native ones only when a member writes one from the tracker's own API docs and its rules allow it.
    - Or: none in the catalog at all, ever; simpler, but owners on a tracker with a documented API keep needing Prowlarr.
12. **The licence contributors give.**
    - **Recommended:** CC0-1.0 by default, MIT allowed, stated by a checkbox in the pull request with "written from the site's own documentation or pages"; no separate agreement to sign.
    - Or: CC0-1.0 only; one licence for the whole catalog, but a contributor who wants attribution can't use MIT.
13. **"Checked working on …" in the admin** (part C, a change to the locked A9).
    - **Recommended:** yes: the date in A9's catalog list and the Edit dialog, and "Broken" or "Retired" with the note, prototyped first.
    - Or: keep verification in the repository only; nothing on a locked screen changes, but owners can't tell a known breakage from their own setup.

## The owner's changes

On 2026-11-19, reviewing this scope, the owner made 3 changes:

1. **Browser challenges: "your own solver, later", not never** (question 9). Not part of the catalog and not built now, but a later, optional part: an owner may point highsea at a challenge solver they run themselves, with no catalog definition relying on it. [F4](#the-order) and [Out of scope](#out-of-scope) say so, and the table's row for F follows.
2. **highsea replaces Prowlarr and Jackett; it doesn't integrate with them** (question 11). In the owner's words: "highsea is not meant to integrate with other apps like Prowlarr or Jackett - highsea is and has always been meant to *replace* them". Asked what that means for private trackers, they chose native definitions as a planned later part: sign-in support in the engine, each definition written from the tracker's own API documentation and verified by a member with an account, since highsea can't test without one; the generic Torznab connector stays only for a feed a tracker serves itself. This plan no longer relies on Prowlarr or Jackett anywhere: [part G](#the-parts-and-their-size) and [Private and semi-private trackers](#private-and-semi-private-trackers-usenet-and-newznab) are new, and the generic Torznab definition's text and the guides stop suggesting a feed from either app. **It reaches beyond this plan:** the same rule applies to every plan, guide and screen (the roadmap carries a dated note, and `docs/status.md` records it); migrating from those apps stays a separate, fine thing.
3. **Prototype a change to the locked A9** (question 13). The owner approved prototyping "Checked working on …" and Broken or Retired in the Indexers screen. The prototype still needs their sign-off before it's built ([part C](#the-parts-and-their-size)).

## The owner's answers

On 2026-11-19 the owner took every recommendation for questions 1 to 13 except 9 and 11, which they changed:

1. **The weekly check runs on the owner's Mac** (launchd), keeping one "Catalog check" issue up to date; the NAS with every public indexer is the second signal.
2. **No health signals from servers.** A Report a problem link on a failing indexer opens a pre-filled GitHub issue the owner chooses to send.
3. **A separate hand-run catalog workflow,** with the `release` environment's approval each time.
4. **Public indexers are never on by default.** `starter` stays for lawful-to-share sources.
5. **A broken definition keeps being searched under backoff,** says why, and is retired after 30 days with no fix.
6. **A week on Beta and two passing weekly checks;** a fix to an already broken stable definition may skip Beta.
7. **The owner's NAS follows Beta.**
8. **Other projects' lists are watched monthly** by a script, file names only.
9. **Changed by the owner:** sites behind a browser challenge: **your own solver, later.** Not never: later and optional, an owner may point highsea at a solver they run themselves, with no catalog definition relying on it ([F4](#the-order)).
10. **apibay on Beta, after TV and anime,** marked "Unofficial API".
11. **Changed by the owner:** private trackers are **native definitions as a planned later part (G)**, not through Prowlarr or Jackett: sign-in support in the engine, each written from the tracker's own API documentation and verified by a member with an account. The generic Torznab connector stays only for a feed a tracker serves itself.
12. **CC0-1.0 by default, MIT allowed,** stated by a checkbox in the pull request.
13. **"Checked working on …" and Broken or Retired in A9,** prototyped first (the owner's approval to prototype a change to the locked A9; the prototype still needs their sign-off).
