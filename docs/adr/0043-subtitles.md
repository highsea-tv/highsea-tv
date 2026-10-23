# 0043. Subtitles

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
Checkpoint 7 makes subtitles part of the movie library ([the plan](../plans/phase-3-checkpoint-7.md), [subtitles.md](../product/subtitles.md)). The owner answered its questions on 2026-10-21. There are two halves: 7a finds and keeps subtitles, and 7b syncs them (ADR 0044). Several things are outside highsea's control: three providers with different APIs, terms and quotas; subtitle files in any encoding, carrying ads; and four media servers that each read sidecar names their own way. Bazarr is the established practice for most of these questions. It's GPL-3.0, so it's read for behaviour only, as Radarr is (ADR 0031), and nothing is copied.

## Decision
- **One package, `@highsea/subtitles`, with a subpath per kind** (ADR 0036):
  - `shared`: languages, profiles, scoring, throttling, naming, the moviehash and processing. It's pure apart from reading and writing files.
  - `providers`: the three adapters and the zip reader.
  - `movies`: the service the runtime creates once.
  - `fake`: the three providers, written from their documented shapes.

  Media doesn't import subtitles. The runtime hands the import pipeline subtitles' hooks, and hands the client API a `forFile` reader. That keeps the dependency one-way.
- **Providers are code, not a catalog kind:** OpenSubtitles.com (REST v1), Subdl and SubSource.
  - There are three, they change slowly, and each needs its own sign-in, quota and download logic, which a definition format would have to grow to express.
  - Each adapter cites its API's documentation. SubSource documents only its endpoints, status codes and limits, so its parameters and fields follow Bazarr's provider, and that's noted in the adapter.
- **OpenSubtitles.com: one key for the application, one account for each owner.**
  - The consumer key is highsea's. It's registered by the owner and never committed:
    - CI keeps it as the secret `HIGHSEA_OPENSUBTITLES_KEY`;
    - a release image gets it as a Docker build secret, written to `/usr/share/highsea/opensubtitles.key` and read through `HIGHSEA_OPENSUBTITLES_KEY_FILE` (Docker's `_FILE` convention for secrets);
    - development reads it from the gitignored `.env.local` (`node --env-file-if-exists`).
  - A build without the key shows OpenSubtitles.com as unavailable, with the reason.
  - Each owner signs in with their own account, as the [terms for integrators](https://opensubtitles.stoplight.io/docs/opensubtitles-api/f43c0749230b3-terms-of-use-for-integrators) require for a free key. "Subtitles provided by OpenSubtitles.com" shows wherever subtitles are searched or picked.
- **Accounts** are kept like indexer secrets:
  - sealed at rest in `subtitle_providers`;
  - saved and tested only by the owner, from A10's Edit dialog;
  - never returned by the API: a secret field says only whether it's set, and a blank one keeps it;
  - saving one goes in the audit log, without its credentials.
- **Every call to a provider goes through one function.** It skips a provider that's waiting, counts requests for providers that don't report a quota, and turns a failure into a throttle stored with the provider, so a restart keeps it. The throttles follow Bazarr's `provider_throttle_map`:
  - too many requests: 1 hour (OpenSubtitles.com: 1 minute, or what `Retry-After` says);
  - out of downloads: until the quota resets;
  - a refused login: 12 hours;
  - a timeout or server error: 1 hour, counted only after 5 within 2 minutes.

  A search asks every ready provider at once, each with 20 seconds.

  OpenSubtitles.com reports its quota in two places ([its docs](https://opensubtitles.stoplight.io/docs/opensubtitles-api/)): the sign-in gives the day's allowance (`user.allowed_downloads`), and each download gives what's left (`remaining`). Both are recorded, so Subtitles › Providers shows 19 of 20, not 19 of 19.
- **Scoring uses Bazarr's movie weights** (`subliminal_patch/score.py`) scaled to 100. Hash 179 → 99. Title 60, year 40, source 30, edition 30, release group 15, and 1 each for resolution, video codec, audio codec, streaming service and hearing impaired, out of 180.
  - A hash counts only with the source and codec, and then stands alone.
  - A release group counts only with the source.
  - An id match counts as title and year.
  - Edition and streaming service match when neither side names one, as Bazarr's `_check_optional` does.
  - **Prefer release matches** off leaves only hash, title and year.
  - Machine- and AI-translated results are dropped where the provider marks them.
- **Profiles' rules mean what the selects say:**
  - Forced `also` wants two tracks, regular and forced.
  - SDH `no` takes an SDH track only when nothing else exists, and removes its SDH text.
  - The cutoff works as Bazarr documents it: once the cutoff language is present, the profile's other languages are neither searched nor upgraded.
  - Embedded streams count toward the profile, image streams included.
  - A profile in use, and the last profile, can't be deleted.
- **Processing** happens in-house, with no subtitle library:
  - **Encoding:** a byte-order mark first, then `chardet`, then Node's full-ICU `TextDecoder`. The output is UTF-8.
  - **Formats:** SRT as Matroska documents it, WebVTT by the W3C parsing algorithm, and ASS kept as ASS with only `Dialogue` times rewritten.
  - **Cleanup:** whole-cue ads are always removed. SDH text is removed only for the Without SDH fallback.
- **Originals live in the database:** `subtitle_files.original`, compressed, after decoding and before cleanup. Subtitles are tens of kilobytes, which SQLite measures as faster inside the database ([internal versus external BLOBs](https://www.sqlite.org/intern-v-extern-blob.html)). Every sidecar is rewritten from the original, so cleanup, the sync and the nudge can each be redone without asking a provider again.
- **Sidecar names** are the video's name, then the language, the flag and the format:
  - `….en.srt`, `….en.forced.srt` and `….en.sdh.srt`;
  - `.forced` is documented by Plex, Jellyfin and Kodi, and `.sdh` by Plex, Jellyfin and Emby;
  - a track that's both is named `.forced`;
  - a second track with the same language and flags takes the provider's name: `….en.OpenSubtitles.srt`.

  Sidecars are written to a temporary name and renamed into place.
- **The import hook** runs inside the movie import (ADR 0039). It records the file's moviehash and keeps the text subtitles the release carried as `bundled` tracks with a score of 100. Image subtitles are copied unchanged, and a subtitle whose language can't be told from its name is skipped. A file adopted in place keeps the sidecars beside it. A replaced file's tracks follow it to the new name. Then the wanted rows are rewritten and a search is queued. The hook runs before the import marks the movie Available, so it counts the movie as available while it does this. Otherwise nothing would be wanted and no search queued.
- **The wanted list is a table** (`subtitle_wanted`): one row per file, language and flags that the profile asks for and nothing fills.
  - A movie's rows are rewritten when its file, tracks or profile change. Every movie's rows are rewritten when a profile changes, a page at a time.
  - A row nothing was found for waits 1, 3 and 7 days, then a week.
  - A10 reads it cursor-paged by sort title.
- **The jobs are idempotent** (ADR 0022):
  - search, deduplicated per file;
  - download, which stores OpenSubtitles.com's link and its expiry before fetching, so a rerun spends no second download;
  - the wanted refresh;
  - the wanted search, every 6 hours, for due rows only;
  - upgrades, every 12 hours, inside **Keep upgrading for**, with a strictly better score, never for a track chosen with **Use**.

  A6's Search keeps its results for 30 minutes, so **Use** sends an id and the server never takes a download link from the browser.

## Consequences
- OpenSubtitles.com works only in builds that carry highsea's key. A source build offers Subdl and SubSource, and says why OpenSubtitles.com is off.
- A new provider is a code change and a release, not a catalog update. That's acceptable for three providers. If the list grows, a catalog kind can follow, as it did for VPN providers (ADR 0042).
- Keeping originals in the database grows it by tens of kilobytes per track, compressed. In exchange, the sync, the cleanup and the nudge can always be redone.
- Following Bazarr's scoring and cutoff means its known behaviour comes along: a hash match beats any name match, and a present cutoff language stops the search for every other language.
