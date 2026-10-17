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
