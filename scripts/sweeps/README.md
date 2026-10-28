# Browser sweeps

The checks run in a real browser before each checkpoint (docs/plans): what happy-dom can't measure (color contrast, layout overflow, focus indicators, D-pad movement).

```sh
bunx playwright-core install chromium      # once
bun scripts/sweeps/pages.ts [platform] [query]   # axe + overflow + page errors
bun scripts/sweeps/keyboard.ts [platform]  # Tab through every page; every stop shows focus
bun scripts/sweeps/dpad.ts                 # every TV focusable is reachable by arrows

bun scripts/sweeps/server.ts [pages|keyboard]    # the server's real admin pages (no prototypes needed)
bun scripts/sweeps/compare.ts [folder]           # every admin screen beside its prototype, for review
bun scripts/sweeps/playback.ts [chromium|firefox] # the web player in real browsers (also in CI)
```

`server.ts` builds the server (`next build` in `apps/server`) and boots the production build on port 3150, as the image runs it; `SWEEP_DEV=1` boots Next's development server instead and skips the build. It runs under the Node in `.nvmrc` (it stops first if `node` is another version), with throwaway folders. It sweeps setup step by step, then finishes setup and adds people, an API key, a custom theme and a waiting TV through the API, then grabs two releases from the fake indexer (blocklisting one), adds a magnet by hand and leaves a stray file for manual import. For subtitles (checkpoint 7a) it signs OpenSubtitles.com and Subdl in against their fakes (`HIGHSEA_SUBTITLES_FAKE=1`), and imports Sintel and Nosferatu from generated clips, Sintel with an English sidecar, so A6's Subtitles tab and A10's Wanted list have something to show. The server runs with `HIGHSEA_TORRENT_OFFLINE=1`, so the torrent engine opens no sockets: grabs join the queue as Queued, and nothing downloads or reaches the network. Then it checks every admin page signed out and signed in, the same way as `pages.ts` and `keyboard.ts`. It also counts React's `console.error` warnings (hydration mismatches, for one) as problems. `SWEEP_PORT` moves it, and `SWEEP_SHOTS=<folder>` also saves each page in the default theme at each width. With `SWEEP_DEV=1` the first run is slow, because Next compiles each page the first time it's opened.

`compare.ts` (checkpoint 9c) boots the same seeded server from the production build on port 3160 (`COMPARE_PORT`; `COMPARE_DEV=1` for the dev server) and starts the prototypes if nothing answers on :4500. For each row of checkpoint 9's review matrix it opens the prototype's state and the server's equivalent at 1440 and 390 in the default theme, opening the same tab or dialog on both sides, and saves both. The folder (a new temporary one unless given) gets the PNGs, `index.html` with each pair side by side, and `checklist.md` in the same order for the owner's review. A pair it couldn't open is listed at the end and in the checklist.

- **localhost:** it browses `localhost`, because Next's dev server serves its dev scripts to that origin only (it matters with `SWEEP_DEV=1`).
- **One browser context per page:** a signed-in page holds the event stream open, and Chromium allows six HTTP/1.1 connections per host.
- **No `networkidle`:** for the same reason it never arrives. A page counts as ready once React has hydrated it and nothing is `aria-busy`.

`playback.ts` (checkpoint 4.2b) builds the server and the web app, boots the same seeded server on port 3140 (`PLAYBACK_PORT`) and adds Big Buck Bunny as an MP4 remux of the seed's clip. Then, in Playwright's Chromium and Firefox (`bunx playwright-core install chromium firefox` once), it signs in on `/web`, plays Big Buck Bunny directly and Sintel's MKV as HLS, turns on Sintel's English subtitle and waits for a cue to be drawn, seeks to 8:00 and waits for it to play on, and leaves, checking the last report and the session's end and that the server kept the place. Autoplay is allowed by each browser's documented switch, since the run opens the player by its address rather than by pressing Play. It takes about 10 seconds a browser after the builds and the seed. CI runs it on every push; Safari is tried by hand at each review.

- **The prototypes' sweeps serve their own build.** `pages.ts`, `keyboard.ts` and `dpad.ts` build the prototypes into a temporary folder and serve it with `vite preview` on :4510 (`SWEEP_PROTOTYPES_PORT`), so nothing needs starting first. A build loads each page about three times faster than the dev server's unbundled modules. `SWEEP_BASE=http://localhost:4500` sweeps a running `bun run prototypes` instead.
- **No fixed waits.** A page counts as loaded once its DOM has been still for 400 ms (`settle` in `lib.ts`), longer than the mock's 180 ms a call, and 1.5 s at most. The announcement is gone once Radix has removed it. Pages run as many at once as the machine has cores, less two (`WORKERS`, 2 to 12). On a 12-core Mac the three take about 5½ minutes together (pages about 4½, keyboard 1, D-pad 10 seconds); they took 40 before.
- `pages.ts` runs every route at its platform's widths in three themes, every data state, 200% text and reduced motion. Narrow it with a platform and one query, e.g. `bun scripts/sweeps/pages.ts web text=200`. `keyboard.ts` takes a platform too.
- **Sweep what changed.** For a fix between checkpoints, run the sweeps for the platform it touched (`pages.ts web`, `keyboard.ts web`); `dpad.ts` only when TV screens changed; `server.ts` only when the admin, `/web` or the server changed. Every sweep runs before a checkpoint report.
- `SWEEP_BASE` points at another server; `CHROMIUM_PATH` at another Chromium.
- Each exits non-zero with a line per problem.

Known false alarm: a toast caught mid-fade fails contrast. `pages.ts` waits for animations to finish before running axe to avoid it.

Known false alarm in `server.ts` with `SWEEP_DEV=1`: a page that calls `notFound()` (an admin page refused to a User, or a path that doesn't exist) can throw "Failed to execute 'measure' on 'Performance': … cannot have a negative time stamp" in development, and Next's dev overlay (`nextjs-portal`) then shows up as a keyboard stop. It's React's development-only performance tracks, an open upstream bug ([vercel/next.js#86060](https://github.com/vercel/next.js/issues/86060)); production builds don't have it.
