# 0018. The admin UI reads and writes through the public API

- **Status:** Accepted (refines [0006](0006-public-api-openapi-sdk.md))
- **Date:** 2026-10-19

## Context
[0006](0006-public-api-openapi-sdk.md) says domain services hold the logic, and both API handlers and admin Server Actions are thin adapters over them. That leaves two paths into every service: one for the admin, one for everyone else. Each needs its own permission checks and tests, and the two drift.

The signed-off admin prototype is written against an SDK-shaped client: `useQuery(key, call, topics)` and `useAction(call)`, refetching when a server event names a topic.

## Decision
- The admin UI calls `/api/v1` through `@highsea/sdk`, like every other client. **No Server Actions.**
- `@highsea/sdk/react` provides the prototype's hook shapes (`useQuery`, `useAction`), cached and refetched on the SSE topics the screen names.
- Server components do only what needs the server: the shell's first paint, redirects (sign-in, first-run setup) and metadata. They read the runtime directly through `getRuntime()` for that, never to change data.
- The admin signs in with a cookie session; clients use device tokens; scripts use API keys. The API accepts all three.

## Consequences
- Every admin capability is reachable through the API with admin scope, by construction (Phase 3 exit criterion 7).
- One set of permission checks and one set of tests per capability.
- Admin screens port from the prototype by swapping the mock client for the SDK.
- Some screens pay a client round trip on first load that Server Actions would avoid. The shell's first paint is server-rendered to keep that small.
