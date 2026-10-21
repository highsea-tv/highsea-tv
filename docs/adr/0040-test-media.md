# 0040. Test media and the local swarm

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Downloading and importing need media to move and a swarm to move it through, and the standing rule is that no test reaches the network. The parent plan named a short CC clip cut from *Sintel*, fetched by a script into a gitignored cache with a checksum. Research for checkpoint 6 found download.blender.org behind a Cloudflare challenge that a script can't pass. The clip isn't needed until checkpoint 7's subtitle sync test ([phase-3-checkpoint-6.md › Test media and the swarm](../plans/phase-3-checkpoint-6.md#test-media-and-the-swarm), question 11).

## Decision
- **The media is generated in test setup** with ffmpeg's `lavfi` sources ([ffmpeg devices › lavfi](https://ffmpeg.org/ffmpeg-devices.html#lavfi)): `testsrc2` for video and `sine` for audio. `packages/media/test/clips.ts` makes:
  - a 1080p clip with 5.1 English audio, a French commentary track and a forced subtitle;
  - a PQ-tagged HDR clip;
  - short and sample-length variants.
  These are files no one owns. A machine without ffmpeg skips those tests and says so; CI installs it from Ubuntu's archive, as the Docker image has it from Debian's.
- **The end-to-end's "Sintel.2010.1080p.BluRay.x264-GRP"** is a generated clip carrying that release name.
- **Probe output for formats ffmpeg can't make cheaply** (Dolby Vision, HDR10, HLG) is saved ffprobe JSON, checked against the parser.
- **The swarm is local:**
  - a tracker on loopback, written for the tests (`startTracker` in `@highsea/torrent/testing`);
  - a second highsea engine seeding the files, bound to `127.0.0.1`;
  - the fake indexer (ADR 0035) serving the seeder's `.torrent` under a release's id.
  The made-up torrents the fake indexer serves by default announce to `tracker.invalid`, which RFC 6761 keeps from resolving. The server's API tests boot the engine offline, so it opens no socket at all.
- **Archives for 6b's extraction tests** come from libarchive's own test suite (BSD-2-Clause), which holds RAR, RAR5 and multi-volume samples, so no one needs the proprietary RAR tool to make fixtures.
- **The *Sintel* clip** stays checkpoint 7's: it's fetched then, by hand or from a mirror the owner chooses, for the sync test.

## Consequences
- Every download and import test runs offline, on any machine with ffmpeg, in seconds.
- Generated clips test the pipeline, not real-world encodes. The owner's NAS (read-only) is the check against real releases, by hand, in the checkpoint report.
- No copyrighted or downloaded media sits in the repository or its fixtures.

## Checkpoint 7b: the *Sintel* fixture (2026-10-21)
The last decision above is settled by the owner's answer 12 to checkpoint 7's questions.

- **A 52-second cut of *Sintel*** (2010) is committed in `packages/subtitles/test/fixtures/sintel/`. It holds:
  - the audio from 1:45 to 2:37 as 16 kHz mono FLAC, 1,581,376 bytes. The plan estimated about 800 KB; FLAC of real speech and music compresses less than that;
  - the 12 official English cues inside the cut, re-timed to it.
- **Its sources:**
  - the audio comes from Wikimedia Commons' `Sintel_movie_4K.webm`, not download.blender.org, whose challenge a script can't pass;
  - the subtitles come from durian.blender.org, checked against Xiph's published SHA-1.
- **How it was made:** `scripts/fixtures/sintel.ts` made the cut once. It reads the network, so it never runs in CI or a test.
- **Its credit:** "© copyright Blender Foundation | durian.blender.org", under CC BY 3.0. Its README has the credit, the licence, the sources, the cut and each file's SHA-256, and the repository README's licence section lists it.
- **The clips built from it:** the end-to-end's release clip and the Node smoke test borrow the audio. `makeSyncClip` in `@highsea/subtitles/testing` muxes it under a black picture, at 1080p for the end-to-end, so the release's import and its subtitle's sync are both tested on real speech.
- **A PGS track's timings:** `fixtures/pgs/show-frames.json` is ffprobe's report of a commercial Blu-ray's PGS stream: timings only, with no picture or text. The image-reference tests read it.
- **One change to the Consequences above:** the line "No copyrighted or downloaded media sits in the repository" now has one exception, the CC BY cut, which is downloaded and credited.
