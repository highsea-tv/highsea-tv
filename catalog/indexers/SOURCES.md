# Sources

Every definition here is written for highsea from the site's own published documentation, or from the page as the site serves it. None is copied from another project. Prowlarr's definitions carry no licence, and Jackett's are GPL-2.0, which an AGPL-3.0 project can't take ([phase-3-checkpoint-5.md](../../docs/plans/phase-3-checkpoint-5.md#where-definitions-come-from)). Each definition records its author as `source.author`, what it was written from as `source.documentation`, and its own licence as `license`. Ours are CC0-1.0.

| Definition | Written from | Licence |
| --- | --- | --- |
| `generic-torznab` | The [Torznab specification 1.3](https://torznab.github.io/spec-1.3-draft/torznab/Specification-v1.3.html): `t=caps`, the search functions, and the standard categories in the [Newznab API](https://torznab.github.io/spec-1.3-draft/external/newznab/api.html) | CC0-1.0 |
| `generic-rss` | The [RSS 2.0 specification](https://www.rssboard.org/rss-specification), with Torznab's `torznab:attr` elements | CC0-1.0 |
| `internet-archive` | The Internet Archive's [About Search](https://archive.org/help/aboutsearch.htm) (the scrape API and its `fields`) and [Archive BitTorrents](https://help.archive.org/help/archive-bittorrents/) (finding torrents with `format:"Archive BitTorrent"`). Each item's torrent is `{identifier}_archive.torrent` in its download listing | CC0-1.0 |

The Internet Archive's logo is a plain drawing made for highsea, not the Archive's mark.

## Adding a definition

1. Write it from the site's own documentation, or from its pages if there's no API, and say which in `source.documentation`.
2. Use `CC0-1.0` or `MIT` as its `license`.
3. Run `bun run catalog:build`. It validates every definition and fails with each problem listed.
4. Add a line to `CHANGES.md` under a new version.
