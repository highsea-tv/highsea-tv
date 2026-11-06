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

## 2026-11-04: the screens shared with their prototype (one client platform, part D1)

The admin's screens are now written once, in `@highsea-tv/admin` (`packages/admin`), and both the server's admin and its prototype draw them. The decision above is what makes that possible: a screen only reads and writes through `@highsea-tv/sdk/react`, so the prototype hands it an SDK client over `@highsea-tv/mock`'s transport ([ADR 0061](0061-one-client-platform.md)), and the server an SDK client over `/api/v1`. What differs between the two hosts is the router, which `packages/admin/src/navigation.tsx`'s `NavigationProvider` takes from each (Next's `useRouter` and `usePathname` in the server, wouter in the prototype). In the prototype, `design/prototypes/src/admin/shared.tsx` signs the page in through the transport as the toolbar's role, as someone would at `/login`, so the screens see a session as they do on a real server. Since D1 the shell and System › Status are shared; the rest of the admin moves in D2 and D3.

## 2026-11-05: the library and the work shared (one client platform, part D2)

Unchanged in substance. D2's screens are shared the same way: `@highsea-tv/mock`'s transport answers their routes in the contract's shapes (`packages/mock/src/admin/`), so the prototype's screens and the server's make the same calls.
