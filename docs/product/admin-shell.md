# Admin shell

- **Platforms:** Admin (`apps/server`), compact and regular windows.
- **Screen:** `packages/admin/src/shell.tsx` (the sidebar, the menu sheet, the palette, the status bar and `AdminPage`'s top row; the routes in `nav.ts`), hosted by `apps/server`'s Next app.
- **Prototype:** `#/admin` and every page under it (flow A1). The not-found page is at `#/admin/nowhere`.
- **Roadmap:** [Phase 2 › A1](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes), [Curation › Announcements](../roadmap.md#curation-highseacuration). Layout locked in [admin.md](../design-language/platforms/admin.md).

## Purpose

The frame every signed-in admin page sits in: where you are, how to get anywhere, whether the server is healthy, and what's happening in the background. It stays out of the way. Pages own the main area; the shell owns the sidebar, the command palette, the status bar, toasts and announcement banners.

## Entry points

- Every admin route except `/login` and `/setup`, which have no shell.
- ⌘K (Ctrl K on Windows and Linux) opens the palette from anywhere in the shell.

## Layout

- **Sidebar** ([admin.md › Sidebar](../design-language/platforms/admin.md#sidebar)):
  - the lockup at the top;
  - three nav groups separated by hairlines: Dashboard, Discover, Movies, Shows (stage 6, [shows.md](shows.md)), Wanted, Activity, Downloads · Indexers, Subtitles, Curation · Settings, System;
  - counts in mono `text-3` on Movies and Shows (each library's size) and Activity (the queue length);
  - the **server card** pinned to the bottom: a status dot, the server name, and "v{version} · {n} clients".
- **Main area:** an optional announcement banner stack, then the page. Each page starts with a `PageHeader` row: the title, the search trigger (with a ⌘K hint in a regular window), and the page's actions.
- **Status bar** (a labelled region, "Server status"), along the bottom of the main column:
  - left: the server name with a status dot, then the version and the connected clients (in a regular window);
  - for owners and admins: CPU, RAM and free disk (in a regular window);
  - right: running jobs and the next scheduled one, for example "No jobs running · Refresh monitored movies in 12 min".
- **Responsive:**

  By the form-factor rule ([spacing-layout.md](../design-language/spacing-layout.md#width-classes)); the icon rail between 600 and 1023 went with the old breakpoints in part D (D1 of [one-client-platform-d.md](../plans/one-client-platform-d.md)).

  | Window | Sidebar | Top row |
  | --- | --- | --- |
  | regular (≥ 768) | Full, 216px | Title, search, actions |
  | compact (< 768) | Hidden; a **Menu** button in the top row opens it as a left sheet | Menu, title, search (icon only), actions wrapping below |

### Work in hand on an item (HT-106, 2026-11-19)

The owner's note: refreshing metadata, and other jobs that touch media, need a mark on the item itself, on its page and in the library. One part draws it in three places (`ItemWorkMark` and `WithItemWork` in `packages/admin/src/item-work.tsx`):

- **An item's page** (a film, a show, an artist, an album): beside the actions, a small spinner in `text-2` and one line of plain words: "Refreshing metadata", "Refreshing metadata, 40%" while a job says how far it is, "Searching for subtitles, for an episode" on a show's page when the work is on one of its episodes, "Refreshing metadata, waiting to start", "Refreshing metadata: trying again in 2m" after a failed try, and "2 tasks running" when more than one kind is in hand. Nothing is drawn when nothing is in hand. The line is a polite live region; it announces the words once, not each percent.
- **The action that started the job is off while it runs:** Refresh metadata (in More on a film's and a show's page, the button on an artist's and an album's) and a film's **Search**.
- **When a job the page saw ends:** a failure is an error toast, "Refreshing metadata didn't finish", with the server's reason under it; a success is a short toast ("Metadata refreshed for Tears of Steel"). What finished before the page was opened isn't toasted.
- **A card** (Movies', Shows' and Music's grids, a collection's row in Collections): a spinner on the posters' glass at the art's top right, over the art, the words in a tooltip on hover or focus (the mark is a focus stop, an image named by the words).
- **A table row** (Movies', Shows', Music's artists and albums): the same spinner over the title's thumbnail, centred on it.
- The card's and the row's marks are drawn over what's there, so nothing moves as work comes and goes. They come within a second or two of the job being queued and go by themselves, following `jobs.updated`.
- **Which jobs:** metadata refresh of a film or a show, artwork for a film, show or album, a film's release search, subtitle search, download, sync and re-sync of an episode's or a film's file, the subtitle check of an item, and an import into a film or an episode. Not marked: whole-library sweeps (scans, the wanted sweeps, read-ahead, trickplay, imports from other apps), a person's or a TMDB collection's refresh, an artist's artwork, a held film waiting for its date, and a show's release search (not built yet). Music's jobs are marked through the mock until the server's music routes are built.

## States

- **Populated:** live counts, server card and status bar, updated from the event stream and the mock clock.
- **Loading:** the server card reads "Connecting… · Looking for the server"; the status bar reads "Connecting…".
- **Error (server unreachable):** the server card reads "Not connected · Retrying every few seconds" with the offline dot; so does the status bar.
- **Degraded:** the server card's dot turns to degraded when any health check is at error level.
- **Refusal (users):** a user who signs in to the admin gets this page at every admin address, instead of the shell: "This is where the server's owner and admins run it. To watch, use a highsea app." with **Sign out**. It's a server component and loads no admin data. Once the web client exists (Phase 4), it links there. An open admin whose person is made a User reloads into it.
- **Not found:** "There's nothing at this address" with **Go to the dashboard**.
- **Empty:** not applicable; the shell has no content of its own.

## Interactions

- **Navigation:** sidebar items are links (middle-click and ⌘-click open new tabs). In the compact sheet, choosing one closes the sheet. Each page change scrolls the main area to the top.
- **Tabs in the address** (prototype-gaps.md, stage 5): a page's tabs are part of its address, so a tab can be linked, reloaded and reached with Back. The first tab is the page's own address (`/activity`), the rest a segment after it (`/activity/history`, `/movies/1/files`); one the page doesn't have draws not found. This holds for Activity, Now playing, Indexers, Subtitles, Wanted, System, a movie's page, a show's page (`/shows/{id}/files`) and Discover's Shows (`/discover/shows`).
- **Skip to content:** the first Tab stop is a "Skip to content" link that moves focus to the main area.
- **Command palette** (⌘K, or the search trigger):
  - **Go to:** every page, matched on label and keywords (for example "queue" finds Activity);
  - **Actions:** Add a movie; Customize the dashboard; Pause all downloads or Resume all downloads; Sign out;
  - **Movies:** every title as "Title (Year)", matched on genres too;
  - **On TMDB:** once something's typed, up to eight of Discover's results that aren't in the library, each opening the film's page, where it's added;
  - **Settings:** every Settings area matched on its name, the owner's alone left out for admins; Subtitles opens the Subtitles page;
  - the field says what it searches: "Search the library, TMDB, Settings and actions" (prototype-gaps.md, stage 5);
  - arrows move, Enter runs, Escape closes, and closing clears what was typed. Running an action toasts its result, for example "Downloads paused".
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
- `system.work()` → `GET /api/v1/system/work` (staff): every film, show, collection, artist and album with work in hand, each with its jobs (a show's carry its seasons' and episodes'), for a library's marks in one read. Refetched on `jobs.updated`.
- `system.itemWork({ kind, id })` → `GET /api/v1/system/work/{kind}/{id}` (staff): one item's active jobs and what finished on it in the last ten minutes, with the outcome and reason, for its page. Refetched on `jobs.updated`; an item with nothing in hand answers empty lists.
- `auth.session()` → `GET /api/v1/auth/session`: who's signed in, for the account menu.
- Later, with their packages:
  - `movies.list()` and `queue.list()`, for the sidebar counts and the palette's titles, and `shows.list()` for Shows' count;
  - `announcements.active()` → `GET /api/v1/me/announcements`, for live announcements to this user with `seen`;
  - `announcements.dismiss(id)` → `POST /api/v1/me/announcements/{id}/seen`;
  - `downloads.pauseAll()` and `downloads.resumeAll()`, for the palette actions;
  - `movies.discover(query)`, for the palette's On TMDB.
- Events on the SSE stream (`GET /api/v1/events`): `server.updated`, `jobs.updated`, `users.updated`, `settings.updated`, `audit.updated`. Later ones: `item.updated`, `queue.updated`, `health.updated`, `announcements.updated`.

## Decisions

- ~~**The rail shows the mark alone.**~~ The rail went with the old breakpoints in part D: a regular window has the full sidebar, a compact one the menu sheet.
- **The status bar is a labelled region, not a footer,** so screen readers can jump to it by name ("Server status"). It's the library's `StatusBar` (`@highsea-tv/ui`), which gives it the region's role and name.
- **The admin has one shape** (owner's decision, 2026-10-20; [ADR 0032](../adr/0032-administrative-and-normal-access.md)). Only the owner and admins open it, so the members' shorter sidebar, palette and status bar are gone. Users use the clients and see the refusal page here.
- **The refusal page tells an outsider nothing** beyond what the sign-in page already does: that this is a highsea server.
- **The server card is degraded only at error-level health,** not warnings. Warnings belong to the System page, so the dot doesn't nag.
- **Health stays in two places**, the server card and the System page, as admin.md says. The status bar shows resources and jobs, not health.
- **Background toasts** are for things you'd otherwise miss: an import finishing. Routine progress stays in the queue.
- **A job names the item it works on** (HT-106): a `subject` on the job's row (`movie:603`, `episode:62085`, `season:1396:2`), with the show that holds a season or an episode in `subject_of`, so the whole library's work is one indexed read rather than each job's payload read again. Each job type says its subject when it's queued; a type that doesn't stays unmarked.
- **Banners render bold only.** The composer (A11) has the full markdown preview. A banner is a sentence or two.
- **The search trigger's ⌘K hint is hidden from its accessible name,** so the visible label matches what assistive tech reads.

## Open questions

- **Server branding in the sidebar.** admin.md says a branded server's name and mark lead the lockup. Should the sidebar show the server's mark too?
- **The status bar's place at compact.** It takes a row at 390px. Should it hide in a compact window, leaving the server card in the sheet? (As built, a compact window keeps the server's name and the jobs, and hides the rest.)
- **Palette recents.** Should the palette open on the last few pages and titles visited?
- **Sign out** is a palette action only. Should the server card open a menu with the account, Settings and Sign out?
