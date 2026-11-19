# 0067. Intro and credits markers: chapters first, then the sound a season shares

- **Status:** Accepted
- **Date:** 2026-11-19

## Context

Phase 5's C2 ([plan](../plans/phase-5-real-use.md)) gives episodes **Skip intro** and **Skip credits** in the player ([player.md](../product/player.md) › Episodes). The contract has carried the marks since the one client platform's stage 2: an episode's `intro` (`{start, end}` in seconds) and `credits` (where they start) on `EpisodePlace` (`packages/api-contract/src/kinds.ts`), null until the server finds them. The mock marked them; the server didn't.

Jellyfin's [media segments](https://jellyfin.org/docs/general/server/metadata/media-segments/) is the idea: typed time ranges on an item ("Commercial, Preview, Recap, Outro, and Intro"), filled by providers, one of which reads them from the file's chapters. highsea needs two of those types, and writes its own from the documentation. No code is taken from Jellyfin or any intro-skipper plugin (both GPL).

What highsea has to find them with:

- **Chapters.** Matroska and MP4 carry named chapters ([Matroska: Chapters](https://www.matroska.org/technical/chapters.html)), and many releases, discs especially, name an "Opening" or "End Credits". ffprobe reads them with `-show_chapters` ([ffprobe](https://ffmpeg.org/ffprobe.html#Main-options)).
- **The sound episodes share.** A season's episodes open on the same titles and close on the same credits music. [Chromaprint](https://acoustid.org/chromaprint) turns audio into a fingerprint: 32-bit items, each covering a window of the sound, and similar sound gives items a few bits apart. FFmpeg writes it with its [`chromaprint` muxer](https://ffmpeg.org/ffmpeg-formats.html#chromaprint-1) when it's built `--enable-chromaprint` ([FFmpeg: General](https://ffmpeg.org/general.html)). The muxer takes "a single signed native-endian 16-bit raw audio stream of at most 2 channels", and `-fp_format raw` gives the items as 32-bit integers. Chromaprint's header documents an item every `chromaprint_get_item_duration` samples (1365 at its 11,025 Hz, about 0.124 s) and a lead of `chromaprint_get_delay` (about 2.6 s of sound before the first item) ([chromaprint.h](https://github.com/acoustid/chromaprint/blob/master/src/chromaprint.h)).

The constraints: the owner's NAS (a DS1520+, a four-core Celeron J4125) holds about 8,000 episodes; finding marks must never slow a play or a transcode; Homebrew's ffmpeg has no Chromaprint and some others won't; and the owner must be able to correct a mark the server got wrong.

Alternatives weighed:

- **Comparing pictures** (black frames, scene cuts) instead of sound: a full decode of the video, many times the cost on the NAS, and intros don't always cut to black.
- **The `fpcalc` tool or a Chromaprint binding** as a dependency: ffmpeg is already in the image and does the decode itself; a second binary or a native module adds a dependency for nothing ffmpeg's muxer lacks.
- **Comparing every episode with every other**: quadratic in a season's length; a few nearest neighbours find the shared stretch as surely.

## Decision

**Where they're kept.** `episode_markers` (`packages/db/src/schema/playback.ts`, migration `0027_episode_markers`), one row per episode file: the intro's start and end, where the credits start, each with its source (`chapters`, `audio` or `owner`), the file's size when it was looked at, any error, and when. A row goes with its file (`ON DELETE CASCADE`). A file whose size changed is looked at again; a mark the owner set stands whatever the size.

**Chapters first** (`@highsea-tv/stream/markers`, `chapterMarkers`). A chapter's name is read without its numbering or case ("01 - Intro" → "intro"). The intro is the first chapter named `intro`, `opening` (or opening credits, titles, theme, song), `title sequence`, `main title(s)` or `op`, that starts in the episode's first half and lasts at most five minutes. The credits start at the last chapter named `credits`, `end credits`, `ending credits`, `closing (credits)`, `end titles`, `ending (theme, song)`, `outro` or `ed`, that starts in the second half. These are the names releases and discs use, the anime ones (OP, ED) among them; a name merely containing "intro" ("Introduction to the case") isn't one, nor is a numbered "Chapter 3".

**Then the sound** (`fingerprint`, `sharedStretch`). Where chapters leave a mark missing, the head of the episode (a quarter of it, at most ten minutes) and its tail (a fifth, at most five) are fingerprinted with `ffmpeg … -map 0:a:0 -ac 1 -ar 11025 -c:a pcm_s16le -f chromaprint -fp_format raw -`, at `nice` 19 ([os.setPriority](https://nodejs.org/api/os.html#ossetprioritypid-priority)). Each is laid against the same end of the nearest episodes in the season that have files, up to three, at every shift; the longest run of items within 8 bits of each other (a gap of up to 2 s bridged), trimmed at each end to where most items agree, is the shared stretch. An intro is 15 s to 3 min; credits at least 15 s, starting in the second half. A run of near-silence (few distinct items) is no stretch. The ends are then moved by Chromaprint's window, measured on clips made for the tests: 0.5 s on the start, 1.2 s on the end. The comparing is pure arithmetic, run in the worker pool (`MARKERS_WORKER`). Season 0 (specials) takes chapters alone: its episodes rarely share titles.

**The job** (`media.markers`, `packages/runtime/src/markers.ts`). One season per run, the season of the newest file waiting first, then a 30 s rest before the next. It's queued by the import's and the scan's hook and at boot when anything waits, deduplicated, so a first pass over a library goes season by season behind everything else. It runs one at a time with one attempt: a file that can't be read keeps its error and isn't tried again until it changes. A season with a file being played or transcoded (`playback.sessions()`) waits ten minutes. It reads what's stored and writes whole rows, so it's safe to repeat (ADR 0022), and never changes a mark whose source is `owner`.

**Without Chromaprint.** `ffmpeg -muxers` is asked once. Without the muxer the job logs it once, takes chapters alone, and marks the files still missing a mark with that reason; a server started with an ffmpeg that has it looks at those files again. It never fails a job for it.

**What reads them.** The apps' episode (`shows.client.item`) fills `intro` and `credits` from its first version's file. The admin's episode row (`SeriesEpisode.markers`) shows them with their sources; `PUT /series/{id}/episodes/{episodeId}/markers` sets or clears a mark as the owner's, and `DELETE` on the same path forgets the file's marks, the owner's too, and has its season looked at again.

**The player** (`@highsea-tv/client/player`). Skip intro shows from the intro's start until its last second and seeks to its end; *Skip intros automatically* (`playback.skipIntros`) does that once per intro. Next up opens where the credits start, counting its ten seconds from there; after Cancel, Skip credits brings it back counting from that moment, or, with nothing to come, ends the episode.

## Consequences

- Marks come from files as they are, with no service and no network, and an owner who disagrees has the last word.
- A first pass costs about 15 minutes of each episode's sound decoded, at the lowest priority, a season at a time with rests: on the NAS, days rather than hours for 8,000 episodes, and it waits for anyone watching. The pace is a constant (`SEASON_PAUSE_MS`); a setting can come if real use asks for one.
- A season of one episode, or of episodes whose openings differ, has no audio marks; chapters or the owner's are the only ones. A recap before the titles is part of the cold open, not the intro; a preview after the credits is part of the credits. Jellyfin's Recap and Preview types are left for later.
- An ffmpeg without Chromaprint (Homebrew's, some distributions') gives chapters only. The image's ffmpeg is Debian's, built with it; its tests skip and say so where it's missing.
- Films have no marks; their Next up keeps the last seconds.
