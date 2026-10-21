# Phase 3, checkpoint 7: subtitles

- **Status:** Scoped on 2026-10-21, before building. The owner answered the [open questions](#open-questions-for-the-owner) the same day, taking every recommendation ([the answers](#the-owners-answers)). 7a's build waits for the owner's go-ahead.
- **Gate:** stop when each half is built (7a, then 7b; [question 1](#open-questions-for-the-owner)). Report what was built, the judgement calls, the API added, screenshots and the check results, then ask for review. Checkpoint 8 (automation, owner tools and the rest) starts only after sign-off.
- **Parent plan:** [phase-3-server.md](phase-3-server.md). Its standing rules, architecture and decisions all apply, including decision 1 (every [M1] item stays in milestone 1), decision 5 (nothing is published until the owner says so) and decision 6 (the admin is for the owner and admins only). This document settles what that plan's checkpoint 7 item, the roadmap and the specs leave open, and what the research of 2026-10-21 changed.

## Read first

- [subtitles.md](../product/subtitles.md): A10, its tabs, states, copy, decisions and open questions.
- [movies.md](../product/movies.md): A6's Subtitles tab, the track offset and Re-sync, subtitle search and its toast; the add dialog's Subtitle languages; the bulk bar.
- [setup.md](../product/setup.md): step 6, Subtitle languages.
- [dashboard.md](../product/dashboard.md): the Subtitles widget and its empty state.
- [player.md](../product/player.md): the per-person subtitle nudge, which is not the admin's offset (decided there).
- [manual-import.md](../product/manual-import.md) and [activity-downloads.md](../product/activity-downloads.md): "Subtitles are next" and the history rows.
- The roadmap's [Subtitles, first class](../roadmap.md#subtitles-first-class-highseasubtitles), its [Arch] items for worker isolation and the generalized catalog, its Verification section (the ±100 ms test and the end-to-end's step 6), and [Later] Subtitle extras (Whisper, translation), which stay out.
- [ADR 0012](../adr/0012-unified-media-item-model.md) (versions and `media_files`), [ADR 0022](../adr/0022-job-queue.md) (idempotent jobs), [ADR 0029](../adr/0029-external-services.md) (the fetch seam and recordings), [ADR 0036](../adr/0036-domain-packages-with-subpath-exports.md) (domain packages), [ADR 0039](../adr/0039-importing.md) (the import pipeline), [ADR 0040](../adr/0040-test-media.md) (test media, and the Sintel clip's place here).
- The prototype: `design/prototypes/src/admin/subtitles/subtitles.tsx` (A10), the `Subtitles`, `TrackRow` and `SubtitleSearch` parts of `admin/movies/detail.tsx`, the subtitle step in `admin/setup/setup.tsx`, the Subtitles widget in `admin/dashboard/widgets.tsx`, and the mock server's `subtitles` namespace, its pipeline stages (`subtitle-search`, `subtitle-sync`) and the types `LanguageProfile`, `LanguageRule`, `SubtitleTrack`, `SyncStatus`, `SubtitleSearchResult`, `SubtitleProvider`, `SubtitleStats` and `SubtitleSettings` in `mock/types.ts`.

## Goal

A movie is imported and highsea finds its subtitles on its own: in the languages its profile asks for, from the subtitles the release carried, the streams inside the file, or the owner's providers, scored so a subtitle made for this exact file wins. Each one is cleaned, stored beside the video under a name Plex, Jellyfin, Kodi and Emby all read, and lined up with the speech in the background. A sync the engine isn't sure of keeps the original timing and says so. The owner sees what's missing on A10, fixes a movie on its Subtitles tab, and nudges a track by 50 ms when they disagree with the engine. A crash mid-sync loses nothing: the job runs again from the original.

## Out of scope

- **Generating or translating subtitles** (Whisper, machine translation): [Later] in the roadmap.
- **Serving subtitle files to clients and burning them in:** playback is reserved under `/stream` (parent plan). The client API lists the tracks now (below); the bytes come with streaming in a later phase, as does conversion to WebVTT for the web player.
- **OCR of image subtitles** (PGS, VobSub) into text.
- **TV-only providers** (Gestdown, Addic7ed): they come back with shows ([question 2](#open-questions-for-the-owner)).
- **Language profile defaults per root folder** (the roadmap's "defaults per root folder"): no prototype has a place for it, and the add dialog already picks a profile per movie and remembers the last one (movies.md). Listed for checkpoint 8's settings work (judgement call 1).
- **Notifications** on subtitle events (checkpoint 8).

## What changed since the roadmap was written

The research for this checkpoint (2026-10-21, sources cited where each fact is used) found five things the roadmap and the prototype assume and can't have as written:

1. **Podnapisi closed** on 2026-03-25: "Podnapisi is officially closed since March 25th 2026", Bazarr's maintainer wrote on 2026-06-30 ([bazarr#2531](https://github.com/morpheus65535/bazarr/issues/2531)).
2. **Gestdown covers TV only.** Its documented endpoints are shows, seasons and episodes ([Gestdown API reference](https://docs.subvault.tv/reference/getting-started-1)), and Bazarr's provider declares `video_types = (Episode,)` ([gestdown.py](https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/providers/gestdown.py)).
3. **OpenSubtitles.com forbids asking each user for an API key.** "Using one key per application is mandatory. If you develop an application requiring users to create their own API key, we will ban its access" ([OpenSubtitles API › Getting started](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)). highsea needs one consumer key of its own, and each owner signs in with their own OpenSubtitles account ([question 3](#open-questions-for-the-owner)).
4. **Plex doesn't document `.hi`.** It documents `.forced`, `.sdh` and `.cc` ([Plex: Adding local subtitles](https://support.plex.tv/articles/200471133-adding-local-subtitles-to-your-media/)); Jellyfin reads `.hi` only after a language, because a bare `hi` is Hindi ([Jellyfin: Movies › External subtitles](https://jellyfin.org/docs/general/server/media/movies/#external-subtitles-and-audio-tracks)). The roadmap's `.en.hi.srt` becomes `.en.sdh.srt` ([question 7](#open-questions-for-the-owner)).
5. **A sidecar is named after its video file,** not after the movie: Kodi says the subtitle must share the video's name ([Kodi: Subtitles](https://kodi.wiki/view/Subtitles)), and Plex's pattern is the video's name plus the language. highsea's default file name is `Sintel (2010) Bluray-1080p.mkv` (checkpoint 6), so the roadmap's `Title (Year).en.srt` would match nothing. It becomes `Sintel (2010) Bluray-1080p.en.srt`, which also keeps two versions' subtitles apart in one folder.

And one thing checkpoint 6 promised and didn't build: the import was to end by queueing an empty `subtitles.afterImport` job (checkpoint 6 › Out of scope). No such job exists in `packages/media` today; this checkpoint adds the hook (below).

## The size of this checkpoint, and its halves

Smaller than checkpoint 6, but it has two distinct parts with different risks: finding and keeping subtitles (network, quotas, terms) and the sync engine (signal processing in a worker). [Question 1](#open-questions-for-the-owner) recommends two gated halves; the rest of this document marks each piece **(7a)** or **(7b)**. If the owner keeps one checkpoint, the marks only set the order of work.

- **7a, finding and keeping subtitles:** the `subtitles` package's profiles, wanted list, providers, scoring, processing and sidecars; embedded and bundled tracks; the jobs for search on import, wanted and upgrades; A10, A6's Subtitles tab without Re-sync, the setup step, the dashboard widget, the bulk bar's profile menu. Downloaded tracks are stored as **Not synced** (`unsynced`) until 7b.
- **7b, the sync engine:** audio extraction, voice activity, alignment with framerate and split correction, confidence, the embedded reference, the sync and re-sync jobs, the manual offset, Re-sync on A6, the stats, the Sintel fixture and the ±100 ms test, and the end-to-end's step 6 ("a mock provider attaches `.en.srt`, and it's marked synced").

## Packages

| Package | Holds | Depends on |
| --- | --- | --- |
| `subtitles/shared` (new package, new subpath) | Language profiles, scoring, processing (encoding, formats, cleanup, forced and SDH), sidecar naming, the store of originals, the provider interface and throttling | `core`, `db`, `parser` |
| `subtitles/providers` | One adapter per provider: OpenSubtitles.com, Subdl, SubSource ([question 2](#open-questions-for-the-owner)), each behind the fetch seam (ADR 0029) | `subtitles/shared` |
| `subtitles/movies` | What's movie-only: the wanted list over movies, the search and upgrade jobs, the import hook, the client API's tracks | `subtitles/shared`, `subtitles/providers`, `media/shared`, `media/movies`, `jobs` |
| `subtitles/sync` (7b) | The sync engine: pure alignment code, the VAD in WebAssembly, and the worker entry that runs ffmpeg and both. No database | `core`, the VAD and FFT dependencies below |
| `subtitles/fake` | Fake providers on loopback, written from each API's documented shapes, as `@highsea/indexers/fake` is | `subtitles/providers` |
| `subtitles/testing` (7b) | The Sintel fixture's loader and the span-list generators the sync tests share | `subtitles/sync` |
| `media/shared` (grows) | The import pipeline gains one hook, `afterImport(file, sourceFolder)`, which the runtime wires to `subtitles/movies`; `media` doesn't import `subtitles` | as now |

- **Why its own package:** ADR 0036 keeps a kind "with heavy or unusual dependencies (native, network)" in its own package. Subtitles talk to three providers and run WebAssembly in the worker pool. Its subpaths follow ADR 0036: `movies` is the media type, as in `@highsea/media/movies`, so shows arrive as `@highsea/subtitles/shows`; `shared` is what every type uses.
- **Why the hook and not a job queued by media:** bundled subtitles live in the download's folder, and a manual import in Move mode removes the torrent "as soon as the import finishes" (checkpoint 6). They have to be copied inside the import job, before it finishes. The hook does only that and queues `subtitles.search`; everything slow is a job of its own.
- **New dependencies** (each pinned with `bun run pin`, licence checked with `bun run licenses`):
  - `chardet` (MIT; 2.2.0, published 2026-06-20) for encoding detection ([npm](https://www.npmjs.com/package/chardet)). Decoding uses Node's own `TextDecoder` (below), so no `iconv-lite`.
  - `@echogarden/fvad-wasm` (BSD-3-Clause; 0.2.0, 2024-10-26), the WebRTC VAD built to WebAssembly from libfvad ([libfvad](https://github.com/dpirch/libfvad), [npm](https://www.npmjs.com/package/@echogarden/fvad-wasm)) (7b, [question 9](#open-questions-for-the-owner)).
  - `fft.js` (MIT; 4.0.4, 2021), a radix-4 FFT on typed arrays ([npm](https://www.npmjs.com/package/fft.js)) (7b).
  - No subtitle parser: SRT and WebVTT parsers are small and written here, and ASS is handled line by line for timing only (below).

## Providers (7a)

### The provider model

- **A provider is code,** one adapter each, implementing one interface: `search(query) → results`, `download(result) → bytes`, `account() → { username, quota }`, `test()`. Each takes the fetch it's given (ADR 0029), a clock and a sealed credential.
- **Not a catalog kind** ([question 6](#open-questions-for-the-owner)). Indexers are declarative definitions and VPN providers are facts over shared mechanisms; each subtitle provider is its own API with its own login, quota and download flow, so a catalog entry would hold nothing a server could use without new code. The roadmap's generalized catalog lists subtitle providers; that waits until a provider can be described as data.
- **One query** per movie file and language set: the TMDB and IMDb ids, title, year, the OpenSubtitles moviehash of the file, the scene name and release group from `media_files`, and the languages with their forced and SDH rules.
- **Searched together, ranked by score** ([question 5](#open-questions-for-the-owner)): every enabled provider that isn't throttled is asked at once, with a 20-second deadline each; results are scored as one list, and ties go to the provider listed first (OpenSubtitles.com, then Subdl, then SubSource).
- **Throttling,** after Bazarr's established practice ([get_providers.py › provider_throttle_map](https://github.com/morpheus65535/bazarr/blob/master/bazarr/app/get_providers.py)): a provider that answers "too many requests" waits 1 hour (OpenSubtitles.com: 1 minute), one out of downloads waits until its quota resets, a failed login waits 12 hours, a timeout or server error 1 hour, and repeated ones count only after 5 within 2 minutes. The wait and its reason are stored with the provider, so a restart keeps them, and A10 shows the provider's bar empty in warning tone, as subtitles.md specifies.
- **Requests left today** (A10's bar) is the provider's own count where it reports one, and highsea's count against the documented limit where it doesn't. "Today" is the provider's day: OpenSubtitles.com resets at midnight UTC.

### OpenSubtitles.com

- **API:** `https://api.opensubtitles.com/api/v1`; login returns a `base_url` that later requests must use (`vip-api.opensubtitles.com` for VIP members) ([OpenAPI document](https://stoplight.io/api/v1/projects/opensubtitles/opensubtitles-api/nodes/open_api.json); [changelog](https://opensubtitles.stoplight.io/docs/opensubtitles-api/51ea4c484e6e5-changelog), 2023-02-16).
- **Auth:** highsea's consumer key in the `Api-Key` header ([question 3](#open-questions-for-the-owner)), plus the owner's username and password for a JWT, valid 24 hours. highsea keeps the token for 12 hours, as Bazarr does, and logs in again on a 401. Login is limited to 1 a second, 10 a minute, 30 an hour, so a refused password is never retried ([Getting started](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)).
- **User-Agent:** `highsea v{version}`, as required ([Getting started](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)).
- **Quotas:** searching is unlimited; downloads are 20 a day for a free account, 1,000 for VIP, 5 per IP without signing in, reset at midnight UTC. Requests are limited to 5 a second per IP ([Getting started](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started); [Best practices](https://opensubtitles.stoplight.io/docs/opensubtitles-api/6ef2e232095c7-best-practices)). `POST /download` answers with `remaining` and `reset_time_utc`, and a 406 when the quota is spent. **highsea requires a signed-in account** for OpenSubtitles.com: the 5 anonymous downloads are "not a quota to build a product on" ([Terms of use for integrators](https://opensubtitles.stoplight.io/docs/opensubtitles-api/f43c0749230b3-terms-of-use-for-integrators), updated 2026-10-13).
- **Search:** `GET /subtitles` with `tmdb_id`, `moviehash`, `languages`, `year`, and the filters `hearing_impaired` and `foreign_parts_only`; parameters sorted and lowercased, as the API asks, or it redirects. `machine_translated` is excluded (the API's default) and so is `ai_translated` (judgement call 9).
- **Moviehash:** the file's size plus the 64-bit little-endian sum of its first and last 64 KiB, as 16 hex characters, for files from 131,072 bytes to 9 GB, with the documented test vector ([Hash source codes](https://opensubtitles.stoplight.io/docs/opensubtitles-api/4wccbf76rim38-hash-source-codes)). It's computed once at import and stored with the file's `media_info`.
- **Download:** `POST /download {file_id}` returns a link valid for 3 hours; the file is fetched at once and stored, never the link. The quota is counted when the link is requested, so a job that crashes between the two doesn't ask again: the link and its expiry are stored on the job's row first (below).
- **Terms:** a free consumer key is allowed when each user signs in with their own account, and "Fetch subtitles automatically for one signed-in user's own library … (as Bazarr and media-server plugins do)" is explicitly allowed. Free keys must show **"Subtitles provided by OpenSubtitles.com"** wherever subtitles are searched or picked ([Terms of use for integrators](https://opensubtitles.stoplight.io/docs/opensubtitles-api/f43c0749230b3-terms-of-use-for-integrators)). That line joins A6's search results and A10's Providers tab (a copy addition to locked screens, [question 3](#open-questions-for-the-owner)).

### Subdl

- `GET https://api.subdl.com/api/v1/subtitles` with the owner's own free `api_key`, `tmdb_id` or `imdb_id`, `type=movie`, `year`, `languages`, `releases=1`, `hi=1`, and `client=highsea`; results carry `release_name`, `releases`, `hi` and `language`. Downloads are zips from `https://dl.subdl.com` ([Subdl API](https://subdl.com/api-doc)).
- **Limits:** 2,000 requests a day for a free key, account-wide ([Subdl API](https://subdl.com/api-doc)).
- **Zips** are read with Node's `zlib` and a small reader for the zip's central directory (the archive format is [PKWARE's APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), which checkpoint 6's test zip already follows). Only subtitle files are taken, at most 2 MB each, and every name is reduced to its base name, so nothing in a zip can write outside highsea's temporary folder.
- Subdl's docs say nothing about a per-application key; highsea asks each owner for theirs, as Bazarr does (`settings.subdl.api_key` in [get_providers.py](https://github.com/morpheus65535/bazarr/blob/master/bazarr/app/get_providers.py)).

### SubSource

- `https://api.subsource.net/api/v1` with the owner's own key in `X-API-Key`; movies searched by IMDb id; results carry `releaseInfo` and `hearingImpaired`. Free keys get 60 requests a minute, 1,800 an hour, 7,200 a day ([SubSource API](https://subsource.net/api-docs)). Bazarr uses it for movies the same way ([get_providers.py](https://github.com/morpheus65535/bazarr/blob/master/bazarr/app/get_providers.py)). The endpoint details are checked against SubSource's reference when the adapter is written.

### Left out

- **Podnapisi** (closed), **Gestdown** and **Addic7ed** (TV only; Bazarr forces the direct Addic7ed provider off), and **YIFY Subtitles**, which has no API: Bazarr's provider scrapes the HTML of one of several unofficial mirror domains ([yifysubtitles.py](https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/providers/yifysubtitles.py)), and no terms permit automated use. The prototype's mock lists Podnapisi, Addic7ed and YIFY Subtitles as seed data; the Providers table is data-driven, so its layout doesn't change ([question 2](#open-questions-for-the-owner)).

### Accounts and keys

- **Credentials** (the OpenSubtitles password, the Subdl and SubSource keys) are sealed like indexer secrets (parent plan › Data) and never returned by the API.
- **Where they're entered:** A10's Providers tab has an Account column but no way to sign in, and subtitles.md leaves it as an open question. [Question 4](#open-questions-for-the-owner) recommends an **Edit** dialog per provider, built like A9's Edit dialog: the fields, **Test**, then **Save**. A provider that needs an account can't be enabled without one; its switch is disabled with "Add your account first."

## Embedded and bundled tracks (7a)

- **Embedded streams** come from the import's ffprobe (`media_files.media_info.subtitles`): codec, language, `forced` and `hearing_impaired` dispositions, which ffmpeg maps from Matroska's `FlagForced` and `FlagHearingImpaired` ([matroskadec.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavformat/matroskadec.c); [Matroska elements](https://www.matroska.org/technical/elements.html)). They count toward the profile (subtitles.md › Decisions) and show on A6 as read-only rows, as the prototype has them. They're not extracted to sidecars: the clients will read them from the file when streaming arrives.
- **Image streams** (PGS `hdmv_pgs_subtitle`, VobSub `dvd_subtitle`) count too, as Bazarr counts them by default (`ignore_pgs_subs` and `ignore_vobsub_subs` default to false, [Bazarr wiki › Subtitles](https://wiki.bazarr.media/Additional-Configuration/Settings/Subtitles/)) ([question 14](#open-questions-for-the-owner)). ffmpeg can't turn them into text ("Subtitle encoding currently only possible from text to text or bitmap to bitmap", [ffmpeg_mux_init.c](https://github.com/FFmpeg/FFmpeg/blob/master/fftools/ffmpeg_mux_init.c)).
- **Bundled subtitles** are the text subtitle files in the release: beside the video or in a `Subs` folder. The import hook copies each into the library as a sidecar (`kind: 'bundled'`), with its language from the file name (the parser's language tokens, and names like `2_English.srt`), its forced and SDH flags from the name, and a score of 100: it was made for this release. One whose language can't be told is skipped and logged, not guessed. Image files (`.sup`, `.idx` with `.sub`) are copied unchanged and never processed or synced (judgement call 2).

## Language profiles (7a)

- **A table now,** replacing the hard-coded `LANGUAGE_PROFILES` in `media/shared/profiles.ts`. The seeded profile keeps its id, `lp-en`, so movies already added keep pointing at it.
- **A profile** is the prototype's `LanguageProfile`: a name, ordered `LanguageRule`s, a cutoff and a minimum score. Order is preference.
- **The rules' meaning** (judgement call 3), matching the selects' labels:
  - Forced: **Regular only** wants a regular track; **Regular and forced** wants both, two tracks; **Forced only** wants a forced track only.
  - SDH: **Without SDH** wants a track without SDH, and takes an SDH one only when none other exists, with its SDH text removed ([question 11](#open-questions-for-the-owner)); **With or without SDH** takes either; **SDH only** wants SDH.
- **The cutoff:** once the cutoff language is present, the movie stops looking for upgrades in every language, as Bazarr's cutoff does ([Bazarr wiki › Languages](https://wiki.bazarr.media/Additional-Configuration/Settings/Languages/)).
- **The minimum score** is the higher of the profile's and the global one (subtitles.md › Decisions).
- **Deleting a profile** in use is refused ("Movies still use {name}. Move them to another profile first.", judgement call 4); the last profile can't be deleted.
- **Language codes:** profiles use ISO 639-1 (`en`), as the prototype does. ffprobe reports ISO 639-2 (`eng`, and `fre` or `fra`), so a table from the Library of Congress list maps them ([ISO 639-2 code list](https://www.loc.gov/standards/iso639-2/php/code_list.php)); names come from `Intl.DisplayNames`. Brazilian Portuguese and the two written Chinese standards are the extra codes `pt-BR`, `zh-Hans` and `zh-Hant`, which OpenSubtitles.com also tells apart (judgement call 5).
- **Setup's step 6** writes the chosen languages, in order, into `lp-en` (renamed after the first language), each as Regular and forced, Without SDH, the prototype's defaults for a new rule.
- **Bulk assignment** ([question 13](#open-questions-for-the-owner)): the library's bulk bar gains **Subtitle languages** beside its quality profile menu.

## The wanted list (7a)

- **Kept as rows, not computed per request:** `subtitle_wanted` holds what each available movie's file lacks (the parent plan's table). Computing it across 100k items on each page load would read every file's streams; the rows are rewritten for one movie when its file, tracks or profile change, which is cheap, and for all movies when a profile changes, as a job.
- **A language is wanted** while no external track, bundled track or embedded stream satisfies its rule, as the mock's `wantedSubtitles` does, with the forced and SDH rules above.
- **Each row** keeps when it was last searched and when it may be searched again, so a movie nobody has subtitles for is asked about less often: after 1 day, then 3, then 7, then weekly (judgement call 6).
- `subtitles.wanted()` returns movies with their missing languages, as the prototype shows them, paged by cursor (judgement call 7).

## Scoring (7a)

- **Bazarr's movie weights are the established practice** ([subliminal_patch/score.py](https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subliminal_patch/score.py)): hash 179, title 60, year 40, source 30, edition 30, release group 15, and 1 each for resolution, video codec, audio codec, streaming service and hearing impaired, out of 180. A hash match counts only when the source and video codec also match, and then it stands alone. An IMDb or TMDB id match counts as title and year. The percentage is `round(points × 100 / 180)`, as Bazarr's `processing.py` computes it.
- **The release fields** come from the parser (checkpoint 4) on both sides: the subtitle's release name and the file's scene name.
- **A hash match scores 99** on that scale. subtitles.md's hint says "about 95"; it changes to "about 99" (judgement call 8, a copy change to list).
- **Prefer release matches** (the setting): on, the release fields count; off, only hash, title and year count, and ties go to the provider's own ranking (downloads and rating).
- **Translations:** machine- and AI-translated subtitles are never downloaded where the provider says which they are (judgement call 9).
- **Flags:** a result whose forced or SDH flag contradicts the rule is dropped, except the Without SDH fallback above.
- **Upgrades:** for **Keep upgrading for** days after import (14 by default, the prototype's), a track is replaced only by a strictly better score, as Bazarr's upgrade search does (it looks only below the maximum and asks for at least the old score plus one, [upgrade.py](https://github.com/morpheus65535/bazarr/blob/master/bazarr/subtitles/upgrade.py)). A track the owner chose with **Use** is never upgraded (judgement call 10).

## Processing (7a)

Every downloaded or bundled text subtitle goes through the same steps, in `subtitles/shared`, pure apart from reading and writing the file:

1. **Size and type:** at most 2 MB; SRT, WebVTT and ASS/SSA by content, not by extension. Anything else is refused with its reason.
2. **Encoding:** a byte-order mark wins; otherwise `chardet` guesses and Node's `TextDecoder` decodes. Node's official builds are full-ICU and decode windows-1250 to 1258, the ISO 8859 family, GB18030, Big5, Shift_JIS, EUC-KR and KOI8-R ([Node: WHATWG supported encodings](https://nodejs.org/api/util.html#whatwg-supported-encodings); [Node: Internationalization](https://nodejs.org/api/intl.html)). The runtime checks `process.versions.icu` at boot and warns if a build lacks it. The result is written as UTF-8 without a BOM.
3. **Parsing:**
   - **SRT** has no formal specification; highsea reads it as Matroska documents its storage (index, `HH:MM:SS,mmm --> HH:MM:SS,mmm`, text, blank line; [Matroska: Subtitles](https://www.matroska.org/technical/subtitles.html)), tolerating dots for commas, missing indexes and stray blank lines.
   - **WebVTT** follows the W3C parsing algorithm ([WebVTT](https://www.w3.org/TR/webvtt1/)).
   - **ASS/SSA** is kept as ASS, styles and all: only the `Start` and `End` of `Dialogue` lines are read and rewritten, by the `Format` line's columns. Override tags ([Aegisub: ASS tags](https://aegisub.org/docs/latest/ass_tags/)) are left alone.
4. **Cleanup:**
   - **Ads** are always removed: whole cues that only advertise a site or a subtitler ("Subtitles by …", "Downloaded from …", "Advertise your product or brand here", provider URLs), from a short list in code, matched against whole cues only so dialogue is never cut. Bazarr's `common` mod removes the same kind of line (`CM_crap`, [common.py](https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subzero/modification/mods/common.py)).
   - **SDH text** is removed only for the Without SDH fallback ([question 11](#open-questions-for-the-owner)): bracketed and parenthesised descriptions, speaker labels before a colon, and music-only lines, as Bazarr's `remove_HI` mod does ([hearing_impaired.py](https://github.com/morpheus65535/bazarr/blob/master/custom_libs/subzero/modification/mods/hearing_impaired.py)) and Subtitle Edit's "Remove text for hearing impaired" ([Subtitle Edit](https://subtitleedit.github.io/subtitleedit/features/remove-text-hi.html)). Written fresh from that behaviour; Bazarr's code (GPL-3.0) isn't copied (ADR 0031's practice).
   - Empty cues are dropped, overlapping cues are kept, and cues are sorted by start.
5. **Forced and SDH:** taken from the provider's flags (OpenSubtitles.com's `foreign_parts_only` and `hearing_impaired`, Subdl's `hi`, SubSource's `hearingImpaired`) or the bundled file's name. highsea doesn't guess forced from the cue count: no documented practice was found for it (judgement call 11).
6. **The original is kept,** after decoding and before cleanup, in the database (`subtitle_files.original`, compressed). Subtitles are tens of kilobytes, and SQLite measures blobs up to about 100 KB as faster inside the database ([SQLite: Internal versus external BLOB storage](https://www.sqlite.org/intern-v-extern-blob.html)), as checkpoint 3 decided for the mark. Every sidecar is written from the original plus the cleanup, the sync's correction and the manual offset, so each of those can be redone or undone without asking the provider again.
7. **The sidecar** is written to a temporary name in the movie's folder and renamed into place, so a crash never leaves half a file.

### Sidecar names

- **The video file's name, the language, the flag, the format** ([question 7](#open-questions-for-the-owner)): `Sintel (2010) Bluray-1080p.en.srt`, `….en.forced.srt`, `….en.sdh.srt`, `….en.ass`. `.forced` is documented by Plex, Jellyfin and Kodi; `.sdh` by Plex, Jellyfin and Emby ([Emby: Subtitles](https://emby.media/support/articles/Subtitles.html)). Plex doesn't document combining flags, so a track that's both forced and SDH is named `.forced` and stored as both.
- **A second track** with the same language and flags (rare: the owner keeps two) gets the provider's name as Jellyfin's title text: `….en.OpenSubtitles.srt`.
- **When the video is renamed or replaced,** its sidecars follow it (below).
- **Settings › Media management's naming preview** shows the sidecar beside the file ("Becomes Sintel (2010) Bluray-1080p.mkv · Sintel (2010) Bluray-1080p.en.srt", judgement call 12).

## The sync engine (7b)

### What the research found

- **ffsubsync** (MIT) cuts speech and subtitles into 10 ms windows, turns each into a signal of 1s and −1s, and scores every offset at once as a cross-correlation by FFT, taking the best within 60 seconds. It tries the framerate ratios 24/23.976, 25/23.976, 25/24 and their reciprocals, plus one inferred from the lengths, and with `--gss` a golden-section search over 0.9 to 1.1. Its default VAD is WebRTC's, in mode 3 on 10 ms frames. It gives no normalised confidence; its quality gates are the score's sign, an offset over 30 seconds, and a framerate more than 10% off ([README › How it works](https://github.com/smacke/ffsubsync/blob/master/README.md); [aligners.py](https://github.com/smacke/ffsubsync/blob/master/ffsubsync/aligners.py); [ffsubsync.py](https://github.com/smacke/ffsubsync/blob/master/ffsubsync/ffsubsync.py)).
- **alass** (GPL-3.0) aligns lists of time spans, a reference against an input, and lets the input split: each cue may move by its own offset, keeping order, for a score of total overlap minus a penalty per split. A dynamic program finds the best in time linear in the spans' total length times the number of cues. It tries the same six framerate ratios before splitting. It reports 80% of lines within 100 ms after sync and gives no confidence ([README](https://github.com/kaegi/alass/blob/master/README.md); [thesis](https://github.com/kaegi/alass/blob/master/documentation/thesis.pdf), §2.5; [main.rs](https://github.com/kaegi/alass/blob/master/alass-cli/src/main.rs)).
- **Bazarr** syncs with ffsubsync, with a 60-second maximum offset and golden-section search on ([sync.py](https://github.com/morpheus65535/bazarr/blob/master/bazarr/subtitles/sync.py)).
- **Neither** fits highsea's one-process, no-native-addon rule as it is: ffsubsync is Python and alass is Rust, with no WebAssembly build published.

### The design

highsea writes its own engine in TypeScript, from these documented algorithms: ffsubsync's 10 ms signals and FFT correlation for the offset and framerate, and the alignment problem alass's thesis states for splits, written fresh rather than ported (judgement call 13: the idea is published; the code isn't copied, so no GPL-3.0 part enters the work).

1. **The reference,** best first (judgement call 14):
   1. an embedded text subtitle stream that isn't forced, in any language, extracted with `ffmpeg -map 0:s:N -f srt -`, as ffsubsync does. Subtitle against subtitle is the most reliable case: alass's thesis measured no errors there;
   2. an embedded image stream's display times, from `ffprobe -show_frames` on that stream: a PGS cue runs from a display set with pictures to the next one, because ffmpeg's decoder gives PGS no end time ([pgssubdec.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pgssubdec.c)); VobSub carries its own end time ([dvdsubdec.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/dvdsubdec.c));
   3. the speech in the file's default audio stream.
2. **Audio:** in the worker, `ffmpeg -nostdin -i {file} -map 0:a:{n} -vn -ac 1 -ar 16000 -acodec pcm_s16le -af aresample=async=1 -f s16le -` streams 16 kHz mono PCM on its standard output ([ffmpeg](https://ffmpeg.org/ffmpeg.html) `-ac`, `-ar`, `-f`; [raw PCM muxers](https://ffmpeg.org/ffmpeg-formats.html)). `aresample=async=1` is ffsubsync's, so gaps in the audio's timestamps don't shift everything after them. The PCM is never held whole: a two-hour film is about 230 MB of it, so it's read in chunks and turned into speech frames as it arrives.
3. **Voice activity:** WebRTC's VAD on 10 ms frames (160 samples), mode 3, as ffsubsync uses it ([py-webrtcvad](https://github.com/wiseman/py-webrtcvad) for the frame rules), through `@echogarden/fvad-wasm` ([question 9](#open-questions-for-the-owner)). A two-hour film becomes 720,000 bytes of 1s and 0s; gaps under 200 ms are closed so a breath doesn't split a line (judgement call 15).
4. **The offset:** the subtitle's cues on the same 10 ms grid, both signals as ±1, padded to a power of two (a three-hour film is 2^21 frames), correlated with `fft.js`, and the best offset taken within ±60 seconds, Bazarr's and ffsubsync's default.
5. **The framerate:** the same correlation for each of the ratios 25/24, 25/23.976, 24/23.976, their reciprocals and 1, the set both tools use; the best score wins. A golden-section search is left out: the six ratios are what a wrong framerate actually produces (judgement call 16).
6. **Splits** ([question 8](#open-questions-for-the-owner)): after the global fit, a dynamic program over the cues, in order, lets a run of cues take its own offset within ±10 seconds of the global one, for a penalty per split, on the alass thesis's problem statement. It catches a release cut differently from the subtitle's: an extra scene, a missing intro. A fit with splits is kept only if it beats the global fit by more than the penalties.
7. **Confidence** (below), then the result: the ratio, the global offset, the splits, and the confidence, stored with the track.
8. **Writing:** at or above **Minimum confidence** (70% by default, the prototype's), the sidecar is rewritten from the original with the correction, and the track is **Synced**. Below it, the original timing stays, the track is **Not synced**, and the history says why ("Kept the original timing: 54% confidence."), as subtitles.md decides.

### Confidence

No tool publishes a normalised confidence, so highsea defines one and records it in ADR 0044 (judgement call 17). It combines three measures, each from 0 to 1, by their minimum, so any one of them can veto:

- **Overlap:** the share of subtitle time that falls on speech after the correction, compared with what chance would give at this film's speech density. A correct sync puts most cues on speech; a wrong one does no better than chance.
- **Peak clarity:** how far the best correlation stands above the best one more than a second away. Two near-equal peaks mean the engine can't tell where the subtitle belongs.
- **Coverage:** the share of the subtitle's cues the engine had speech or reference cues to judge. A film that's mostly music and silence gives the engine little to go on.

The weights' thresholds are set from the test corpus (below) and stated in the ADR. The 70% default stays the prototype's.

### Where it runs

- **In the worker pool** (`packages/runtime/src/workers.ts`): the worker spawns ffmpeg itself (child processes work from a worker thread), runs the VAD and the alignment, and posts back the result, a few kilobytes. The main thread never sees the PCM.
- **One sync at a time** (the job's concurrency is 1), so piece hashing keeps the rest of the pool. A sync has a 15-minute timeout and stops when the job's signal fires (ADR 0022).
- **Bun and Node:** the alignment is pure and tested under Bun; the worker path is tested under Node, as the pool already is (`pool-under-node.ts`), because Bun documents its `worker_threads` as not battle-tested.

### The manual offset

- **− and +** on A6 move a track 50 ms and save at once (movies.md). The nudge is stored apart from the sync's correction (`manual_offset_ms`), and the sidecar is rewritten from the original with both. Re-sync keeps the nudge at zero again, since a fresh sync replaces the owner's judgement with the engine's (judgement call 18).
- **The Offset column** shows one number. A sync with a framerate ratio or splits isn't one offset, so the column shows the correction at the subtitle's first cue plus the nudge, and the row's detail line says "Framerate corrected (25 → 23.976)" or "2 sections moved" when there's more (a change real data forces).
- **The player's nudge** stays per person and per title, not on the track (player.md › Decisions).

## Jobs

Every handler is safe to repeat (ADR 0022): each step checks whether it already happened, and each write is keyed so a second run finds it done.

| Job | When | Idempotent because |
| --- | --- | --- |
| `subtitles.wanted.refresh` (7a) | After an import, a track added or removed, a profile saved or a movie's profile changed; for all movies when a profile changes | It rewrites one movie's rows from the current state |
| `subtitles.search` (7a) | Queued by the import hook, a wanted search, **Search** and **Search all**; dedupe key `search:{fileId}` | It searches for what's still wanted when it runs; a language found by a run that crashed is no longer wanted |
| `subtitles.download` (7a) | One result chosen by a search or by **Use**; dedupe key `download:{fileId}:{language}:{flags}` | OpenSubtitles.com's link and its expiry are stored on the row before it's fetched, so a rerun within 3 hours fetches the same link and spends no second download; the track row is keyed by file, language and flags |
| `subtitles.wanted` (7a) | Every 6 hours, the prototype's interval (`j-subs`) | It searches only rows whose next search is due |
| `subtitles.upgrade` (7a) | Every 12 hours, Bazarr's default `upgrade_frequency` ([config.py](https://github.com/morpheus65535/bazarr/blob/master/bazarr/app/config.py)) | It asks only for tracks inside their upgrade days, under the cutoff, with a better score than they have |
| `subtitles.sync` (7b) | After every download, unless **Sync to the audio** is off; on **Re-sync**; dedupe key `sync:{trackId}` | It works from the stored original and writes the sidecar by renaming a finished file; a rerun gives the same result |
| `subtitles.resync` (7b) | When a file is replaced or renamed (checkpoint 6's import step 7, the scan) | It moves each external track's sidecar to the new file's name, scores hash matches again (the hash no longer matches), marks them **Waiting to sync**, and queues `subtitles.sync` for each |

- **Recovery:** a sync interrupted by a crash is retried on boot by the jobs' policy (exit criterion 5, "jobs, including subtitle sync, recover after a crash"); the track reads **Waiting to sync** meanwhile.
- **System › Tasks** (checkpoint 8) lists the two scheduled jobs; their schedules are registered now, as checkpoint 6 did for the library scan.

## Data

As migration **0007** (`0007_subtitles.sql`; the last is `0006_downloads.sql`):

- `language_profiles`: id, name, the rules as JSON (ordered), cutoff, minimum score, created, updated. Seeded with `lp-en`. `media_items.language_profile_id` already exists and gains its foreign key.
- `subtitle_providers`: id, enabled, the sealed credentials, the cached token and its expiry, the throttle (until, reason, recent failures), the quota (used, limit, resets at). Seeded with the three providers, each off until its account is set up, since all three need one.
- `subtitle_files`: id, `media_file_id` (cascade on delete), item, language, forced, SDH, format, kind (`external`, `bundled`), path, provider and its subtitle id, release name, score and the matched fields as JSON, chosen by hand, the original (compressed) and its detected encoding, the sync's status, confidence, ratio, offset and splits as JSON, the manual offset, synced at, created, updated. Unique on file, language, forced, SDH and provider, so a rerun can't add a second row. Indexed by item, and by sync status for the stats.
- `subtitle_wanted`: item, media file, language, forced, SDH, last searched, next search, searches so far. Primary key on the first five; indexed by next search.
- `subtitle_results`: the last search's results per file and language for 30 minutes, as checkpoint 5's `releases` cache is, so **Use** sends an id and the server never takes a download link from the browser.
- `subtitle_downloads`: an in-flight download's provider link and its expiry, so `subtitles.download` can run again without spending a second download (see Jobs).
- `history` gains the types `subtitle-upgraded`, `subtitle-deleted` and `subtitle-sync-failed` beside the existing `subtitle-downloaded` and `subtitle-synced`.
- **Settings row** `subtitles`: the prototype's `SubtitleSettings` (`minScore` 80, `autoSync` on, `minConfidence` 0.7, `upgradeDays` 14, `preferReleaseMatch` on).
- **`media_files.media_info`** gains the moviehash, computed at import and by the scan; files imported before this checkpoint get theirs from a one-time job.
- **A test seeds 100k movies** and their wanted rows and checks the wanted page and the stats stay on an index, as checkpoints 4 and 6 did.

## API

From the specs, with the changes real data forces:

| SDK | Route | Change from the spec |
| --- | --- | --- |
| `subtitles.stats()` | `GET /api/v1/subtitles/stats` | As specified; "today" is the server's day |
| `subtitles.wanted(cursor?)` | `GET /api/v1/subtitles/wanted` | Cursor-paged |
| `subtitles.searchAllMissing()` | `POST /api/v1/subtitles/wanted/search` | Queues the job and answers at once |
| `subtitles.forItem(id)` | `GET /api/v1/movies/{id}/subtitles` | As specified: external and bundled tracks; embedded streams come from `movies.files` |
| `subtitles.search(id, language)` | `POST /api/v1/movies/{id}/subtitles/search` | A POST, because it spends provider requests; results carry an `id` into the cache and the provider's attribution |
| `subtitles.download(id, resultId)` | `POST /api/v1/movies/{id}/subtitles` | Takes the result's id, not the result; answers with the track, **Waiting to sync** |
| `subtitles.sync(trackId)` (7b) | `POST /api/v1/subtitles/{trackId}/sync` | Queues the sync and answers with the track, **Syncing**; the result arrives on `subtitles.updated` |
| `subtitles.setOffset(trackId, ms)` (7b) | `PUT /api/v1/subtitles/{trackId}/offset` | The manual nudge only |
| `subtitles.delete(trackId)` | `DELETE /api/v1/subtitles/{trackId}` | Removes the sidecar too; a bundled track can be deleted, an embedded stream can't |
| `subtitles.providers()` | `GET /api/v1/subtitles/providers` | Adds `throttledUntil`, `throttleReason`, `fields` (what the Edit dialog asks for) and `attribution` |
| `subtitles.toggleProvider(id, enabled)` | `PATCH /api/v1/subtitles/providers/{id}` | Refused while an account is missing |
| `subtitles.saveProvider(id, credentials)` / `testProvider(id, credentials?)` | `PUT` / `POST /api/v1/subtitles/providers/{id}[/test]` | New, for [question 4](#open-questions-for-the-owner) |
| `subtitles.languageProfiles()` / `saveLanguageProfile` / `deleteLanguageProfile` | `/api/v1/languageprofiles` | As specified; delete answers 409 `in-use` |
| `subtitles.settings()` / `saveSettings(patch)` | `GET` / `PATCH /api/v1/settings/subtitles` | As specified |
| `subtitles.languages()` | `GET /api/v1/subtitles/languages` | As specified; codes are ISO 639-1 plus `pt-BR`, `zh-Hans`, `zh-Hant` |
| `movies.bulkUpdate(ids, { languageProfileId })` | the existing bulk route | Takes the profile ([question 13](#open-questions-for-the-owner)) |
| `setup.complete({ subtitleLanguages })` | the existing setup route | Takes the step's languages |

- **Access:** all `staff`, except saving and testing provider accounts, which are the owner's: they hold the owner's own credentials with third parties, as the importers' connections are owner-only (checkpoint 6, judgement call 13). Listing providers stays staff, because A10 shows them.
- **Events:** `subtitles.updated`, with the item's id where one changed (the mock's shape); plus `history.updated` and `item.updated` as tracks come and go.
- **Public info's `sources`** gains `subtitles`, so the dashboard's Subtitles widget comes alive (dashboard.md).
- **The client API:** `ClientDetail`'s subtitle tracks gain the external and bundled tracks beside the embedded streams (client-library.md), each with its language, forced and SDH flags and format. Playing them waits for `/stream`.

## Admin

- **A10 Subtitles** (7a; the stats in 7b): Wanted, Providers, Languages, and Scoring and sync, ported from the prototype. The providers are the real three ([question 2](#open-questions-for-the-owner)), each with **Edit** ([question 4](#open-questions-for-the-owner)) and the OpenSubtitles.com attribution under the table. Before 7b the stats card shows 0 synced and the tracks waiting, and Sync to the audio and Minimum confidence are saved but do nothing yet, with one caption: "Sync arrives in the next update." (judgement call 19).
- **A6's Subtitles tab** (7a; Re-sync and the offset buttons in 7b): the tracks table (external and bundled, then embedded), **Search for subtitles**, **Use**, Delete. Re-sync and the offset buttons are hidden in 7a, not disabled, so nothing offers what doesn't exist.
- **Setup's step 6** (7a): the prototype's Subtitle languages, between Indexers and Remote access, so the server's wizard has the prototype's 9 steps.
- **The dashboard's Subtitles widget** (7a, live in 7b).
- **The library's bulk bar** (7a): **Subtitle languages**, a menu of profiles beside the quality profile's ([question 13](#open-questions-for-the-owner)).
- **Toasts:** manual import's "Subtitles are next." comes back (manual-import.md).
- **System** (7a): health warnings for a provider whose login fails ("OpenSubtitles.com refused the password. Sign in again in Subtitles.") and, as a notice, one out of downloads until its reset; (7b) ffmpeg missing for sync joins the existing ffmpeg check.
- **Sweeps:** the server sweep boots with the fake providers and a library with a movie in every state (wanted, synced, waiting, low confidence, embedded only) and visits A10's four tabs, a profile in edit mode, the Edit dialog, A6's Subtitles tab with results, setup's step 6 and the dashboard, in the three themes, overflow, 200% text, reduced motion and the keyboard walk, including the profile's drag handle on the keyboard.

### What real data may force

These are expected and will be listed in the report as they land:

- **Providers tab:** an **Edit** button per row and the attribution line; the seed's SubSource, Podnapisi, Addic7ed and YIFY rows become OpenSubtitles.com, Subdl and SubSource; a throttled provider's row says until when.
- **A6 search results:** the attribution line under the table.
- **Re-sync's toast:** the prototype toasts the result at once; a real sync takes from seconds to a few minutes, so the toast says "Syncing {language} to the audio" and the row's badge follows, with a second toast on the result if the page is still open.
- **The download toast:** "Synced to the audio and ready on every client." is true only after the sync; it becomes "Subtitles downloaded · Syncing to the audio in the background." With Sync to the audio off: "Subtitles downloaded."
- **The Offset column's** detail line for framerate and splits (above).
- **The minimum score hint:** "about 99" (judgement call 8).
- **Low-confidence tracks** ([question 10](#open-questions-for-the-owner)): the **Not synced** badge with the confidence beside it and the reason in a tooltip.

## Test media: the Sintel fixture (7b)

ADR 0040 left the *Sintel* clip to this checkpoint, and checkpoint 6's answer 11 decided it's committed under CC-BY 3.0 with its credit ([question 12](#open-questions-for-the-owner)).

- **Licence:** *Sintel* is © Blender Foundation, under Creative Commons Attribution 3.0, with the credit "© copyright Blender Foundation | durian.blender.org" ([Durian: Sharing](https://durian.blender.org/sharing/); Xiph's mirror says the same of its files, [README.txt](https://media.xiph.org/sintel/README.txt)).
- **The subtitles:** the official English SRT, at `https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt` and mirrored by Xiph with checksums ([media.xiph.org/sintel/subtitles](https://media.xiph.org/sintel/subtitles/)). It has 26 cues, the first at 1:47.250 ("This blade has a dark past."), and the densest stretch is 1:45 to 2:37: 12 cues in 52 seconds.
- **The audio:** Wikimedia Commons holds the film as `Sintel_movie_4K.webm` under CC BY 3.0, served from `upload.wikimedia.org` without a challenge and with range requests ([File:Sintel_movie_4K.webm](https://commons.wikimedia.org/wiki/File:Sintel_movie_4K.webm)); its English timed text matches durian's SRT. download.blender.org stays behind its Cloudflare challenge (ADR 0040).
- **The fixture** is made once by a developer, by a script in `scripts/fixtures/` that is never run in CI or tests: ffmpeg reads 52 seconds from 1:45 over HTTP range requests, keeps the audio as 16 kHz mono FLAC (about 800 KB), and writes the 12 cues re-timed to the clip. Both are committed under `packages/subtitles/test/fixtures/sintel/` with a README holding the credit, the licence, the sources, the cut and the SHA-256 of each file. FLAC is lossless, so the test decodes the same samples on every machine and no resampling differs between ffmpeg versions.
- **The end-to-end clip:** checkpoint 6's generated "Sintel.2010.1080p.BluRay.x264" has a sine tone for audio, which no VAD calls speech, so it could never be marked synced. Its generator muxes the fixture's audio in instead, and the fake OpenSubtitles serves the fixture's SRT for it.

## Tests

- **`subtitles/shared`** (7a):
  - processing: SRT with commas and dots, missing indexes, CRLF and stray blank lines; WebVTT from the W3C's examples; ASS timings rewritten with styles untouched; windows-1250, windows-1251, ISO-8859-7, Big5 and Shift_JIS files decoded to the same UTF-8; a BOM wins over the guess; files over 2 MB and zips with paths refused;
  - cleanup: ad cues removed, dialogue that mentions a website kept; the SDH removal against hand-written cases;
  - scoring: Bazarr's weights against hand-worked examples, a hash match standing alone only with source and codec, Prefer release matches off, translations dropped;
  - profiles: the forced and SDH rules, the cutoff, the higher minimum score;
  - sidecar names, including two versions in one folder and a second track with the provider's title;
  - the moviehash against OpenSubtitles.com's documented test vector.
- **`subtitles/providers`** (7a), against `subtitles/fake`, written from each API's documented shapes, as checkpoint 5's fake indexer is; no recording carries a real key, token or account:
  - OpenSubtitles.com: login and `base_url`, the token's 12-hour reuse, a 401 not retried, search with sorted parameters, download's link stored before it's fetched, a 406 throttling until `reset_time_utc`, a 429 throttling for a minute;
  - Subdl: search and the zip, a zip with a path outside refused;
  - SubSource: search, download, its rate limit;
  - throttling's state machine with a fake clock: counted failures, waits, a restart keeping them.
- **`subtitles/movies`** (7a): bundled subtitles copied by the import hook before a Move import finishes; the wanted rows after an import, a profile change and a deletion; embedded streams satisfying a rule; search on import with three fake providers, one throttled; upgrades within the days, stopping at the cutoff, never replacing a track chosen by hand; each job run twice gives one result.
- **`subtitles/sync`** (7b):
  - **the core on synthetic spans,** no audio: offsets from −60 to +60 seconds, each framerate ratio, one and two splits, noise cues and missing speech; every cue within ±100 ms of the truth;
  - **the ±100 ms test** (exit criterion 3, the roadmap's Verification): the Sintel fixture's SRT shifted by +2.5 seconds, by −1.2 seconds with a 25/23.976 stretch, and with a 3-second split; the engine restores every cue to within ±100 ms of the official timing, and reports at least the default minimum confidence;
  - **against a reference track:** a generated clip with an embedded text subtitle and the same subtitle shifted outside it; a PGS reference read from saved `ffprobe -show_frames` output;
  - **no speech:** a generated clip with a sine tone gives a confidence under the minimum, and the original timing is kept;
  - the worker path under Node, as the pool's own test runs; a sync cancelled by the job's signal stops ffmpeg.
- **The resilience test** (exit criterion 5): kill the server mid-sync, boot again, and the sync runs once more and finishes, with one sidecar and one history entry.
- **The end-to-end run** (exit criterion 2.6): after checkpoint 6's run, the fake OpenSubtitles attaches `Sintel (2010) Bluray-1080p.en.srt`, and A6 shows it **Synced** with its confidence. In-process here; under Docker with Playwright in checkpoint 9.
- **Integration:** each new route's happy path and access through the SDK; the guard table picks up the new routes; `openapi.json` regenerated.
- **Node smoke:** loads the VAD's WebAssembly in a pool worker under Node 24.21 and aligns a short synthetic signal.

## ADRs

- **0043, subtitles:** providers as code, not a catalog kind; OpenSubtitles.com's one key per application and the owner's own account; the throttling after Bazarr's; scoring on Bazarr's movie weights; profiles' rules; processing with `TextDecoder` and in-house parsers; originals in the database; sidecar names after the video file, with `.forced` and `.sdh`; the import hook.
- **0044, the subtitle sync engine:** the reference order, audio through ffmpeg in a worker, WebRTC VAD in WebAssembly, FFT correlation and the framerate set from ffsubsync, splits from alass's problem statement written fresh, the confidence measure, and why a low-confidence sync keeps the original.
- **ADR 0040 is amended,** not replaced: the Sintel fixture, its source on Wikimedia Commons, the FLAC cut and its credit, and the end-to-end clip's borrowed audio.

## Docker and licences

- **No new system packages:** ffmpeg and ffprobe are already in the image (checkpoint 6).
- **New dependencies** are MIT (`chardet`, `fft.js`) and BSD-3-Clause (`@echogarden/fvad-wasm`), and pass `bun run licenses`. The VAD's WebAssembly file ships in the package; `next build` needs it in `serverExternalPackages` if Next's bundler would otherwise touch it, which is checked against Next's documentation at build.
- **Fixtures:** the Sintel files carry their CC BY 3.0 notice in their README, and the repository's notices list them.
- **Bazarr** (GPL-3.0) is read for behaviour only, as Radarr is (ADR 0031). GPL-3.0 § 13 would allow combining its code with AGPL code, but the combined part would stay under GPL-3.0's terms ([GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.txt)), so nothing is copied.

## Specs owed

Updated as part of the checkpoint, each change listed in the report:

- **subtitles.md:** the providers, the Edit dialog, the attribution, throttling, the rules' meaning, the answered open questions, the hint, the API table.
- **movies.md:** the tab as built: bundled tracks, Re-sync as a job, the toasts, the Offset column's detail, the bulk bar's profile menu.
- **setup.md:** step 6 as built, 9 steps.
- **settings.md:** the sidecar in Media management's preview.
- **dashboard.md:** the Subtitles widget's source.
- **manual-import.md:** "Subtitles are next." back.
- **roadmap.md:** the providers (Podnapisi closed, Gestdown with shows, YIFY out), `.sdh` and names after the video, the engine as designed, OpenSubtitles.com's key rule.
- **The prototype's mock:** the three providers, the attribution, the asynchronous Re-sync.

## Risks

- **OpenSubtitles.com's terms and quotas.** A free account downloads 20 subtitles a day, so **Search all** on a large library takes days; the wanted job spreads it and the Providers bar shows it. If OpenSubtitles.com changes its integrator terms, highsea's key can be revoked for every install at once; Subdl and SubSource keep working with the owner's own keys.
- **Providers come and go.** Podnapisi closed this year. Each adapter is small and isolated, and the throttling turns a dead provider into a warning, not an error.
- **Sync on hard films.** Music-heavy films, long silences and dubbed audio give the VAD little to work with. The confidence gate keeps the original timing then, which is what the spec decides; the risk is only that more tracks than hoped read **Not synced**.
- **The confidence measure is highsea's own.** No tool publishes one, so its thresholds come from our tests, not from documentation. The ADR says so, and the owner's NAS (read-only) is the check against real releases, by hand, in the report.
- **Time on a NAS.** Decoding two hours of DTS or TrueHD to 16 kHz mono takes a while on a low-power CPU. It runs one at a time in the background with a 15-minute timeout; the time is measured on the NAS and reported.
- **WebAssembly in a worker under Bun.** Tests run under Bun; if the VAD's WebAssembly misbehaves there, the VAD's tests run under Node like the pool's.
- **The Sintel source.** If Wikimedia's copy moves, the fixture is already committed; only remaking it needs the source.

## Open questions for the owner

Each has a recommendation; the first option is it.

1. **One checkpoint or two.**
   - **Recommended:** two gated halves. **7a** finds and keeps subtitles (profiles, providers, scoring, processing, sidecars, embedded and bundled tracks, the search, wanted and upgrade jobs, A10, A6's tab, setup's step, the widget, the bulk bar). **7b** is the sync engine (the worker, VAD, alignment, confidence, the reference track, the sync and re-sync jobs, the offset, Re-sync, the Sintel fixture, the ±100 ms test and the end-to-end's step 6). Each stops for review.
   - Or: one checkpoint, reviewed once at the end.
2. **The providers at launch.**
   - **Recommended:** OpenSubtitles.com, Subdl and SubSource, each with a documented API. Podnapisi is closed; Gestdown and Addic7ed are TV only and come back with shows; YIFY Subtitles has no API and is left out. The prototype's seed rows change; its layout doesn't.
   - Or: OpenSubtitles.com alone, the others later.
   - Or: also YIFY Subtitles by scraping, as Bazarr does, accepting that it can break or be refused at any time.
3. **highsea's OpenSubtitles.com consumer key.** OpenSubtitles.com requires one key per application and bans apps that ask users for keys; the owner registers highsea's key with an account they hold.
   - **Recommended:** the key is a CI secret, built into the release image (`HIGHSEA_OPENSUBTITLES_KEY`), never committed, so the standing rule on secrets holds; a source build without it offers OpenSubtitles.com disabled, with a line saying why. The attribution line "Subtitles provided by OpenSubtitles.com" joins A6's results and A10's Providers tab, as free keys require.
   - Or: commit the key in the source, as Bazarr does: it identifies the application and grants nothing without the owner's own account, but it's a key in the repository.
   - Or: a paid OpenSubtitles.com plan, which drops the attribution requirement and isn't needed for one owner's library.
4. **Where provider accounts are entered** (subtitles.md's open question).
   - **Recommended:** an **Edit** dialog per provider from A10's Providers tab, built like A9's Edit dialog (the fields, Test, Save), owner only. It's new layout in a locked screen, small enough to approve from this description, as checkpoint 6's questions 9 and 10 were.
   - Or: a prototype of the dialog first, approved before 7a builds it.
   - Or: in setup's subtitle step, which adds a form to a step the prototype keeps to languages.
5. **Provider order** (subtitles.md's open question).
   - **Recommended:** searched together and ranked by score; ties go to OpenSubtitles.com, then Subdl, then SubSource. No ordering UI.
   - Or: an order the owner sets, asking the first provider before the others, which saves requests but needs a drag handle on the Providers table.
6. **Providers as a catalog kind** (the roadmap's generalized catalog).
   - **Recommended:** no, code. Each provider is its own API, so an entry would carry nothing usable without a server release. The catalog can carry provider facts later, if a common format emerges.
   - Or: a `subtitle-providers` kind now, carrying only names, links and on-or-off, as a place for later facts.
7. **Sidecar names.**
   - **Recommended:** the video file's name plus `.{language}`, then `.forced` or `.sdh`, then the format: `Sintel (2010) Bluray-1080p.en.sdh.srt`. Every server documents `.forced`; Plex, Jellyfin and Emby document `.sdh`; a track both forced and SDH is named `.forced`.
   - Or: the roadmap's `.hi`, which Plex doesn't document and Jellyfin reads only after a language.
8. **Split correction in milestone 1** (the roadmap's "split-point … correction (alass-style)").
   - **Recommended:** yes, written fresh from the problem alass's thesis states, after the global offset and framerate fit, and kept only when it beats the global fit.
   - Or: offset and framerate only in milestone 1, splits later. It moves part of an [M1] item, so it changes decision 1.
9. **The voice activity detector.**
   - **Recommended:** WebRTC's VAD through `@echogarden/fvad-wasm` (BSD-3-Clause, WebAssembly, no dependencies): what ffsubsync and alass use, on the same 10 ms grid as the alignment, and a small file.
   - Or: Silero VAD (MIT) through `onnxruntime-web` (MIT), which is more accurate on noisy audio but brings a 2.3 MB model and a large WebAssembly runtime, runs single-threaded under Node, and works on 32 ms windows that need resampling onto the grid.
   - Or: an energy-based detector written here, which hears music as speech; ffsubsync keeps one only as a fallback.
10. **The review queue** (subtitles.md's open question).
    - **Recommended:** no new tab in milestone 1. A low-confidence track reads **Not synced** on A6, with its confidence and the reason, and keeps its original timing; the owner can Re-sync or nudge it. A "Needs review" list comes with checkpoint 8's filters if the owner wants one.
    - Or: a fifth tab on A10, **Needs review**, listing those tracks (new layout).
    - Or: a filter on Wanted.
11. **Cleanup switches.** The roadmap calls cleanup optional; the prototype's Scoring and sync form has no switches for it.
    - **Recommended:** no new switches. Ad cues are always removed; SDH text is removed only when a profile wants a track without SDH and only an SDH one exists, and the track is then stored as without SDH.
    - Or: two switches in Scoring and sync, **Remove ads** and **Remove hearing-impaired text** (fields added to a locked form).
12. **The Sintel fixture.**
    - **Recommended:** commit a 52-second, 16 kHz mono FLAC cut of *Sintel*'s audio (1:45 to 2:37, about 800 KB) with its 12 English cues, under CC BY 3.0 with the Blender Foundation's credit, made once by a script from Wikimedia Commons' copy; amend ADR 0040. The end-to-end clip borrows its audio.
    - Or: a gitignored cache fetched by the script, as the parent plan first said, which puts the network in front of the test and fails offline.
    - Or: the whole clip with video, which is larger and adds nothing to the sync test.
13. **Assigning language profiles in bulk** (subtitles.md's open question).
    - **Recommended:** a **Subtitle languages** menu on the library's bulk bar, beside its quality profile menu.
    - Or: later, with checkpoint 8's library work.
14. **Image subtitles in the file.**
    - **Recommended:** an embedded PGS or VobSub stream counts as having that language, as Bazarr's defaults do, so no download is spent on it.
    - Or: they don't count, so highsea also finds a text subtitle, which the web player will need once streaming arrives (image subtitles have to be burned in), at the cost of downloads.

## The owner's answers

Given on 2026-10-21: every recommendation is taken.

1. Two gated halves: 7a (finding and keeping subtitles), then 7b (the sync engine), each reviewed on its own.
2. OpenSubtitles.com, Subdl and SubSource at launch; Podnapisi, Gestdown, Addic7ed and YIFY Subtitles are left out.
3. highsea's own OpenSubtitles.com consumer key, which the owner registered on 2026-10-21. It's never committed: CI gets it as the secret `HIGHSEA_OPENSUBTITLES_KEY` and builds it into the release image, and local development reads it from the gitignored `.env.local`. A source build without it offers OpenSubtitles.com disabled, with a line saying why. Each owner signs in with their own OpenSubtitles.com account, and "Subtitles provided by OpenSubtitles.com" joins A6's results and A10's Providers tab. Tests use the fake, never the key.
4. Provider accounts in an Edit dialog per provider on A10's Providers tab, owner only (new layout).
5. Providers are searched together and ranked by score, ties go to OpenSubtitles.com, then Subdl, then SubSource; no ordering UI.
6. Providers are code, not a signed catalog kind.
7. Sidecars are named after the video file, with `.en`, `.en.forced` or `.en.sdh`.
8. Split correction stays in milestone 1, written fresh.
9. WebRTC's VAD through `@echogarden/fvad-wasm`.
10. No review tab: a low-confidence track shows "Not synced" with its confidence on A6 and keeps its timing.
11. No cleanup switches: ads always removed, SDH text only when the profile wants non-SDH and only an SDH track exists.
12. The Sintel fixture: a committed 52-second, 16 kHz mono FLAC cut with its 12 English cues, CC BY 3.0 with the Blender Foundation's credit, made once by a script; ADR 0040 is amended.
13. Language profiles can be set in bulk from the library's bulk bar.
14. Embedded PGS and VobSub tracks count as having their language.

## Judgement calls

To be listed again in the checkpoint report:

1. Language profile defaults per root folder wait for checkpoint 8; the add dialog already picks and remembers one.
2. Bundled image subtitles (`.sup`, `.idx` and `.sub`) are copied unchanged and never processed or synced.
3. Forced "Regular and forced" wants two tracks; SDH "With or without SDH" takes either, as the selects' labels read.
4. A profile in use can't be deleted; the last profile can't either.
5. Profile languages are ISO 639-1 plus `pt-BR`, `zh-Hans` and `zh-Hant`; ffprobe's ISO 639-2 tags are mapped by the Library of Congress table.
6. A wanted language nobody has is searched again after 1, 3 and 7 days, then weekly.
7. The wanted list is cursor-paged.
8. Scores follow Bazarr's movie weights scaled to 100, so a hash match is 99 and the hint says "about 99".
9. Machine- and AI-translated subtitles are never downloaded where the provider marks them.
10. A track chosen with **Use** is never replaced by an upgrade.
11. Forced isn't guessed from the number of cues; only flags and names say it.
12. Media management's naming preview shows the sidecar's name.
13. The sync engine is written fresh from ffsubsync's documented method and alass's published problem; neither's code is copied.
14. The sync's reference is an embedded text track, then an embedded image track's times, then the audio.
15. Speech gaps under 200 ms are closed before alignment.
16. The framerate is chosen from the six ratios both tools use; no golden-section search.
17. Confidence is the minimum of overlap, peak clarity and coverage, defined in ADR 0044.
18. Re-sync resets the manual nudge to zero.
19. Before 7b, A10 says "Sync arrives in the next update." under the sync settings, and A6 hides Re-sync and the offset buttons.
