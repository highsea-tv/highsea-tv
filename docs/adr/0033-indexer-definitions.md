# 0033. Indexer definitions: highsea's own declarative format, written by us

- **Status:** Accepted
- **Date:** 2026-10-20
- **Amended:** 2026-10-20, the package is `@highsea/schemas/indexers`, first written as `@highsea/indexer-schema` ([ADR 0036](0036-domain-packages-with-subpath-exports.md))

## Context
Checkpoint 5 brings indexers ([phase-3-checkpoint-5.md](../plans/phase-3-checkpoint-5.md)). ADR 0007 already decided that definitions are declarative data in a signed catalog, released apart from the server. Two things were still open: what the format is, and where the definitions come from.

The roadmap assumed highsea would reuse Prowlarr's or Jackett's Cardigann definitions. Checked on 2026-10-20:
- [Prowlarr/Indexers](https://github.com/Prowlarr/Indexers) has no licence file, so its definitions can't be copied;
- [Jackett](https://github.com/Jackett/Jackett) is GPL-2.0, which the roadmap already rules out of an AGPL-3.0 project, and many of Prowlarr's definitions began as Jackett's.

The owner chose to write our own (checkpoint 5, answer 1).

## Decision
- **highsea's own format** (`@highsea/schemas/indexers`). It is shaped by the same needs as Cardigann's but written from our own specification, with no schema or definition copied. One definition is one YAML or JSON document. A zod schema gives its shape and `validateDefinition` adds the checks a shape can't express. A JSON Schema is generated for editors (`z.toJSONSchema`, [zod.dev/json-schema](https://zod.dev/json-schema)).
- **Five kinds:**
  - **`torznab`** and **`newznab`**, the standard APIs, read through `t=caps`, `t=movie` and `t=search` as the [Torznab 1.3 specification](https://torznab.github.io/spec-1.3-draft/torznab/Specification-v1.3.html) and the [Newznab API](https://torznab.github.io/spec-1.3-draft/external/newznab/api.html) describe;
  - **`json`**, an HTTP API with request templates and a field path for each release field;
  - **`html`**, pages read with CSS selectors through cheerio's htmlparser2 build ([cheerio 1.0](https://cheerio.js.org/blog/cheerio-1.0/));
  - **`rss`**, a feed with an optional enclosure and `torznab:attr` fields.

  XML is parsed with fast-xml-parser after its validator, with every value kept as text.
- **What every definition carries:**
  - its identity: id, version, `minEngineVersion`, name, description, privacy, language and categories mapped to the standard Newznab categories;
  - its settings fields, each with "where to find this" help text, plus which ones are secret;
  - the login: none, an API key, a cookie, or a form login with a "signed in" selector;
  - request templates and field mappings;
  - rate-limit hints and a test query;
  - `source` (author and the documentation it was written from) and `license` (an SPDX id).
- **A closed template language** for URLs, query values, headers and composed fields. A template:
  - reads named roots (`.Config`, `.Query`, `.Result`);
  - tests them with `if`/`else`;
  - passes them through a fixed list of filters.

  There are no loops and no function calls, and nothing outside those roots can be named. A definition from a remote catalog can't make the engine do anything it doesn't already do. Requests stay on the definition's own origin (`joinUrl` refuses others) and use the http(s) schemes only.
- **The engine version** is a semver number (`ENGINE_VERSION`, 1.0.0). A definition whose `minEngineVersion` major is higher than the engine's is skipped. Within a major the engine stays backward compatible (ADR 0007).
- **Validation** runs in three places: the catalog pipeline, the server when it loads a definition, and a test over every definition in the repository.
- **Licences:**
  - our definitions are CC0-1.0, and contributions may be MIT;
  - `bun run licenses` refuses any other licence, and any definition without `source` and `license`.
- **What ships first** (answer 1): a generic Torznab definition, which also lets an owner point at an existing Prowlarr or Jackett, a generic RSS feed, and the Internet Archive's documented scrape API.
- **Newznab** is built but has no definitions in the catalog, and search leaves Usenet out until Usenet arrives (answer 2).

## Consequences
- No third-party definition text is in highsea, so the catalog's licence is clear.
- The catalog starts small and grows by contribution. Owners with Prowlarr or Jackett can use all of their indexers at once through the generic Torznab definition.
- A definition can't do more than the engine allows. Supporting a site the format can't describe means adding to the engine and raising its minor version, never a script in a definition.
- An HTML site that changes its layout returns no results, and the engine can't tell that apart from a search that found nothing. A JSON API that changes its shape fails as a parse error.

## 2026-11-19: engine 1.2, sites that take only an id or nothing, a feed's own elements, and anime kept out of automatic grabs (HT-110)

Phase 5's C1 brings the TV and anime sites (part F2 of `docs/plans/indexer-catalog-upkeep.md`). Their own pages describe interfaces the 1.1 format couldn't:

- **EZTV's API** looks a show up by its IMDb id and nothing else: no words, season or episode ([EZTV API](https://eztvx.to/api/)).
- **SubsPlease's and showRSS's feeds** take no search at all; they list the newest releases ([SubsPlease RSS](https://subsplease.org/rss-feeds/), [showRSS](https://showrss.info/browse/all)).
- **Nyaa's and showRSS's feeds** keep seeders, size, info hash and the release's own name in their own namespaced elements (`nyaa:seeders`, `tv:raw_title`), not in Torznab's `torznab:attr` ([RSS 2.0](https://www.rssboard.org/rss-specification), "Extending RSS": a feed may add elements in a namespace).

What the engine does from 1.2.0 (`ENGINE_VERSION`, `packages/schemas/src/indexers/version.ts`):

- **`search.supports` may be empty**, for a site that can't be searched. Validation then requires `latest`, since a site that can neither be searched nor listed has nothing to offer. Searches pass such a site by (`searchable`, `packages/indexers/src/search.ts`); its test and the newest-releases read still use it.
- **Keywords go only to a site whose `supports` lists `q`.** A tier with words is skipped for any other, so EZTV is never sent a title it would ignore and answer with every show.
- **An id alone, for a site that takes an id and no season.** A show's search otherwise sends ids only with `season` (Torznab's tv-search); EZTV gets the IMDb id by itself and the parser picks the episodes out of the show's releases.
- **`search.elements`** (RSS kind) names the item's own element for a release field, read before RSS's element for it: `title`, `guid`, `download`, `magnet`, `infohash`, `details`, `size`, `seeders`, `leechers`, `grabs`, `published`, `imdbId`, `tvdbId` and `category` (mapped through the definition's categories). An enclosure of `length="0"` is read as an unknown size, as a magnet has no file to measure.
- **A film's search and its RSS sync pass by a site with no film category** (`servesFilms`), and a bare test or newest-releases read on such a site keeps every kind, so Nyaa's anime isn't filtered out as not a film.
- **The automatic show search passes by a site that lists only anime** (`onlyAnime`: TV/Anime, 5070, and no other TV or film category; `automatic` on the show search, set by the runtime for Search and its retries). Anime's releases count episodes from the show's start (`- 13`) or by cour, which highsea can't place until anime's own part (absolute numbering and its mapping to TMDB's seasons); the parser reads only those that name their season (`S2 - 07`, `2nd Season - 07`). Interactive search still asks such a site and shows each release with its reasons.

A server on engine 1.1 doesn't load these definitions: the new fields don't validate there, which it logs, and the catalog's notes say they need 1.2.
