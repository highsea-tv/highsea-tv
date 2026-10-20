# Browser sweeps

The checks run in a real browser before each checkpoint (docs/plans): what happy-dom can't measure (color contrast, layout overflow, focus indicators, D-pad movement).

```sh
bun run prototypes                         # in one terminal: the prototypes on :4500
bunx playwright-core install chromium      # once
bun scripts/sweeps/pages.ts [platform] [query]   # axe + overflow + page errors
bun scripts/sweeps/keyboard.ts             # Tab through every page; every stop shows focus
bun scripts/sweeps/dpad.ts                 # every TV focusable is reachable by arrows
```

- `pages.ts` runs every route at its platform's widths in three themes, every data state, 200% text and reduced motion. Narrow it with a platform and one query, e.g. `bun scripts/sweeps/pages.ts web text=200`.
- `SWEEP_BASE` points at another server; `CHROMIUM_PATH` at another Chromium.
- Each exits non-zero with a line per problem.

Known false alarm: a toast caught mid-fade fails contrast. `pages.ts` waits for animations to finish before running axe to avoid it.
