# 0002. Bun monorepo with multiple apps

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
The product has one self-hosted server app and multiple client apps. They share a design system, an API contract and an SDK. Server logic must stay modular so domains (movies, TV, music, books, online video) can be added independently.

## Decision
- A Bun workspace monorepo with `apps/*`, `packages/*`, `design/*`, `catalog/*` and later `cloud/*`.
- Internal packages export raw TypeScript (`"exports": { ".": "./src/index.ts" }`) and have no per-package build step. Apps transpile them.
- Domain packages are framework-free. Only apps and `ui-*` packages depend on React or Next.
- Bun is the package manager, script runner and unit-test runner. Production server code runs on Node LTS (see 0003).
- Biome handles lint and format. TypeScript runs in strict mode.

## Consequences
- Fast iteration with no build graph for internal packages.
- Publishing a package externally (e.g. the SDK) needs a build step added for that package only.

## 2026-11-15: Bun 1.4.4 in CI and the image (HT-16)
- **Decision, by the owner on 2026-11-15:** every workflow's `bun-version` and the Dockerfile's `oven/bun` move from 1.4.2 to 1.4.4 (released 2026-10-22, past the two-week rule).
- **Why:** Bun 1.4.0 to 1.4.3 can lose a synchronous spawn's exit when a garbage collection runs during the wait, and the call never returns ([oven-sh/bun#47257](https://github.com/oven-sh/bun/issues/47257); Bun's maintainers reproduced it on 1.4.0 and 1.4.3, and the fix, [#44581](https://github.com/oven-sh/bun/pull/44581), shipped in 1.4.4). A test's timeout then kills the child (`killed 1 dangling process`) and nothing runs again: CI's `check` hung in `library-import-api.test.ts` for 24 minutes on two of three attempts of PR #18 (run 43769100418), and in `stream-hls.test.ts` for four hours before HT-8.
- **Also:** the clips that file's `beforeAll` makes are spawned without blocking (`makeClipsAsync` in `@highsea-tv/media/testing`), as HT-8 did for the HLS file. The other tests' sync spawns keep `TOOL_LIMIT`.
- **Not moved here:** a developer's own Bun; `engines` still says `>=1.4`. A Mac on 1.4.3 can still hit the bug and should update.
