# @highsea-tv/parser

Release names into their parts, without I/O or a clock.

`parse('Leon.1994.GERMAN.DL.1080p.BluRay.x264-DETAiLS')` returns a `ParsedRelease` (`src/types.ts`) with:
- title and year;
- edition;
- quality: source, resolution, modifier and revision, in the Servarr wiki's Qualities Defined vocabulary;
- audio languages as ISO 639-1 codes, the MULTi flag, and subtitle languages;
- release group, hardcoded subs, and the IMDb and TMDB ids;
- codec, dynamic range and 3D.

`@highsea-tv/quality` turns these parts into named qualities and ranks them.

**How it reads a name.** Ordered, named regular expressions find the tags first. The title is whatever precedes the year or the first tag, so a word like "French" or "Extended" inside a film's name is never read as a tag. The year is the last one before the first quality tag, which keeps the years in "1917.2019…" and "Blade Runner 2049 (2017)" in the title. The group is the `-GROUP` suffix from scene rules 18.4.1. Each rule cites its source in the code: the scene rules, the Servarr wiki or the TRaSH guides. `parseQuality`, `parseLanguages`, `readEdition` and `languageCode` expose the parts on their own.

**MULTi** sets `multi` and adds no language, since the name doesn't say which. Radarr reads it as the original language plus the indexer's "Multi Languages" setting. That's for the caller to decide, since the parser knows neither.

**Tests.** The corpus is 7,842 names (7,373 movies) in `test/fixtures`, from four MIT-licensed parsers' test suites plus names written for highsea. `SOURCES.md` covers licences, restatements, exclusions and pending cases. The other tests are per-field unit tests and a benchmark that requires a mean under 0.25 ms a name.
