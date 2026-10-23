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

`server.ts` boots its own development server on port 3150 under the Node in `.nvmrc` (it stops first if `node` is another version), with throwaway folders. It sweeps setup step by step, then finishes setup and adds people, an API key, a custom theme and a waiting TV through the API, then grabs two releases from the fake indexer (blocklisting one), adds a magnet by hand and leaves a stray file for manual import. For subtitles (checkpoint 7a) it signs OpenSubtitles.com and Subdl in against their fakes (`HIGHSEA_SUBTITLES_FAKE=1`), and imports Sintel and Nosferatu from generated clips, Sintel with an English sidecar, so A6's Subtitles tab and A10's Wanted list have something to show. The server runs with `HIGHSEA_TORRENT_OFFLINE=1`, so the torrent engine opens no sockets: grabs join the queue as Queued, and nothing downloads or reaches the network. Then it checks every admin page signed out and signed in, the same way as `pages.ts` and `keyboard.ts`. It also counts React's `console.error` warnings (hydration mismatches, for one) as problems. `SWEEP_PORT` moves it, and `SWEEP_SHOTS=<folder>` also saves each page in the default theme at each width. The first run is slow, because Next compiles each page the first time it's opened.

- **localhost:** it browses `localhost`, because Next's dev server serves its dev scripts to that origin only.
- **One browser context per page:** a signed-in page holds the event stream open, and Chromium allows six HTTP/1.1 connections per host.
- **No `networkidle`:** for the same reason it never arrives. A page counts as ready once React has hydrated it and nothing is `aria-busy`.

- `pages.ts` runs every route at its platform's widths in three themes, every data state, 200% text and reduced motion. Narrow it with a platform and one query, e.g. `bun scripts/sweeps/pages.ts web text=200`.
- `SWEEP_BASE` points at another server; `CHROMIUM_PATH` at another Chromium.
- Each exits non-zero with a line per problem.

Known false alarm: a toast caught mid-fade fails contrast. `pages.ts` waits for animations to finish before running axe to avoid it.

Known false alarm in `server.ts`: a page that calls `notFound()` (an admin page refused to a User, or a path that doesn't exist) can throw "Failed to execute 'measure' on 'Performance': … cannot have a negative time stamp" in development, and Next's dev overlay (`nextjs-portal`) then shows up as a keyboard stop. It's React's development-only performance tracks, an open upstream bug ([vercel/next.js#86060](https://github.com/vercel/next.js/issues/86060)); production builds don't have it.
