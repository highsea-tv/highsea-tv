# Saved answers from the public indexers' APIs

Small answers in each API's documented shape, trimmed by hand from neutral queries (Sintel, the Blender Foundation's open film) made on 2026-11-19, for `test/public-sites.test.ts`. They keep only the fields the definitions read, except `archive-query-ignored.json` below. The titles name open films; the other info hashes, sizes and counts are made up.

| File | API | Its documentation |
| --- | --- | --- |
| `yts-imdb.json`, `yts-latest.json`, `yts-none.json` | YTS `list_movies.json` | https://yts.pw/api |
| `knaben-search.json`, `knaben-browse.json` | Knaben `/v2/search`, `/v2/browse` | https://knaben.org/api/v2 |
| `bitsearch-search.json` | BitSearch `/api/v1/search` | https://bitsearch.eu/api |
| `torrents-csv-search.json` | Torrents-CSV `/service/search` | https://codeberg.org/heretic/torrents-csv-server |

`archive-query-ignored.json` is a real answer from the Internet Archive's scrape API (https://archive.org/help/aboutsearch.htm), trimmed to its first five items: on 2026-11-19 it answered the catalog definition's search for His Girl Friday (1940), `title:(His Girl Friday) AND year:1940`, with the newest of all 29,484 torrent-shared feature films, as if the title and year weren't there (HT-85). The fake serves it for the `ignores-query` misbehaviour.
