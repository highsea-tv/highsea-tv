# Admin shell

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin` and every page under it (flow A1). The not-found page is at `#/admin/nowhere`.
- **Roadmap:** [Phase 2 › A1](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes), [Curation › Announcements](../roadmap.md#curation-highseacuration). Layout locked in [admin.md](../design-language/platforms/admin.md).

## Purpose

The frame every signed-in admin page sits in: where you are, how to get anywhere, whether the server is healthy, and what's happening in the background. It stays out of the way. Pages own the main area; the shell owns the sidebar, the command palette, the status bar, toasts and announcement banners.

## Entry points

- Every admin route except `/login` and `/setup`, which have no shell.
- ⌘K (Ctrl K on Windows and Linux) opens the palette from anywhere in the shell.

## Layout

- **Sidebar** ([admin.md › Sidebar](../design-language/platforms/admin.md#sidebar)):
  - the lockup at the top, or the mark alone in the rail;
  - three nav groups separated by hairlines: Dashboard, Discover, Movies, Wanted, Activity, Downloads · Indexers, Subtitles, Curation · Settings, System;
  - counts in mono `text-3` on Movies (the library size) and Activity (the queue length);
  - the **server card** pinned to the bottom: a status dot, the server name, and "v{version} · {n} clients".
- **Main area:** an optional announcement banner stack, then the page. Each page starts with a `PageHeader` row: the title, the search trigger (with a ⌘K hint at medium and up), and the page's actions.
- **Status bar** (a labelled region, "Server status"), along the bottom of the main column:
  - left: the server name with a status dot, the version and the connected clients (medium and up);
  - for owners and admins: CPU, RAM and free disk (expanded and up);
  - right: running jobs and the next scheduled one, for example "No jobs running · Refresh monitored movies in 12 min".
- **Responsive:**

  | Breakpoint | Sidebar | Top row |
  | --- | --- | --- |
  | expanded and wide (≥ 1024) | Full, 216px | Title, search, actions |
  | medium (600–1023) | 64px icon rail with tooltips; the mark replaces the lockup | Title, search, actions |
  | compact (< 600) | Hidden; a **Menu** button in the top row opens it as a left sheet | Menu, title, search (icon only), actions wrapping below |

## States

- **Populated:** live counts, server card and status bar, updated from the event stream and the mock clock.
- **Loading:** the server card reads "Connecting… · Looking for the server"; the status bar reads "Connecting…".
- **Error (server unreachable):** the server card reads "Not connected · Retrying every few seconds" with the offline dot; so does the status bar.
- **Degraded:** the server card's dot turns to degraded when any health check is at error level (owners and admins only).
- **Permission-limited (members):**
  - the sidebar shows only Dashboard, Discover, Movies and Activity; the palette offers the same pages and no download actions;
  - the status bar leaves out CPU, RAM and disk;
  - opening a staff page directly shows "Only owners and admins can open {page}" · "Ask the server's owner if you need access." · **Go to the dashboard**.
- **Not found:** "There's nothing at this address" with **Go to the dashboard**.
- **Empty:** not applicable; the shell has no content of its own.

## Interactions

- **Navigation:** sidebar items are links (middle-click and ⌘-click open new tabs). In the compact sheet, choosing one closes the sheet. Each page change scrolls the main area to the top.
- **Skip to content:** the first Tab stop is a "Skip to content" link that moves focus to the main area.
- **Command palette** (⌘K, or the search trigger):
  - **Go to:** every page this role can open, matched on label and keywords (for example "queue" finds Activity);
  - **Actions:** Add a movie; Customize the dashboard; Pause all downloads or Resume all downloads (owners and admins); Sign out;
  - **Movies:** every title as "Title (Year)", matched on genres too;
  - arrows move, Enter runs, Escape closes. Running an action toasts its result, for example "Downloads paused".
- **Toasts** for background events, wherever you are in the admin: "{Movie} is in the library · Imported and seeding. Subtitles are next."
- **Announcement banners:** live announcements placed as a banner, stacked above the page. Critical ones use the danger tone, warnings the warning tone, the rest the announcement tone. Dismissable ones have a close button; "require acknowledgement" ones have **Got it**. Either one marks it seen for this user, on every device.
- **Sound:** off by default in the admin ([sound › defaults](../design-language/sound.md#defaults)). When it's on, the shell plays nothing of its own in Checkpoint 1.
- **Touch:** the compact sheet and every nav target work by tap; nothing depends on hover. Tooltips in the rail also show on focus.

## Copy

| Where | Text |
| --- | --- |
| Skip link | Skip to content |
| Compact menu button | Menu (icon only, labelled) |
| Search trigger | Search library, TMDB, actions |
| Server card, loading | Connecting… · Looking for the server |
| Server card, offline | Not connected · Retrying every few seconds |
| Status bar, idle | No jobs running |
| Status bar, busy | 2 jobs running · {next job} in 12 min |
| No access | Only owners and admins can open {page} · Ask the server's owner if you need access. · Go to the dashboard |
| Not found | There's nothing at this address · Go to the dashboard |
| Import toast | {Movie} is in the library · Imported and seeding. Subtitles are next. |
| Pause toast | Downloads paused · Seeding continues. Resume them from here or Downloads. |
| Pause error | Couldn't pause downloads |
| Resume toast | Downloads resumed |
| Page titles | {Page} · highsea |

## Data

- `system.server()` → `GET /api/v1/system/server`: name, version, branding, `clientsConnected`. Refetched on `server.updated`.
- `system.status()` → `GET /api/v1/system/status` (owners and admins): CPU, memory, disks. Refetched every few seconds; the server has no `tick` event.
- `system.jobs()` → `GET /api/v1/system/jobs`: `{ name, state, nextRun }[]`. Refetched on `jobs.updated`.
- `system.healthChecks()` → `GET /api/v1/system/health` (owners and admins), for the server card's dot. Refetched on `server.updated`.
- `auth.session()` → `GET /api/v1/auth/session`: who's signed in, for the account menu.
- Later, with their packages:
  - `movies.list()` and `queue.list()`, for the sidebar counts and the palette's titles;
  - `announcements.active()` → `GET /api/v1/me/announcements`, for live announcements to this user with `seen`;
  - `announcements.dismiss(id)` → `POST /api/v1/me/announcements/{id}/seen`;
  - `downloads.pauseAll()` and `downloads.resumeAll()`, for the palette actions.
- Events on the SSE stream (`GET /api/v1/events`): `server.updated`, `jobs.updated`, `users.updated`, `settings.updated`, `audit.updated`. Later ones: `item.updated`, `queue.changed`, `health.updated`, `announcements.updated`.

## Decisions

- **The rail shows the mark alone.** The lockup needs 96px and the rail is 64px.
- **The status bar is a labelled region, not a footer,** so screen readers can jump to it by name ("Server status"). This was a fix in ui-web's `StatusBar`.
- **Members get a shorter sidebar** rather than locked items: they manage the library, not the server, and locked items would only be noise. A direct link still explains why it's closed.
- **The server card is degraded only at error-level health,** not warnings. Warnings belong to the System page, so the dot doesn't nag.
- **Health stays in two places**, the server card and the System page, as admin.md says. The status bar shows resources and jobs, not health.
- **Background toasts** are for things you'd otherwise miss: an import finishing. Routine progress stays in the queue.
- **Banners render bold only.** The composer (A11) has the full markdown preview. A banner is a sentence or two.
- **The search trigger's ⌘K hint is hidden from its accessible name,** so the visible label matches what assistive tech reads.

## Open questions

- **Server branding in the sidebar.** admin.md says a branded server's name and mark lead the lockup. Should the rail show the server's mark too?
- **The status bar's place at compact.** It takes a row at 390px. Should it hide below medium, leaving the server card in the sheet?
- **Palette recents.** Should the palette open on the last few pages and titles visited?
- **Sign out** is a palette action only. Should the server card open a menu with the account, Settings and Sign out?
