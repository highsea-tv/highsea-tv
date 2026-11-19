# Sources

Every definition here is written for highsea from the site's own published documentation, or from the page as the site serves it. None is copied from another project. Prowlarr's definitions carry no licence, and Jackett's are GPL-2.0, which an AGPL-3.0 project can't take ([phase-3-checkpoint-5.md](../../docs/plans/phase-3-checkpoint-5.md#where-definitions-come-from)). Each definition records its author as `source.author`, what it was written from as `source.documentation`, and its own licence as `license`. Ours are CC0-1.0.

| Definition | Written from | Licence |
| --- | --- | --- |
| `generic-torznab` | The [Torznab specification 1.3](https://torznab.github.io/spec-1.3-draft/torznab/Specification-v1.3.html): `t=caps`, the search functions, and the standard categories in the [Newznab API](https://torznab.github.io/spec-1.3-draft/external/newznab/api.html) | CC0-1.0 |
| `generic-rss` | The [RSS 2.0 specification](https://www.rssboard.org/rss-specification), with Torznab's `torznab:attr` elements | CC0-1.0 |
| `internet-archive` | The Internet Archive's [About Search](https://archive.org/help/aboutsearch.htm) (the scrape API and its `fields`) and [Archive BitTorrents](https://help.archive.org/help/archive-bittorrents/) (finding torrents with `format:"Archive BitTorrent"`). Each item's torrent is `{identifier}_archive.torrent` in its download listing | CC0-1.0 |
| `yts` | YTS's [API documentation](https://yts.pw/api): `list_movies.json` with `query_term` ("Movie Title/IMDb Code"), `limit` (1 to 50), and the magnet built from each torrent's hash as the page says, with trackers from the ones it recommends. The page doesn't describe a film's fields; they were read from the API's answer to a plain listing and to `query_term=tt1727587` (Sintel), 2026-11-19 | CC0-1.0 |
| `knaben` | Knaben's [API v2 documentation](https://knaben.org/api/v2): `/v2/search` and `/v2/browse` with `q`, `c` and `s`. The category ids are on its [RSS page](https://knaben.org/rss/), which its [API v1 page](https://knaben.org/api/v1) points to for them. The page doesn't describe an answer's fields; they were read from the answers to `q=sintel` and to a plain browse, 2026-11-19 | CC0-1.0 |
| `bitsearch` | BitSearch's [API documentation](https://bitsearch.eu/api): `/api/v1/search` with `q` (required), `category` (2 is Movies) and `limit` (at most 100), its example answer, and its limit of 200 requests a day per address without a key. The magnet is built from the `infohash` the search gives | CC0-1.0 |
| `torrents-csv` | Torrents-CSV's one-line API on [its home page](https://torrents-csv.com/) (`/service/search?q=&size=&after=`) and its server's [README](https://codeberg.org/heretic/torrents-csv-server) (`{torrents: [], next: LAST_ID}`). A result's fields were read from the answer to `q=sintel`, 2026-11-19, and an empty `q` answers 400. The magnet is built from the info hash | CC0-1.0 |

Each logo is a plain drawing made for highsea, not the site's mark.

### What the documentation doesn't say

- **Rate limits.** BitSearch's is published (200 requests a day per address); the definition allows 180 in any 24 hours, keeping a margin for the address's other use, and never takes part in RSS sync (`latest: false`), since its search needs a query. YTS asks clients to "keep request rates reasonable" without a number, and Knaben names none; both get 20 requests a minute, a second apart. Torrents-CSV names none either and runs on one small server; it gets 10 a minute, two seconds apart.
- **Peers.** YTS's `peers` and Knaben's `peers` are read as leechers, since each answer counts its seeders apart from them.
- **YTS's names.** The API gives each torrent's quality, type, codec, bit depth and channels as fields, not a release name. The definition composes one the parser reads: `Sintel 2010 720p BluRay x264 2.0-YTS`, with `web` as WEBRip, as YTS's own file names write it. A 3D torrent's resolution isn't given, so it parses without one.
- **Paging.** Each definition asks for one page of the most its API allows or a hundred results (YTS 50, Knaben 100 of its 300, BitSearch 100, Torrents-CSV 100); the engine reads one page per query, as it does for every definition.

## Adding a definition

1. Write it from the site's own documentation, or from its pages if there's no API, and say which in `source.documentation`.
2. Use `CC0-1.0` or `MIT` as its `license`.
3. Run `bun run catalog:build`. It validates every definition and fails with each problem listed.
4. Add a line to `CHANGES.md` under a new version.
