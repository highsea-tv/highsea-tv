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
