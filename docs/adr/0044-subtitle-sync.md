# 0044. The subtitle sync engine

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
A downloaded subtitle is often made for another release of the film: it starts early or late, runs at another framerate, or loses step after a cut scene. Checkpoint 7b lines each one up with the video ([the plan](../plans/phase-3-checkpoint-7.md#the-sync-engine-7b), [subtitles.md](../product/subtitles.md)). The established tools are ffsubsync (MIT) and alass (GPL-3.0). Both are command-line programs in other languages, and highsea runs as one Node process (ADR 0003). The owner chose a WebAssembly build of WebRTC's voice detector (answer 9). No tool publishes a confidence that can be compared from one film to another, so highsea defines its own (judgement call 17).

## Decision
- **The reference, best first:**
  1. an embedded text subtitle that isn't forced, extracted as SRT with `ffmpeg -map 0:{index} -f srt -`, as ffsubsync does;
  2. an embedded image subtitle's display times from ffprobe (`-show_entries subtitle=pts_time,start_display_time,end_display_time,num_rects`). PGS gives no end time ([pgssubdec.c](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/pgssubdec.c)), so a cue runs until the next display set, and the last one gets 5 seconds;
  3. the speech in the default audio stream.

  Streams are addressed by their absolute index.
- **Speech:**
  - ffmpeg decodes the audio to 16 kHz mono signed 16-bit PCM on its standard output, with ffsubsync's `aresample=async=1`.
  - The PCM goes, as it arrives, through WebRTC's VAD (`@echogarden/fvad-wasm`, libfvad in WebAssembly, BSD-3-Clause) in mode 3, ffsubsync's setting. It's never held whole: a two-hour film is about 230 MB of PCM, and the result is a byte per 10 ms frame, 720 KB.
  - Gaps under 200 ms are closed.
- **Alignment** (`sync/align.ts`, pure):
  - **The offset and framerate:**
    - The reference and the cues are signals of +1 and −1 on the 10 ms grid, cross-correlated by FFT (`fft.js`, MIT), as ffsubsync's `FFTAligner` does.
    - Each framerate ratio ffsubsync and alass try is scored: 1, 25/24, 25/23.976, 24/23.976 and their reciprocals.
    - The best score within ±60 s wins (ffsubsync's and Bazarr's limit).
  - **Splits:**
    - A dynamic program over the cues, in order, lets a run of cues take its own offset within ±10 s of the global one. This is the problem alass's thesis states (§2.5), written fresh from that statement: no alass code is used.
    - A split costs one typical cue's speech agreeing in full: 2 × the median cue's speech length in frames. A ratio other than 1 also costs one cue.
    - Every section must stand clear at its place against anywhere else in its window, with local clarity of at least 0.3. If any section falls short, the penalty doubles and the program runs again (judgement call 37). Without this rule, another film's cues reached confidence 1 with 55 sections, each chasing whatever speech was near.
  - **The speech-rate model** (judgement call 35):
    - A cue stays up for reading after its line is spoken. So, against speech, only its first `characters / 17` seconds count as speech, and the rest scores 0. Scoring the whole cue left a plateau half a second wide.
    - Netflix's Timed Text Style Guide caps reading speed at 20 characters a second for adults and 17 for children ([the guide](https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977)). Calibration chose 17: at 20, Sintel's split sections weren't placed within 100 ms.
    - Against an embedded subtitle, the whole cue counts.
- **Confidence** is the minimum of three measures, each from 0 to 1, so any one can veto. Each measure counts 1 at its mark and less in proportion below it (judgement calls 36 and 45):
  - **overlap:** how significant the share of the cues' speech time on speech is: its standard deviations above the share the same placed cues get when moved as a whole to 300 places spread over the film, wrapping at its end, none within 10 seconds of the fit. It counts 0 below 4 and 1 from 6, so a sync is kept from 5.4;
  - **clarity:** how far the fit stands above the best fit more than a second away, relative to the median. The mark is 0.2. A sine tone or the wrong film scores near 0;
  - **coverage:** the share of cues with reference activity within a second of them. The mark is 0.75.

  **Why significance, not the share itself** (2026-10-21, at 7b's review): the share was first marked from 0.15 to 0.35, from Sintel's clean dialogue and synthetic films. On real films it kept 14 of 72 right subtitles. How much speech the VAD hears depends on the mix: under music and effects, right subtitles lift the share only 0.10 to 0.16, while wrong ones, fitted with every freedom the engine has, reach 0.17. The share's significance can be compared from film to film, because it measures the fit against the same cues and the same audio placed elsewhere. A wrong subtitle is the best of about a thousand independent tries (±60 s, each a second apart, at 9 framerates), and the best of a thousand tries of noise sits about √(2 ln 1000) ≈ 3.7 deviations up. Hence the floor of 4.

  **Calibration on real films** (`scripts/calibrate-sync.ts`, read-only, never in CI): every 28th film with an English sidecar in a 1,349-film library, 24 films. Each film's own subtitle was aligned as it was, then moved as releases move them (25/23.976 and +2.5 s; +1.5 s with a 3-second cut halfway), against two other films' subtitles and its own lines scattered at random:

  | Case | Kept at 70% | Significance |
  | --- | --- | --- |
  | Right subtitles, placed (within 500 ms of the film's own fit at p90) | 56 of 58 | 4.7 to 22.4 |
  | Right subtitles the engine misplaced (a cut it didn't find) | 0 of 2 | 4.1 to 5.1 |
  | Films whose fit can't be verified (a moved copy doesn't come back) | 0 of 12 | 1.6 to 5.0 |
  | Wrong subtitles | 0 of 72 | −8.5 to 4.0 |

  The two right subtitles not kept are *Don't Look Up*'s, at 4.7: it places them consistently, but on evidence a wrong subtitle comes close to, so the original timing stays. The four films that can't be verified are *Watchmen* (the file is the 215-minute Ultimate Cut; the sidecar is almost certainly the theatrical cut's), *Avengers: Endgame* and *Blair Witch* (their own subtitles fit their speech no better than chance), and *Charlie and the Chocolate Factory* (a third of a moved copy lands over 500 ms away). The negatives were run against every one of them.

  | Film | Cues | Speech heard | Own subtitle: significance, confidence | Moved, cut: p90 | Wrong subtitles: highest significance |
  | --- | ---: | ---: | --- | --- | ---: |
  | (500) Days of Summer (2009) | 1434 | 19% | 12.7, 1.00 | 3 ms, 20 ms | 2.7 |
  | American Psycho (2000) | 1173 | 27% | 13.3, 1.00 | 13 ms, 180 ms | 1.3 |
  | Avengers: Endgame (2019) | 1758 | 12% | 1.7, 0.00 | not found | 2.7 |
  | Blair Witch (2016) | 1325 | 18% | 2.3, 0.00 | not found | 2.1 |
  | Charlie and the Chocolate Factory (2005) | 611 | 13% | 4.9, 0.43 | 990 ms, 2366 ms | 2.3 |
  | Don't Look Up (2021) | 2232 | 22% | 4.7, 0.34 | 4 ms, 3040 ms | 2.3 |
  | Fanboys (2009) | 1346 | 27% | 8.6, 1.00 | 12 ms, 30 ms | 2.6 |
  | Ghost Ship (2002) | 676 | 15% | 8.6, 1.00 | 32 ms, 40 ms | 3.3 |
  | Hellboy (2019) | 1533 | 30% | 12.3, 1.00 | 13 ms, 10 ms | 2.7 |
  | Idiocracy (2006) | 1207 | 24% | 8.3, 1.00 | 22 ms, 90 ms | 2.5 |
  | Judas and the Black Messiah (2021) | 2102 | 17% | 16.7, 1.00 | 14 ms, 70 ms | 1.6 |
  | Legally Blonde (2001) | 2035 | 27% | 21.9, 1.00 | 13 ms, 10 ms | 3.3 |
  | Men in Black II (2002) | 1060 | 18% | 10.0, 1.00 | 12 ms, 20 ms | 2.4 |
  | Novocaine (2025) | 1516 | 25% | 16.4, 1.00 | 13 ms, 10 ms | 3.4 |
  | Predator 2 (1990) | 705 | 30% | 6.2, 1.00 | 12 ms, 2990 ms | 3.0 |
  | School of Rock (2003) | 1581 | 37% | 16.4, 1.00 | 3 ms, 0 ms | 2.0 |
  | Spider-Man: Far From Home (2019) | 1664 | 24% | 10.1, 1.00 | 23 ms, 9 ms | 3.5 |
  | Team America: World Police (2004) | 1211 | 20% | 15.4, 1.00 | 13 ms, 40 ms | 1.8 |
  | The Curious Case of Benjamin Button (2008) | 1812 | 12% | 17.3, 0.99 | 6 ms, 10 ms | 2.1 |
  | The Hobbit: The Desolation of Smaug (2013) | 1145 | 10% | 8.8, 1.00 | 15 ms, 40 ms | 2.9 |
  | The Man Who Killed Don Quixote (2018) | 2136 | 25% | 17.2, 1.00 | 14 ms, 348 ms | 4.0 |
  | The Running Man (2025) | 2384 | 13% | 14.5, 0.96 | 5 ms, 0 ms | 2.9 |
  | Thumbsucker (2005) | 1361 | 26% | 16.8, 1.00 | 23 ms, 362 ms | 2.7 |
  | Watchmen (2009) | 2033 | 8% | 3.1, 0.00 | not found | 3.6 |

  Placement itself held on real films: offsets came back exactly, framerates within 35 ms, and cuts within 60 ms when found. A cut through a stretch without speech can leave the lines near it in the wrong section; that's the moved and cut column's larger figures.

  **Synthetic films and Sintel:** on the 20 synthetic films in the tests, every true distortion still scores 1 and every wrong film stays under 0.5. *Sintel*'s 12 cues are less evidence than a film's thousand or more: they stand 5.4 deviations up, a confidence of 0.69, so the tests that sync the clip set the minimum to 0.6 (`sintel.minConfidence`). Scattered, its cues stay under that.

  The default minimum stays the prototype's 70%.
- **A sync below the minimum keeps the original timing.** The track reads **Not synced**, with its confidence, and history says "Kept the original timing". A wrong sync is worse than none: the owner can still Re-sync it or nudge it.
- **Where it runs:**
  - The engine runs in the worker pool (`{ module: SYNC_WORKER, fn: 'sync' }`). The worker spawns ffmpeg itself, with an argument array and never a shell, and posts back a few kilobytes.
  - The `subtitles.sync` job runs one at a time, with 2 attempts and a 15-minute timeout.
  - A missing ffmpeg is a `SyncError`. It fails the sync at once, without a retry, and System › Health warns about it (`HIGHSEA_FFMPEG` points at another binary).
- **Cancellation:** the pool's `run(task, { signal })` takes a signal.
  - A queued task is dropped.
  - A running one is sent `{ cancel: id }`, which aborts the signal its function was given.
  - `spawn`'s `signal` option kills ffmpeg ([Node.js docs](https://nodejs.org/docs/latest-v24.x/api/child_process.html#child_processspawncommand-args-options)).

  A job that times out, or a server shutting down, leaves no ffmpeg behind.
- **Safe to repeat** (ADR 0022):
  - The sidecar is always written from the stored original, with the correction and the owner's nudge, by renaming a finished file.
  - History is keyed by the job's id.
  - A finished track whose sync is newer than the request is skipped.
  - At boot, tracks left Waiting or Syncing are queued again.
- **The manual offset** (`manual_offset_ms`) is stored apart from the correction. The API and A6 show one number: the correction at the first cue plus the nudge. Re-sync puts the nudge back to zero (judgement call 18).
- **A replaced file** queues a re-sync of its tracks. A hash match no longer holds, so the track's score drops to what title and year give (judgement call 38).

## Consequences
- **No network and no Python:** the engine is the server's own code, with three small dependencies (MIT, MIT, BSD-3-Clause), and runs the same in the Docker image as in CI.
- **Tested on real speech:** a 52-second CC BY cut of *Sintel* is committed with its official cues (ADR 0040, amended).
  - **The durian finding:** the official cues sit 240 to 420 ms off the speech the VAD finds, as hand-timed subtitles do. So the ±100 ms test measures the engine against its own placement of the undistorted cues. Against the official times, it holds within 450 ms.
  - The end-to-end moves the cues 2.5 s and gets −2.76 s back, the same 260 ms.
- **Measured on 24 real films** (above). The marks are constants in one place (`CONFIDENCE_MARKS`), and `scripts/calibrate-sync.ts` measures them again on any library: it caches the speech it finds, so a second run takes about three minutes.
- **Sync speed:** a sync costs one ffmpeg decode of the audio track; the alignment takes about a second. Reading over the network from a NAS, a film took 1 to 26 minutes, four at a time, depending on its size and audio codec; (500) Days of Summer took 3.5 minutes alone. Syncs run one at a time, so a whole library's first syncs take days rather than loading the machine.
