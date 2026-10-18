# Phase 2 plan: design prototypes

- **Status:** Ready to start. Phase 1 (design system v1.0) was signed off on 2026-10-16 (commit 943c1f5).
- **Gate:** the owner signs off on the prototypes. They then become the build reference for Phase 3 (server) and Phase 4 (clients).
- **Source:** the Phase 2 section of the [roadmap](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off). This plan turns that section into steps.

## Read first

1. [`docs/roadmap.md`](../roadmap.md): Phase 2, then the Phase 3 sections that the prototypes must cover (admin routes, subtitles, curation, personalization, connectivity, and the gap analysis items tagged **[M1]**).
2. [`docs/brand/direction.md`](../brand/direction.md): the locked layouts, motion and sound.
3. [`docs/design-language/`](../design-language/README.md), especially:
   - [`platforms/`](../design-language/platforms/): admin, desktop-web, mobile and tv;
   - [`accessibility.md`](../design-language/accessibility.md).
4. The READMEs of [`packages/tokens`](../../packages/tokens/README.md), [`packages/ui-web`](../../packages/ui-web/README.md) and [`apps/storybook`](../../apps/storybook/README.md).
5. The reference board, `design/explorations/a2-abyss-neutral.html` (`bun run explorations`). It is the visual source for the TV home, the phone home and the admin dashboard.

Run `bun run storybook` to see every existing component before building anything new.

## Standing rules

These come from the owner and apply to every step:

- **Gated phases.** Phase 3 starts only after the owner signs off on Phase 2. Within Phase 2, stop at each checkpoint below and ask for review.
- **Everything stays in the repo.** Docs, specs and prototypes live here. Never publish them as hosted artifacts or pages.
- **Git:**
  - commit only when asked; never push;
  - no attribution or co-author lines in commit messages;
  - match the style of earlier commits: an imperative subject, then a bulleted body.
- **SPDX header on every source file:** `// SPDX-License-Identifier: AGPL-3.0-only`, or `/* … */` in CSS.
- **Unknowns:** use your best judgement, and list each judgement call in the checkpoint report so the owner can overturn it.
- **Design system v1.0 is locked.**
  - Additive changes are fine: new components, new props, bug fixes in `ui-web`.
  - Changing a token value, a design-language rule or a locked layout needs the owner's approval. Propose the change with its reason; don't just make it.

## Goal

A clickable prototype app at `design/prototypes`, built on the **real** `@highsea/tokens` and `@highsea/ui-web` with SDK-shaped mock data, covering:

- every server admin screen that milestone 1 ships;
- the client flows on desktop/web, mobile and TV.

Each flow also gets a written spec in `docs/product/`.

A prototype is a **reference**, not product code. Hold it to the design bar (real states, real copy, keyboard and D-pad complete, accessible), but not the engineering bar. There is no real networking or persistence beyond `localStorage`.

## Exit criteria

1. `bun run prototypes` starts the app. `bun run --filter @highsea/prototypes build` produces a static build.
2. Every flow listed below is clickable end to end on its platforms. Each one covers these states:
   - empty;
   - loading (skeletons);
   - error;
   - populated;
   - where it applies, the live state (progress ticking).
3. Every flow passes these checks:
   - keyboard only;
   - D-pad (TV);
   - reduced motion;
   - 200% text;
   - axe, clean in all three themes;
   - no horizontal overflow at the platform's widths.
4. Each flow has a spec in `docs/product/`, using the template below.
5. Any component promoted to `ui-web` has a story, tests, and a line in the ui-web README.
6. The owner signs off. Record the sign-off in the roadmap, as was done for Phase 1.

## Architecture

### The app

| Item | Decision |
| --- | --- |
| Location | `design/prototypes` |
| Package | `@highsea/prototypes`, private. The root workspaces already include `design/*` |
| Stack | Vite 8 + React 19 + `@tailwindcss/vite` 4.3 + `motion`. Pin the same exact versions as `apps/storybook` (vite 8.3.4, react 19.3.1, @vitejs/plugin-react 6.1.2, tailwindcss 4.3.3, motion 14.3.0) |
| Styles | `src/prototypes.css` imports `@highsea/ui-web/styles.css`. Add `@source` for local folders only if Tailwind misses them |
| Router | Hash routing, so the static build opens from disk. Recommended: `wouter` with its hash location; it is small. Pin an exact version at least two weeks old (check with `npm view wouter time`). A ~50-line in-house hash router is an acceptable alternative if you prefer no dependency |
| Root script | Add `"prototypes": "bun run --filter @highsea/prototypes dev"` to the root `package.json` |
| tsconfig | Extend `@highsea/config`, as `apps/storybook/tsconfig.json` does, and add a `typecheck` script so the root `bun run typecheck` covers the app |

**Route paths mirror the products.** Phase 3 builds from these, so the paths should match what will ship:

- admin routes: `#/admin/movies/sintel`, mirroring `/movies/[id]` in the roadmap's admin routes;
- client routes: `#/web/...`, `#/mobile/...` and `#/tv/...`.

### The frame and the toolbar

The app has a launcher, plus a persistent prototype toolbar. The toolbar stays visually distinct from product UI (a thin bar, mono labels). It holds:

| Control | Effect |
| --- | --- |
| Flow | Jump to any flow; the launcher page lists them all with a one-line description and its spec link |
| Platform | **Admin**, **Web/desktop**, **Mobile**, **TV**. See the frames below |
| Width | For Admin and Web: fluid, or a fixed 1440, 1024, 768 or 390px viewport, to check the responsive rules in [admin › responsive](../design-language/platforms/admin.md#responsive) |
| Theme | Abyss Neutral, OLED black, High contrast, and one custom theme. Sets `data-theme` |
| Data state | Populated, Empty, Loading, Error. Read through the mock server, so every screen honours it |
| Server | Owner, or member (restricted). Switches role, to show what members don't see |
| Reduced motion | Forces `MotionGlobalConfig` and a `data-reduced-motion` attribute, without changing the OS setting |
| Text 200% | Scales the root font size, to test reflow |
| Sound | On or off. Platform defaults: on for TV, off for admin |
| Simulated time | Play, pause, or 10× speed for the mock server's clock (downloads, jobs, announcements) |

Persist the toolbar state in `localStorage`, wrapped in `try/catch`.

**Frames:**

- **Admin and Web/desktop** render in the page at the chosen width.
- **Mobile** renders in a 390 × 844 frame with safe-area insets (status bar, home indicator), scaled to fit. Mobile is React Native in Phase 4, so build these screens with web primitives that approximate native behavior. Specifically:
  - pt ≈ px;
  - momentum scroll;
  - sheets for modals;
  - a bottom tab bar.

  Keep these mobile-only pieces in `src/kit/mobile/`. Don't put them in `ui-web`.
- **TV** renders on a 16:9 container with `container-type: inline-size` and `data-platform="tv"`, scaled to fit the window. Layout uses `cqw` screen units ([tv.md › units](../design-language/platforms/tv.md#units)). `useSpatialNavigation` runs on the frame. Clicking the frame focuses it (`tabIndex={-1}`, as `apps/storybook/src/tv/tv-home.stories.tsx` does). Escape is Back.

### Mock server (SDK-shaped)

The mock lives at `src/mock/`. It is an in-memory "server" behind an async client whose method names and shapes look like the future `@highsea/sdk`. Screens call the client only and never import fixtures directly. This way:

- the data-state toggle works everywhere;
- Phase 3 has a first draft of the API shapes.

Model what M1 needs:

| Area | Entities |
| --- | --- |
| Server | `Server` (id, name, version, branding, addresses, `local` or `remote` reachability), discovered servers on the LAN |
| Users | `User` (role, permissions), `Device` (client type, last seen, token, revocable), sessions |
| Media | `MediaItem` (the unified tree from [ADR 0012](../adr/0012-unified-media-item-model.md); movies only in M1, but keep the `type` field), `MediaFile` (with ffprobe-like streams), multiple versions per item (4K HDR + 1080p) |
| Acquisition | `QualityProfile`, `CustomFormat`, `Release` (search results with a decision and its reasons), `Torrent` (state, progress, rates, peers, ratio, files), `HistoryEvent`, `Blocklist` entry, `ImportList` |
| Indexers | `CatalogDefinition` (id, version, logo, privacy, language, categories, settings fields with help text), installed `Indexer` (health, backoff, stats) |
| Subtitles | `LanguageProfile`, `SubtitleTrack` (external, embedded or bundled; score; sync status, confidence and offset), provider configs, the wanted list |
| Curation | `Announcement` (placement, audience, schedule, acknowledgement), `FeaturedSection` (layout, source, overrides, schedule) |
| Personalization | `WidgetLayout` per user, plus role defaults; preferences layered as user → client type → device |
| System | Jobs and tasks, health checks, logs, backups, catalog version |

**Simulation.** A clock drives:

- torrents: download, then import, then the subtitle search and sync;
- jobs: RSS sync, refresh;
- health changes, such as an indexer backing off.

An event emitter stands in for SSE, so live screens update in place, as [admin › status and live data](../design-language/platforms/admin.md#status-and-live-data) requires.

**Fixtures** reuse `apps/storybook/src/fixtures/` (Blender open movies, generated art). Move those two files to a place both apps import, rather than copying them. A `@highsea/fixtures` package under `packages/`, or a `design/fixtures` workspace, both work; pick one and update Storybook's imports. Add enough items for density, about 40 movies with varied states, and keep the art generated, so the repo carries no third-party images.

### Components

- **Default:** build new pieces in `src/kit/`, out of `ui-web` primitives and token utilities only.
- **When to promote to `ui-web`:** when a piece is product-wide, or used by two or more flows. When you promote one, add:
  - a story;
  - behavior and axe tests;
  - a README entry.

Likely new pieces, roughly in the order the flows need them:

1. **Admin and shared:**
   - `Stepper` or wizard frame;
   - `PageHeader` (title, search with ⌘K hint, actions);
   - `EmptyState`;
   - `StatusBar` (designed here, from [admin › status and live data](../design-language/platforms/admin.md#status-and-live-data));
   - a sparkline or speed graph;
   - `Slider`;
   - `NumberInput` and unit inputs (sizes, rates, ratios);
   - `TagInput`;
   - `FileBrowser` or path picker;
   - `CodeBlock`;
   - a markdown editor with preview (announcements);
   - `Calendar` (month and agenda);
   - `DiffList` (rename preview);
   - `Avatar`;
   - `KeyValue`/`DefinitionList`.
2. **Widget editing:**
   - drag, resize and snap on `WidgetGrid`, with an "Add widget" panel;
   - keyboard-operable: move and resize with the arrow keys while a widget is grabbed;
   - prefer pointer events plus the existing `WidgetGrid` over a new dependency;
   - if you do use a library, `@dnd-kit/*` is the candidate. Check its accessibility story before adopting it.
3. **Clients:**
   - web top bar (translucent over the hero);
   - server switcher;
   - TV top tab row ([tv.md › global navigation](../design-language/platforms/tv.md#layout));
   - poster hover quick-actions (web: scale 1.04 plus an overlay);
   - row paging arrows;
   - mobile tab bar and featured carousel;
   - an announcement modal and card;
   - player chrome: scrubber with trickplay placeholder, track and subtitle pickers, a subtitle offset control;
   - `PinPad` for profile PINs is optional (a later feature).

### Tests and checks

Copy the patterns from `apps/storybook/test/` and `packages/ui-web/test/`:

- **`test/routes.test.tsx`:** renders every route in happy-dom for each platform and data state. Each render must produce elements and pass axe (WCAG 2.x A/AA tags; color-contrast is off in happy-dom).
- **The stylesheet check:** every class rendered must be a real utility, using `@tailwindcss/node` `compile()` and comparing output size one class at a time.
- **Mock server unit tests:** the simulation's state transitions, the decision-engine reasons, and the subtitle sync states.
- **Browser sweeps** (Playwright MCP, per checkpoint):
  - axe in all three themes;
  - a horizontal-overflow check at each platform's widths;
  - keyboard-only and D-pad walkthroughs of each flow;
  - screenshots for the checkpoint report, saved under `.playwright-mcp/` (gitignored).
- **Before each checkpoint:** `bun run typecheck && bun run lint && bun test` must pass.

### Known pitfalls from Phase 1

- **Tailwind theme reset.** The token theme removes Tailwind's defaults, so anything that depends on a theme variable silently produces no CSS:
  - `aspect-video`: use `aspect-[16/9]`;
  - `text-white`, `leading-tight`: use token roles.

  The stylesheet test catches these.
- **`text-*` utilities** set size, leading, weight and tracking only. Add `font-mono` and `uppercase` yourself where a text style needs them.
- **Dynamic class names** (`` `text-${x}` ``) are invisible to Tailwind's scanner. Use literal maps.
- **Grid and flex children** default to `min-width: auto`. Use `min-w-0`, and `grid-cols-1` (`minmax(0, 1fr)`), on anything containing a scroller.
- **`sr-only` inside a scroller:** an `overflow-x-auto` scroller must be `relative`, or absolutely positioned descendants widen the page.
- **Heights:** `h-full` doesn't resolve under a `min-height` parent. App shells use `h-screen` with a scrolling content column.
- **TV focus:** the spatial navigator listens on its root, so focus must be inside the root. `data-initial` marks where it starts.
- **axe in happy-dom:** import axe-core dynamically, after happy-dom registers its globals.
- **Biome** forbids `!important`. Raise specificity instead (for example, a doubled class).

## Flows

**Fidelity levels:**

- **Core:** fully clickable, with every state and the simulation where it applies.
- **Reference:** the layout and states for every section, with the main interactions clickable. Secondary controls may be inert, with a "not in prototype" tooltip.

### Server admin (platform: Admin; widths 1440 → 390)

| # | Flow | Fidelity | Notes |
| --- | --- | --- | --- |
| A1 | Shell | Core | Sidebar (full, rail, sheet), ⌘K palette (navigation, actions, titles), status bar, toasts, announcements rendered in admin (banner) |
| A2 | Setup wizard | Core | Server name, owner account, media folders (path picker, hardlink check), a starter indexer pack from the catalog, subtitle languages, remote access choice, optional highsea cloud link (off by default), done → dashboard |
| A3 | Dashboard | Core | The default widgets from [admin.md](../design-language/platforms/admin.md#main-area); Customize mode with drag, resize, add and remove, and keyboard operation; role defaults (owner) |
| A4 | Discover → add movie | Core | Search and trending (TMDB-like), add dialog (root folder, quality profile, subtitle language profile, monitored, minimum availability, search now) |
| A5 | Movies library | Core | Grid and table views, filters, bulk edit, multiple versions per item |
| A6 | Movie detail | Core | Overview, files (with streams), history, interactive search (releases with decision reasons, grab), **Subtitles tab** (tracks, embedded, manual search and pick, sync status and confidence, offset, re-sync) |
| A7 | Activity | Core | Queue (live; stalled, rejected-as-malicious and import-blocked states), history, blocklist |
| A8 | Downloads | Core | The torrent client: list, detail (files with priority, peers, trackers, per-tracker seeding rules), add magnet or file, categories, limits, the VPN binding indicator |
| A9 | Indexers | Core | Catalog browser (search, filters, privacy, language), one-click add for public indexers with the auto test, the generated form for private ones (inline "where to find this" help, test on save), installed list with health, backoff and stats, catalog version and changelog |
| A10 | Subtitles | Core | Wanted list; settings: providers, language profiles (ordered, forced and HI, cutoff), scoring threshold, sync options |
| A11 | Curation | Core | Announcement composer (markdown, image, CTA, severity, placement, audience, schedule, acknowledgement) and featured-section composer (layout, source rules, overrides), each with a **live client preview** that switches between TV, web and mobile |
| A12 | Appearance | Core | Theme editor (start from the Storybook theme editor), server default theme and branding (name, mark, accent) inherited by clients, sound settings |
| A13 | Users and devices | Core | Users, roles and permissions, library access, invite; devices with revoke; API keys |
| A14 | Wanted and calendar | Reference | Missing and cutoff unmet; calendar plus the iCal link |
| A15 | Settings | Reference | One page per area from the roadmap's `/settings/*`: media management (naming with preview, hardlinks, NFO, permissions), profiles and custom formats (with a TRaSH-style preset picker from the catalog), quality sizes, download client, connections and notifications (the channel list from the gap analysis), import lists, network and remote access (external URL, proxy headers, TLS, discovery), security (2FA, passkeys, OIDC), general, backups |
| A16 | System | Reference | Status, health checks, tasks and jobs, logs viewer, events, backups and restore, catalog version, updates |
| A17 | Manual import | Reference | File browser, matched items, rename preview, import |
| A18 | Login | Core | Local sign-in, 2FA step, OIDC button |

### Clients

| # | Flow | Platforms | Fidelity | Notes |
| --- | --- | --- | --- | --- |
| C1 | Connect to a server | Web, Mobile, TV | Core | LAN discovery list (live, appearing over time), add a remote server by URL, sign in, multi-server switcher, the failover state ("Connected remotely"), unreachable server, optional highsea cloud "find my servers". On TV, entering text is painful: design a sign-in by code or QR from a phone as the primary path, with on-screen keyboard entry as the fallback |
| C2 | Home | Web, Mobile, TV | Core | Featured sections (hero, row and spotlight layouts) and announcements (banner, modal, card; acknowledge-required). TV and mobile are locked layouts. **The web home is new design work**; see below |
| C3 | Library browse | Web, Mobile, TV | Core | Movies grid with sort and filter, alphabet jump on TV; other media types shown as tabs only if the owner's server has them (M1: Movies only) |
| C4 | Item detail | Web, Mobile, TV | Core | Hero, play or resume, versions picker, cast, related, subtitle and audio defaults |
| C5 | Player chrome | Web, Mobile, TV | Core | Over a still frame (no real video): scrubber with trickplay placeholder, skip-intro button (later feature, shown greyed or omitted; decide), audio and subtitle pickers, subtitle offset nudge (±50ms steps with a live preview line), quality and version info, TV remote mapping |
| C6 | Search | Web, Mobile, TV | Reference | Instant results; TV uses an on-screen keyboard grid |
| C7 | Settings | Web, Mobile, TV | Core | Themes (built-ins plus the server's default), sounds (on, off, volume, pack), home layout customization (reorder and hide rows), servers, devices, about |
| C8 | Profile and You tab | Mobile, Web | Reference | Account, servers, downloads (Offline), settings entry |

**New design work in Phase 2.** These items have constraints but no locked layout yet:

1. **The web/desktop home** ([desktop-web.md](../design-language/platforms/desktop-web.md)). Explore **two options** side by side in the prototype (for example, a full-bleed hero vs. a contained hero with a spotlight row) and let the owner pick at checkpoint 3. Record the choice in an ADR.
2. **TV global navigation:** the top tab row that appears on Up from the hero actions.
3. **Admin status bar.**
4. **Widget customize mode** interaction details.
5. **Player chrome** on all three platforms.
6. **TV sign-in:** by code or QR.

For each, record the decision in the flow's spec. Add an ADR if it changes a platform guide.

## Specs (`docs/product/`)

Write one file per flow area, for example `setup.md`, `dashboard.md`, `movies.md`, `activity-downloads.md`, `indexers.md`, `subtitles.md`, `curation.md`, `appearance.md`, `users-devices.md`, `settings.md`, `system.md`, `connectivity.md`, `client-home.md`, `client-library.md`, `player.md`, `client-settings.md`. The roadmap already links `connectivity.md`.

**Template:**

```md
# <Flow>

- **Platforms:** …
- **Prototype:** `#/…` (route)
- **Roadmap:** link to the section it implements

## Purpose
## Entry points
## Layout          (regions, responsive behavior per breakpoint or platform)
## States          (empty, loading, error, populated, live, permission-limited)
## Interactions    (pointer, keyboard, D-pad, touch; sounds played)
## Copy            (titles, empty-state and error text, in the brand voice)
## Data            (the mock client calls it uses; the draft API shapes)
## Decisions       (judgement calls, with the reason)
## Open questions
```

Copy follows the voice and tone in [brief.md § 6](../brand/brief.md#6-voice-and-tone): plain, calm and specific. No jargon in client apps, and no exclamation marks.

## Order of work and checkpoints

Stop at each checkpoint. Report what was built, the judgement calls, the screenshots and the check results, then ask for review before moving on. Don't commit unless the owner asks.

1. **Scaffold.**
   - Package, Vite, router, the shared fixtures move, the mock server with its clock and events, the frame and toolbar, the launcher.
   - The routes test and the stylesheet test running green on one placeholder route per platform.
2. **Checkpoint 1: admin core.**
   - Flows: A1 shell, A18 login, A2 setup, A3 dashboard with customize mode.
   - Specs: `setup.md` and `dashboard.md`.
3. **Checkpoint 2: the movie pipeline (admin).**
   - Flows: A4 → A5 → A6 → A7 → A8, driven by the simulation so a grabbed release downloads, imports and gets subtitles.
   - Also A9 indexers and A10 subtitles.
   - The specs for each.
4. **Checkpoint 3: clients.**
   - C1 connect, then C2 home on TV, mobile and the **two web options**, then C3, C4 and C5.
   - The owner picks the web home here.
5. **Checkpoint 4: owner tools and the rest.**
   - A11 curation (its live previews reuse the C2 home screens), A12 appearance, A13 users and devices.
   - The reference flows: A14–A17, C6–C8.
6. **Checkpoint 5: hardening.**
   - Full sweeps on every flow: axe in three themes, overflow, keyboard, D-pad, reduced motion, 200% text.
   - The custom icon glyphs: finalize the four drafts in `design/assets/icons` and add the glyphs the flows needed.
   - Update the roadmap and READMEs, then ask for the **Phase 2 sign-off**.

## Out of scope for Phase 2

- Real networking, the real SDK, the database, and the server.
- Real video playback.
- Native builds: React Native comes in Phase 4.
- Later media types beyond showing where they will plug in: TV, music, books, online video.
- Requests, Usenet, Live TV.
- Pixel-final art: the art stays generated.
