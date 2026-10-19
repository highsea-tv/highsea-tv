# @highsea/prototypes

The Phase 2 design prototypes: every admin and client flow, built with [`@highsea/ui-web`](../../packages/ui-web/README.md) against an in-browser mock server, so the owner can review the product before any of it is built for real. The plan is [phase-2-prototypes.md](../../docs/plans/phase-2-prototypes.md). Each flow has a written spec under [docs/product](../../docs/product/).

Nothing here ships. Phase 3 rebuilds these screens in `apps/server` against the real API, and the mock's types are the draft of that API.

## Run it

```sh
bun run prototypes          # from the repo root: Vite on http://localhost:4500
bun run --filter @highsea/prototypes build   # a static build in dist/
```

The build opens straight from disk: open `dist/index.html` in a browser, with no server. It's one classic script with the fonts inlined, because browsers refuse module scripts over `file://`.

## How it's put together

- **`index.html`** is the chrome: the launcher, the toolbar and a frame sized to the chosen width.
- **`index.html?screen`** is the product screen inside the frame. It can also be opened on its own.
- The chrome and the screen talk over `postMessage`. The chrome's hash follows the screen's route, so `#/admin/setup` is a link to that screen.

| Folder | Contents |
| --- | --- |
| `src/chrome/` | Launcher, toolbar, frame |
| `src/screen/` | The screen app: applies the toolbar state, holds the router |
| `src/admin/`, `src/web/`, `src/mobile/`, `src/tv/` | One route tree per platform; paths mirror the products (`#/admin/movies/1` is the server's `/movies/[id]`, by media id) |
| `src/client/` | What the three client apps share: their data calls, the connect flow, the player's state, formatting |
| `src/kit/` | Pieces the flows share that aren't in ui-web yet (the widget editor, the stepper, `useWidth`, the phone and TV frames) |
| `src/mock/` | The mock server, its seeds, clock and event stream, the metadata source (credits, trailers, collections, people) and the typed client the screens call |
| `src/flows.ts` | The flow registry the launcher lists: ids, routes, specs, test hints |

## The mock server

- **Two seeds.** `populated` is Harbor, a server a year into use, with about forty movies, a live queue, five indexers (one backing off) and a live announcement. `empty` is the same server just after setup.
- **Data states.** The toolbar can also hold every call in **Loading** or fail it with **Error**, so each screen's states can be reviewed.
- **A clock.** Downloads progress, finish, import and get subtitles on the mock clock. **Time** plays it at 1×, pauses it, or runs it at 10×.
- **Events.** Changes are pushed over an in-memory event stream that stands in for the server's SSE, so screens update live.
- **Roles.** **Server** switches between the owner and a member; the mock enforces the same permissions the server will.
- **Connection.** On the client platforms, **Connection** puts the app on the LAN, failed over to the server's remote address, or unable to reach it, so the connectivity states can be reviewed on any screen.
- **Persistence.** Saved layouts and setup progress live in `localStorage` under `highsea-proto:`. Clear site data to start fresh.

## URL parameters

The toolbar's state can be set from the URL, so a screen opens on its own at a known state:

```
index.html?screen&data=empty&theme=oled&role=member&motion=reduced&text=200&time=pause#/admin
```

| Parameter | Values |
| --- | --- |
| `data` | `populated`, `empty`, `loading`, `error` |
| `theme` | `default`, `oled`, `high-contrast`, `harbor` |
| `role` | `owner`, `member` |
| `motion` | `reduced` |
| `text` | `200` |
| `time` | `play`, `pause`, `fast` |
| `sound` | `on`, `off` |
| `connection` | `local`, `remote`, `offline` (clients: how the app reaches its server) |

**Text 200%** sets the root font size to 200%, which checks reflow inside components. It doesn't move media-query breakpoints, because browsers resolve `rem` in media queries against the default font size, not the root's. To check a real 200% text setting, raise the browser's own font size (Chrome: Settings › Appearance › Font size; Playwright: CDP `Page.setFontSizes`).

## Tests

```sh
bun test design/prototypes
```

- **`routes.test.tsx`** renders the key routes of each platform in all four data states (admin also as a member) and runs axe on each.
- **`flows.test.tsx`** walks each checkpoint's flows as a user would (by keyboard where it matters) and runs axe at each step.
- **`pipeline.test.tsx`** walks the movie pipeline screens (A4–A10): adding a movie through to available, the media pages (a title before and after adding, trailers, collections, people), bulk edits, interactive search, subtitle sync, the queue's fixes, torrents, indexers and subtitle settings.
- **`clients.test.tsx`** walks the client flows (C1–C5) on web, mobile and TV: connecting and signing in, the connection states, acknowledging an announcement, the two web homes, the library, the item page and the player's tracks and subtitle nudge. The TV's D-pad moves need real layout, so they're walked in a browser before each checkpoint.
- **`mock.test.ts`** covers the mock server: the download pipeline on the clock, the data states, permissions, sign-in and dashboard layouts.
- Every class the tests render is checked against the compiled stylesheet, so a typo'd or non-token utility fails the run.

Color contrast is left out of the happy-dom axe runs, which can't compute it. It's checked in a real browser in all three themes before each checkpoint.
