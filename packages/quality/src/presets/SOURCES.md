# Custom format presets: sources

The JSON files in `radarr/` are custom formats from the **TRaSH Guides**, copied unchanged except for
whitespace (Biome's formatting). `@highsea/quality` reads them as data (`src/presets.ts`) and imports
them into its own condition model (`src/trash.ts`).

- **Repository:** https://github.com/TRaSH-Guides/Guides
- **Path:** `docs/json/radarr/cf/{name}.json`
- **Commit:** `529bd9c29eb41f38e36c14c41a137f4d5d824c99` (2026-10-18)
- **Fetched:** 2026-10-20
- **Licence:** MIT, notice below.

| File | TRaSH name |
| --- | --- |
| `2160p.json` | 2160p |
| `3d.json` | 3D |
| `amzn.json` | AMZN |
| `br-disk.json` | BR-DISK |
| `dts-hd-ma.json` | DTS-HD MA |
| `dv-boost.json` | DV Boost |
| `freeleech.json` | FreeLeech |
| `hdr.json` | HDR |
| `hdr10plus-boost.json` | HDR10+ Boost |
| `imax.json` | IMAX |
| `language-not-english.json` | Language: Not English |
| `language-not-original.json` | Language: Not Original |
| `lq.json` | LQ |
| `lq-release-title.json` | LQ (Release Title) |
| `remux-tier-01.json` | Remux Tier 01 |
| `repack-proper.json` | Repack/Proper |
| `truehd-atmos.json` | TrueHD ATMOS |
| `upscaled.json` | Upscaled |
| `webdl-boost.json` | WEBDL Boost |
| `wrong-language.json` | Wrong Language |
| `x264.json` | x264 |
| `x265-hd.json` | x265 (HD) |

To update: download the files at a newer commit into an empty directory, copy them here, run
`bunx biome check --write packages/quality/src/presets`, update the commit above, and run
`bun test --isolate packages/quality`.

## Licence

```
MIT License

Copyright (c) 2021 TRaSH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
