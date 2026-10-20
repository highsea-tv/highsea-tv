# Where the fixtures come from

The parser's corpus is 7,842 release names (7,373 movies, 469 episodes) from four MIT-licensed sources plus names written for highsea. Each case gives the name, what highsea expects from it in highsea's own vocabulary (`ParsedRelease` in `src/types.ts`), and where the case came from. `test/corpus.test.ts` checks every case.

| File | Cases | Movies | Episodes | Pending | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| `ptt.json` | 433 | 295 | 138 | 41 | dreulavelle/PTT |
| `parse-torrent-title.json` | 438 | 329 | 109 | 30 | TheBeastLT/parse-torrent-title |
| `parse-torrent-name.json` | 386 | 221 | 165 | 4 | platelminto/parse-torrent-name |
| `oleoo-1.json` … `oleoo-4.json` | 6,208 | 6,151 | 57 | 84 | thcolin/oleoo |
| `highsea.json` | 377 | 377 | 0 | 0 | written for highsea |

`oleoo` is split into four files of about 1,550 cases each, to stay under Biome's 1 MiB file limit.

Only MIT-licensed test suites were used. Radarr's and Sonarr's tests (GPL-3.0) and guessit's (LGPL-3.0) weren't read or used, nor was anything ported from them (see Sources checked and not used).

## A case

```json
{
  "name": "Leon.1994.GERMAN.DL.1080p.BluRay.x264-DETAiLS",
  "expect": { "title": "Leon", "languages": ["de"], "multi": true },
  "note": "why highsea differs from the source, when it does",
  "pending": "why the parser can't read this yet",
  "episode": true,
  "from": "PTT tests/test_languages.py"
}
```

- `expect` lists only the fields the source states, restated in highsea's terms. The test compares each one. For `quality` and `ids` it compares only the keys listed.
- Every case asserts the title and at least one other field. A case whose source states nothing beyond the title, or only fields highsea doesn't have, was left out (see Exclusions).
- `from` names the source file. "title by review" means the source didn't state a title for this name: the parser's title was read and accepted by hand (636 cases). Where it was wrong, the case states the right title and is pending.
- `note` is there when highsea's expectation differs from the source's. Where a source contradicts the documented formats, the documentation wins: the Servarr wiki's Qualities Defined, the scene rules (2020 x265 rules 17.2 and 18.4.1), the TRaSH guides' custom formats and ISO 639-1. The most common notes:
  - 55: the source lists subtitle languages with the audio ones; highsea keeps them apart (`languages` and `subtitles`).
  - 32: the name has no `-GROUP` suffix. Scene rules 18.4.1 put the group after the last hyphen, and highsea doesn't guess a group from a trailing word.
  - 15: EXTENDED is an edition wherever it appears (scene rules 17.2).
  - 12: the source infers Spanish from the word "Temporada". That's not a language tag.
  - 11: a full date is an episode's air date, not a film's year.
  - Quality restatements follow Qualities Defined:
    - R5 is REGIONAL;
    - WEB-DLRip is a WEBRip;
    - HD DVD sits with Blu-ray;
    - VHS, S-Print and MicroHD name no source, so they stay unknown;
    - full-disc names are BR-DISK, as in TRaSH's BR-DISK format;
    - typo resolutions (7200p) are `null`.
- `pending` marks a case the parser doesn't pass yet. The corpus test lists them as `todo` and fails if one starts passing, so the marker gets removed.
- `episode: true` marks a TV or anime name. The movie parser reads these for the same fields (title, quality, languages, group), since episode names follow the same scene layout. Episode numbering itself isn't part of `ParsedRelease`.

## Sources

### dreulavelle/PTT

- https://github.com/dreulavelle/PTT at commit `88429bb`, `tests/*.py`.
- MIT License, Copyright (c) 2024 Spoked.

### TheBeastLT/parse-torrent-title

- https://github.com/TheBeastLT/parse-torrent-title at commit `c37ca35`, `test/*.js`.
- MIT License, Copyright (c) 2018 Clément Escolano.

### platelminto/parse-torrent-name

- https://github.com/platelminto/parse-torrent-name at commit `4e79386`, `tests/files/input.json` and `tests/files/output_raw.json`.
- MIT License, Copyright (c) 2015-2017 Divij Bindlish, Copyright (c) 2020 Giorgio Momigliano.

The repositories were cloned into a scratch directory outside the repo and treated as data. Their code wasn't run: a separate extraction script read the names and expectations out of the test files. Only names and expected values were taken, never code.

### thcolin/oleoo

- https://github.com/thcolin/oleoo at commit `7f03450`, `tests/fixtures/accepted.json`: names whose parse oleoo's reviewer marked correct.
- MIT License, Copyright (c) 2025 Thomas Colin.
- Mostly French releases, so this file is where VFF/VFQ/VOSTFR, HDLight and French edition words are tested.
- Left out: `refused.json` (parses the reviewer marked wrong), `releases.txt` (names with no expectations), names already in another fixture (109), subtitle files (7), multi-film packs (oleoo's COLLECTION flag, 74), sports (6), and title-only cases (268).
- Restatements, each with a `note`:
  - oleoo title-cases the title and drops its punctuation; highsea keeps the name's spelling, so where only case, accents or punctuation differ the name's own title is expected.
  - Editions as written ("Version Longue", "Remasterisé"); oleoo names them by kind (EXTENDED, REMASTERED).
  - Languages in the order the name lists them; `multi` is true only when the name says MULTi, DL or Dual, as elsewhere.
  - Groups by scene rules 18.4.1: the part after the last hyphen, or a leading fansub bracket. A trailing word with no hyphen isn't a group.
  - Where oleoo reads a language from a word of the title ("Wreck-it Ralph" as Italian, "No-TAG" as Norwegian), lists subtitle codes as audio ("NL Subs", "ST.FR.ENG"), or reads a frame size as a year ("1920x800"), the case states what the name says, with the reason.

### highsea

`highsea.json` holds names written for this package:
- 30 titles crossed with 30 tag sets, scene-dotted and spaced. The titles include ones that are or contain years and numbers: 1917, 2012, Blade Runner 2049, Wonder Woman 1984, Se7en, Apollo 13.
- Editions, revisions (PROPER, REPACK2, REAL, RERiP, v2), languages and MULTi, hardcoded subs, Radarr's id tokens (`{imdb-tt…}`, `{tmdb-…}`, `[tmdbid-…]`), groups (including D-Z0N3 and Fight-BB) and year-titles.

Each expectation follows from how the name was built and the documented meaning of its tags, not from the parser's output.

### MIT notice

The notice below applies to the names and expected values taken from the four sources above, with each source's copyright line as given there.

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Sources checked and not used

| Source | Why not |
| --- | --- |
| scttcper/video-filename-parser (MIT) | A port of Radarr's parsing, so derived from GPL-3.0 code. |
| clement-escolano/parse-torrent-title (MIT) | The upstream of TheBeastLT's fork; its tests are already in `parse-torrent-title.json`. |
| divijbindlish/parse-torrent-name (MIT) | The upstream of platelminto's fork; its tests are already in `parse-torrent-name.json`. |
| middelink/go-parse-torrent-name, razsteinmetz/go-ptn (MIT) | Ports of parse-torrent-name with its test names. |
| dreulavelle/rank-torrent-name (MIT) | Its tests are about ranking, with few parse expectations, and those come from PTT. |
| pr0pz/scene-release-parser | MIT only in `package.json`, with no licence file. |
| thcolin/scene-release-parser (MIT, PHP) | Superseded by oleoo, from the same author, whose fixtures were used. |
| jzjzjzj/parse-torrent-name | No licence. |

## Exclusions

The PTT, parse-torrent-title and parse-torrent-name sources hold 2,757 cases between them, with 1,815 distinct names. These categories were left out, with their counts (PTT / parse-torrent-title / parse-torrent-name):

| Category | Count | Why |
| --- | --- | --- |
| no mapped field | 372 / 587 / 0 | The case asserts only fields `ParsedRelease` doesn't have: season, episode, audio, bit depth, size, container, site, network. Nothing to check. |
| title only | 85 / 155 / 9 | Once mapped, only the title is left. Each case has to assert at least one other field. |
| subtitle file | 44 / 47 / 1 | Subtitle files (`.srt`, `Subs/…`), not releases. |
| multi-film pack | 36 / 33 / 2 | Collections, trilogies, filmographies: one name, several films. Packs aren't part of milestone 1. |
| sports | 12 / 18 / 7 | UFC, WWE, Formula 1 and the like: events, not films. |
| adult | 5 / 0 / 0 | Out of scope for highsea's metadata. |
| not video | 3 / 3 / 0 | Comics, e-books and music. |
| newpct glued | 0 / 4 / 0 | Spanish site names with the title glued into the site's tags, no separator to read. |
| not a release name | 3 / 2 / 0 | A test description or a bare list of languages. |
| CJK fansub brackets | 2 / 2 / 0 | Titles only inside a run of CJK-bracketed tags, with no Latin title. |
| malformed brackets | 0 / 1 / 0 | `[Anime Time[`: a bracket that never closes. |
| untagged free form | 0 / 0 / 1 | A documentary description with no release tags. |

## Pending

159 cases, each with its reason. From PTT, parse-torrent-title and parse-torrent-name (75):

| Reason | Cases |
| --- | ---: |
| TV and anime numbering the movie parser doesn't read yet (bare episode numbers, season words, glued numbers) | 35 |
| Portuguese and Spanish free-text language words (legendado, Leg BR, PT(BR), subtitulos espanol) | 23 |
| Language tags that are words, truncations or lone codes (Undertekst, Dk-Subs, lati, LT) | 14 |
| Chinese-script language words (国语, 中字, 中文字幕) | 3 |

From oleoo (84):

| Reason | Cases |
| --- | ---: |
| The title runs on past a prefix ("James Bond - ", "Hitchcock - "), a parenthesised alternative title, a language before the year (German), a glued year ("2021CUSTOM") or a 3D tag | 25 |
| A lone mixed-case code (Fr), a glued French tag (VOFSTFR), a list in parentheses or a pair split across tags | 21 |
| A dotted, spaced or bracketed group (E.T, S.V, Mr. KickASS), or text after the group | 18 |
| The source in lower case (br, tv), BR with no resolution beside it, TS as a transport stream beside HDTV, or BD UHD in brackets | 13 |
| An abbreviated or broken edition (ext, Ex-tended, Version D.C.), or two editions in one phrase | 3 |
| The resolution behind underscores, or claimed only by UHD | 3 |
| A subtitle tag joined to codecs by hyphens | 1 |

## Regenerating

The fixtures were made with scripts kept outside the repo: they extracted the cases, mapped them into highsea's vocabulary, applied the restatements and exclusions above, and wrote the JSON. Edit a case by hand from now on. Keep `from`, and add a `note` when the expectation departs from the source.
