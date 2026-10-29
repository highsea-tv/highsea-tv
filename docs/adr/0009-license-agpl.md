# 0009. License: AGPL-3.0-only

- **Status:** Accepted
- **Date:** 2026-10-16

## Decision
highsea.tv is licensed **AGPL-3.0-only**.
- Every source file carries `SPDX-License-Identifier: AGPL-3.0-only`.
- CI runs a third-party license audit that blocks incompatible licenses. GPL-2.0-only is incompatible with AGPL-3.0.
- GPL-3.0 content (e.g. Prowlarr indexer definitions) may be adapted with attribution. GPL-2.0-only sources (e.g. Jackett definitions, parts of Jellyfin) may not be reused.
- GPL ffmpeg builds (x264/x265) are acceptable.

## Consequences
- Network-served modifications must be shared under the same license.

## 2026-10-29: the audit covers Rust's crates (checkpoint 4.4a)

The desktop app brings Rust's crates into the repository ([ADR 0058](0058-desktop-app.md)), and `bun run licenses` reads them too, for every platform, from `cargo metadata --locked`. It now reads SPDX expressions in full ([SPDX annex D](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/)): brackets, `AND` binding tighter than `OR`, `WITH` (only `LLVM-exception`, which only adds permissions), and Cargo's old `/` as `OR`.

Two licences were reviewed. `Unicode-3.0`, which ICU4X's crates use, is allowed: the FSF lists it as free and GPL-compatible ([its licence list](https://www.gnu.org/licenses/license-list.html#Unicode)). `webpki-root-certs` is `CDLA-Permissive-2.0`, Mozilla's root certificates as data, and is an exception with its reason in `scripts/license-exceptions.json`.
