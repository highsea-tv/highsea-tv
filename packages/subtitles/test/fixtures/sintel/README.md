# Sintel: the subtitle sync's test material

52 seconds of *Sintel* (2010), from 1:45 to 2:37, with the 12 official English cues inside that cut, re-timed to it. The sync's tests align the cues with the speech; the end-to-end's release clip and the Node smoke test borrow the audio.

## Credit and licence

© copyright Blender Foundation | durian.blender.org

*Sintel* is licensed under the [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/) licence ([Durian: Sharing](https://durian.blender.org/sharing/); Xiph's mirror says the same, [README.txt](https://media.xiph.org/sintel/README.txt)). These files are a cut of the original: the audio is trimmed and converted, and the subtitles are trimmed and re-timed.

## Sources

| File | Source | Made |
| --- | --- | --- |
| `sintel.flac` | Wikimedia Commons, [`Sintel_movie_4K.webm`](https://commons.wikimedia.org/wiki/File:Sintel_movie_4K.webm) | ffmpeg reads 52 s from 105 s over HTTP range requests (`-ss` before `-i`), keeps the first audio stream as 16 kHz mono FLAC, bit-exact, with no metadata |
| `sintel.en.srt` | durian.blender.org, [`sintel_en.srt`](https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt), checked against Xiph's SHA-1 `53d3a8d6fc6c7152e777f493224cec494b63d2b7` | the cues that start at or after 105 s and end by 157 s, moved 105 s earlier |

FLAC is lossless, so every machine decodes the same samples, and no resampling differs between ffmpeg versions.

`scripts/fixtures/sintel.ts` made both, once, on 2026-10-21. It reads the network, so it never runs in CI or a test.

| File | Size | SHA-256 |
| --- | --- | --- |
| `sintel.flac` | 1,581,376 bytes | `c103a37133325275003e046ebb7ff21537920ea8efc171f012f6e98d0e08144b` |
| `sintel.en.srt` | 784 bytes | `99cad795f88b99fba2606edd32308cc255c18e1617f13e0377b61db914ac773c` |

## What the cues are worth

The official cues sit 240 to 420 ms off the speech the voice detector finds (ADR 0044), as hand-timed subtitles do. So the ±100 ms test measures the engine against its own placement of the undistorted cues, not against the official times. Against the official times it holds within 450 ms.
