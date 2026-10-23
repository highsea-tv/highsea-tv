---
name: port-screen
description: Port a signed-off prototype admin screen from design/prototypes into apps/server, swapping the mock client for the SDK, with its API contract, route, messages and tests. Use when building an admin page or dialog that has a prototype, or when adding an API route the admin needs.
argument-hint: "<prototype screen, e.g. admin/wanted>"
---

# Port a prototype screen into the admin

The prototypes are **locked**. The admin matches its prototype's layout, copy, states and interactions. Where real data forces a change, make the smallest change and list it in the checkpoint report.

## Read first

- The prototype: `design/prototypes/src/admin/<area>/`, and its mock server in `design/prototypes/src/mock/`, the first draft of the API.
- Its spec in `docs/product/`.
- The same area's existing pieces in `apps/server/src/admin/` and `apps/server/src/api/`, and any similar screen already ported. Copy their shape.
- `docs/plans/phase-3-server.md` § "Porting the prototype" and ADR 0018: the admin reads and writes **only through the public API**, never through Server Actions.

## The API first

1. **The contract:** declare routes and zod schemas in `packages/api-contract/src/<area>.ts`, taking the prototype's `mock/types.ts` shapes as the start. Set each route's access level (public, user, staff or owner; ADR 0032).
2. **The implementation:** `apps/server/src/api/<area>.ts`, calling the domain package. Domain packages never import the runtime or each other. The runtime hands them what they need (`ListLibrary`, `CurationLibrary` and so on).
3. **The client:** nothing to write. `@highsea-tv/sdk` builds `client.<group>.<route>()` from the contract's `routes`.
4. **The OpenAPI file:** `bun run openapi` in `apps/server`. A test fails while `openapi.json` is stale.
5. **The data**, when the work needs tables: change `packages/db/src/schema/`, then `bun run generate` in `packages/db`. Jobs must be safe to repeat (ADR 0022).
6. **Tests:** an API test in `apps/server/test/<area>-api.test.ts`. The guard table test (`access.test.ts`) calls every route in the contract as each kind of caller on its own. A new `user` route must also be added to its list by name, as a deliberate decision: nothing administrative is `user`.

## Then the screen

1. Copy the screen to `apps/server/src/admin/<area>.tsx`, and its route to `apps/server/app/(admin)/<area>/`.
2. Swap the mock client for `@highsea-tv/sdk/react`, keeping the hook shape: `useQuery(key, call, topics)` for reads, with the event topics that refresh it, and `useAction(call)` for writes.
3. **Strings** move into `apps/server/src/admin/<area>-messages.ts` with `defineMessages` from `@highsea-tv/i18n`, in the prototype's wording. Start the file with a comment naming the screen (for example `A14 Wanted`) and what real data changed in its copy. A literal `<` or `{` in a message needs ICU quoting, or the dialog fails with INVALID_TAG.
4. **Shared pieces** the prototype also uses move into a package (`ui-web`, `@highsea-tv/core` and so on) and the prototype imports them from there, so the two can't drift. `ui-web` client modules start with `'use client'`, above the SPDX header.
5. Mind the UI pitfalls in the Phase 2 plan: the Tailwind theme reset, literal class maps, and `min-w-0` with `grid-cols-[minmax(0,1fr)]` around scrollers.
6. **Tests:** a screen test in `apps/server/test/<area>-screen.test.tsx`, covering each data state the prototype has (loading, empty, error, full) and each action.

## Finish

- Compare the screen to the prototype side by side (`bun run prototypes` on :4500, and `bun run server` with `HIGHSEA_TMDB_REPLAY=1` and the fakes you need). Browse at `localhost`, not `127.0.0.1`.
- Add the page to the server sweep if it isn't picked up, and run `/checks`.
- Update its guide and screenshots (`/guide`).
- Note every forced change from the prototype for the checkpoint report.
