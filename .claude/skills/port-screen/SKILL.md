---
name: port-screen
description: Build a signed-off admin screen in packages/admin (the one file the prototype and apps/server both draw), with its API contract, the mock's answers, its route, messages and tests. Use when building an admin page or dialog that has a prototype, or when adding an API route the admin needs.
argument-hint: "<prototype screen, e.g. admin/wanted>"
---

# Port a prototype screen into the admin

The prototypes are **locked**. The admin matches its prototype's layout, copy, states and interactions. Where real data forces a change, make the smallest change and list it in the checkpoint report.

## Read first

- The prototype: since D3 of the one client platform the prototype has no admin screen of its own. `design/prototypes/src/admin/shared.tsx` draws `@highsea-tv/admin` (`packages/admin/src/`) for every admin address over `@highsea-tv/mock`'s transport, whose admin answers are in `packages/mock/src/admin/`, the first draft of the API. A new screen is drawn there first, against the mock, for the owner's approval.
- Its spec in `docs/product/`.
- The same area's existing pieces in `packages/admin/src/` and `apps/server/src/api/`, and any similar screen already ported. Copy their shape.
- `docs/plans/phase-3-server.md` § "Porting the prototype" and ADR 0018: the admin reads and writes **only through the public API**, never through Server Actions.

## The API first

1. **The contract:** declare routes and zod schemas in `packages/api-contract/src/<area>.ts`, taking the prototype's `mock/types.ts` shapes as the start. Set each route's access level (public, user, staff or owner; ADR 0032).
2. **The implementation:** `apps/server/src/api/<area>.ts`, calling the domain package. Domain packages never import the runtime or each other. The runtime hands them what they need (`ListLibrary`, `CurationLibrary` and so on).
3. **The client:** nothing to write. `@highsea-tv/sdk` builds `client.<group>.<route>()` from the contract's `routes`.
4. **The OpenAPI file:** `bun run openapi` in `apps/server`. A test fails while `openapi.json` is stale.
5. **The data**, when the work needs tables: change `packages/db/src/schema/`, then `bun run generate` in `packages/db`. Jobs must be safe to repeat (ADR 0022).
6. **Tests:** an API test in `apps/server/test/<area>-api.test.ts`. The guard table test (`access.test.ts`) calls every route in the contract as each kind of caller on its own. A new `user` route must also be added to its list by name, as a deliberate decision: nothing administrative is `user`.

## Then the screen

1. The screen is `packages/admin/src/<area>.tsx`, the one file the prototype and the server both draw; give it a route in `apps/server/app/(admin)/<area>/`.
2. It reads and writes through `@highsea-tv/sdk/react`, whichever transport is under it (the mock's in the prototype, the server's in the admin): `useQuery(key, call, topics)` for reads, with the event topics that refresh it, and `useAction(call)` for writes. Teach the mock the routes too (`packages/mock/src/admin/`), so the prototype keeps drawing it.
3. **Strings** move into `packages/admin/src/<area>-messages.ts` with `defineMessages` from `@highsea-tv/i18n`, in the prototype's wording. Start the file with a comment naming the screen (for example `A14 Wanted`) and what real data changed in its copy. A literal `<` or `{` in a message needs ICU quoting, or the dialog fails with INVALID_TAG.
4. **Draw with the library only:** `@highsea-tv/ui`'s React Native parts, laid out by the form-factor rule (`useRegularWindow`), every value from `@highsea-tv/tokens` (a measure only this screen uses goes in the admin's group in `controls.ts`). A part another screen could use goes into the library, not the screen. `bun run one-place` and `scripts/controls.ts` fail otherwise; there's no Tailwind in `apps/server`.
5. A web-only need (a file picker, a `title` the web keeps) is a library part's `.web` file, listed in `packages/ui/src/shared/parity.ts`, never a DOM element in the screen.
6. **Tests:** a screen test in `apps/server/test/<area>-screen.test.tsx`, covering each data state the prototype has (loading, empty, error, full) and each action.

## Finish

- Compare the screen to the prototype side by side (`bun run prototypes` on :4500, and `bun run server` with `HIGHSEA_TMDB_REPLAY=1` and the fakes you need), or with `bun scripts/sweeps/compare.ts` once its row is in the matrix. Browse at `localhost`, not `127.0.0.1`.
- Add the page to the server sweep if it isn't picked up, and run `/checks`.
- Update its guide and screenshots (`/guide`).
- Note every forced change from the prototype for the checkpoint report.
