# Browser sweeps

The checks run in a real browser before each checkpoint (docs/plans): what happy-dom can't measure (color contrast, layout overflow, focus indicators, D-pad movement).

```sh
bun run prototypes                         # in one terminal: the prototypes on :4500
bunx playwright-core install chromium      # once
bun scripts/sweeps/pages.ts [platform] [query]   # axe + overflow + page errors
bun scripts/sweeps/keyboard.ts             # Tab through every page; every stop shows focus
bun scripts/sweeps/dpad.ts                 # every TV focusable is reachable by arrows

bun scripts/sweeps/server.ts [pages|keyboard]    # the server's real admin pages (no prototypes needed)
```

`server.ts` boots its own development server on port 3150 under the Node in `.nvmrc` (it stops first if `node` is another version), with throwaway folders. It sweeps setup step by step, then finishes setup and adds people, an API key, a custom theme and a waiting TV through the API. Then it checks every admin page signed out and signed in, the same way as `pages.ts` and `keyboard.ts`. It also counts React's `console.error` warnings (hydration mismatches, for one) as problems. `SWEEP_PORT` moves it, and `SWEEP_SHOTS=<folder>` also saves each page in the default theme at each width. The first run is slow, because Next compiles each page the first time it's opened.

- **localhost:** it browses `localhost`, because Next's dev server serves its dev scripts to that origin only.
- **One browser context per page:** a signed-in page holds the event stream open, and Chromium allows six HTTP/1.1 connections per host.
- **No `networkidle`:** for the same reason it never arrives. A page counts as ready once React has hydrated it and nothing is `aria-busy`.

- `pages.ts` runs every route at its platform's widths in three themes, every data state, 200% text and reduced motion. Narrow it with a platform and one query, e.g. `bun scripts/sweeps/pages.ts web text=200`.
- `SWEEP_BASE` points at another server; `CHROMIUM_PATH` at another Chromium.
- Each exits non-zero with a line per problem.

Known false alarm: a toast caught mid-fade fails contrast. `pages.ts` waits for animations to finish before running axe to avoid it.
