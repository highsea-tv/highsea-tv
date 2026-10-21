# Activity and Downloads

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/activity` (A7), `#/admin/downloads` (A8).
- **Built:** checkpoint 6a, 2026-10-20: `/activity` and `/downloads` in `apps/server` (`src/admin/activity.tsx`, `downloads.tsx`), on `@highsea/downloads` and `@highsea/torrent` ([ADR 0037](../adr/0037-the-torrent-engine-as-built.md), [ADR 0038](../adr/0038-downloads.md)). What real data changed from the prototype is marked *As built* below; categories, the watch folder and the rest of the engine's production features are 6b's.
- **Roadmap:** [Phase 2 › A7, A8](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Built-in torrent engine](../roadmap.md#built-in-torrent-engine-highseatorrent), [Movie pipeline](../roadmap.md#movie-pipeline), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes) (`/activity`, `/downloads`). Engine: [ADR 0005](../adr/0005-in-process-torrent-engine.md).

## Purpose

Two views of the same downloads, for two jobs. **Activity** is the library's view: which movie is coming, what went wrong and how to fix it, what happened, and what highsea won't grab again. **Downloads** is the torrent client: every torrent, including ones added by hand, with files, trackers, seeding rules, speed limits and the VPN binding.

## Entry points

- Sidebar: **Activity** (with the queue count, for everyone) and **Downloads** (staff).
- The dashboard's Queue widget ("N more in Activity").
- The add and grab toasts ("Follow it in Activity").
- ⌘K: Activity and Downloads under pages; **Pause all downloads** and **Resume all downloads** under actions (staff).
- A movie's In the queue card and history.

## Layout

### Activity (A7)

- `PageHeader`: "Activity", one line of description.
- Tabs (line): **Queue** (count), **History**, **Blocklist** (count).
- **Queue:** a `TableFrame`. Toolbar: filter tabs with counts (All, Downloading, Importing and seeding, Needs attention) and the total download rate. Columns: movie (title and year, release name under it), quality, size, progress, ↓, ETA, status, actions (staff). A row that needs attention (stalled, import blocked, error) shows its reason in plain words under the badge, and its fix as a button in the row.
- **History:** every event across the library: event (icon and label), movie, what happened (the release name under it), source (indexer or provider), when.
  - *As built:* history comes 50 events at a time, with **Show more** under the table; a failed download is an event of its own; each row carries the movie's title and year from the server. The prototype's **Clear** button is left out (the route exists, `DELETE /api/v1/history`).
- **Blocklist:** movie (release name under it), indexer, reason, when, **Unblock** (staff).
  - *As built:* an entry whose movie has left the library shows the release alone.

### Downloads (A8)

- `PageHeader`: "Downloads"; **Limits**, **Pause all**, **Resume all**, **Add torrent**.
- **VPN line**, always first: a shield and "Bound to wg0", the exit address, and the current limits. When the tunnel is down it turns to a warning: "wg0 is down · Torrents are stopped until the tunnel is back."
  - *As built* (from `vpn.status()`, [vpn.md](vpn.md)): "Through {provider} · {ip} ({country}) · Port {port}" when connected, "Exit address not checked yet" until the first check; "Connecting to {provider}…"; "{provider} is down" or "The VPN couldn't connect", with "Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection."; and with the VPN off, "No VPN · Torrents use your own connection. Anyone in the swarm can see your address." and **Set up a VPN**. The limits sit at the line's end.
- A `TableFrame`. Toolbar: state tabs with counts (All, Active, Seeding, Paused, Needs attention), a category select, and total ↓ and ↑. Columns: name (category and source under it), size, progress, ↓, ↑, seeds/peers, ratio, status.
  - *As built:* no category select in 6a; categories come with 6b (answer 5). Library grabs are `movies`, torrents added by hand `manual`.
- **Torrent sheet** (right, 40rem): the name and state; Pause or Resume, **Open the movie** (library torrents), **Remove**; the state reason if any; tabs:
  - **General:** progress, speed, time left, seeds, peers, uploaded and ratio, added, save path, info hash (mono, wraps);
  - **Files:** each file with size, a priority select (High, Normal, Don't download) and its own progress;
  - **Trackers:** URL, status (Working, Updating, Not responding), peers, message;
  - **Seeding:** the rule in a sentence ("Seeds until it reaches a ratio of 2 or has seeded for 7d, whichever comes first").
  - *As built:* General adds a **Swarm** row (Public, or "Private: trackers only, no DHT or peer exchange"); a tracker can be **Not contacted yet**; the seeding sentence carries a private tracker's minimum seed time; Files waits for the torrent's details from the swarm and says so.
- **Add torrent** dialog: magnet or .torrent URL (mono), category, **Start right away**.
  - *As built:* a link, or a `.torrent` file picked or dropped (sent as base64); no category in 6a.
- **Limits** dialog (`sm`): download and upload in MB/s; 0 is no limit.

## States

- **Loading:** row skeletons in each tab; the sheet opens from loaded data only.
- **Empty:**
  - Queue: "The queue is empty" · Movies show here while they download and import, then move to History.
  - History: "No history yet" · Every grab, import, rename and subtitle download is recorded here.
  - Blocklist: "Nothing is blocklisted" · Releases that fail, stall or carry something unsafe land here, so they're never grabbed again.
  - Downloads: "No torrents" · Releases highsea grabs for the library show here, with anything you add yourself. · **Add torrent**
  - A filter with no rows: "Nothing here right now." / "No torrents match."
- **Error:** "Couldn't load {the queue | the history | the blocklist | the torrent client}" with the server's message and **Try again**.
- **Live:** progress, rates, ETAs, seeds and peers tick in place; a torrent moves Queued → Downloading → Importing → Seeding; at most three download at once.
  - *As built:* state changes arrive over `queue.updated` and `torrents.updated`, at most once a second per torrent; A8's rates refresh every 2 seconds, since no event carries them. A torrent waiting for the VPN's binding (or the engine started offline) reads as **Queued**. At most three download at once by default (Settings › Download client).
- **Needs attention:**
  - **Stalled:** "No seeds for 2 hours. highsea will search for another release at 3 hours." · **Replace** now. At 3 hours highsea blocklists it and grabs the best other approved release on its own.
  - **Import blocked:** "The release contains an executable file (Nosferatu.exe). It wasn't downloaded, and it has been blocklisted." · **Find another**; the row menu also offers **Import without the blocked file**. *As built:* the engine checks a release's file list before anything downloads ([ADR 0038](../adr/0038-downloads.md)), so the copy says "wasn't downloaded"; the import checks again.
- **No reduced states.** Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md)); users get the refusal page.

## Interactions

- **Row actions (Activity):** Pause or Resume show on hover and focus (`RowActions`); the More menu always holds every action: Import without the blocked file (when blocked), Blocklist and search again, Remove from queue (asks first).
- **Find another / Replace** blocklists the release and grabs the best remaining one in one step, then toasts.
- **Unblock** removes the entry; the toast says highsea may grab it again.
- **Open a torrent:** its name is a button that opens the sheet. Escape closes it and returns focus to the name.
- **File priority** saves on change. **Don't download** leaves the file at 0%.
- **Add torrent** validates on Add: a magnet (`magnet:?xt=urn:btih:`) or an `http(s)` URL ending in `.torrent`.
- **Pause all** pauses downloads; seeding continues. **Resume all** queues them again.
- **Keyboard:** tabs, rows and menus are native or Radix controls; the sheet traps focus.
- **Sound:** none.

## Copy

| Where | Text |
| --- | --- |
| Activity description | What's downloading for the library, what happened, and the releases highsea won't grab again. |
| Find another toast | Blocklisted. Searching for another release · {Title} |
| Replace toast | Searching for a release with seeds · {release} is blocklisted. |
| Force import toast | Imported without the blocked file · {Title} |
| Remove from queue | Remove {Title}? · The download stops and its data is deleted. The movie stays in the library, still monitored. |
| Unblock toast | Removed from the blocklist · highsea may grab that release again. |
| VPN up | Through {provider} · {ip} ({country}) · Port {port} |
| VPN not checked yet | Through {provider} · Exit address not checked yet |
| VPN connecting | Connecting to {provider}… · Torrents wait until the tunnel is up. |
| VPN down | {provider} is down · Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection. |
| VPN failed | The VPN couldn't connect · Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection. |
| VPN off | No VPN · Torrents use your own connection. Anyone in the swarm can see your address. · Set up a VPN |
| Add dialog | Add a torrent · Manual torrents aren't imported into the library. Use Discover for movies. |
| Add error | That isn't a magnet link or a .torrent URL. (*As built:* any `http(s)` address passes the dialog, since an indexer's download link rarely ends in `.torrent`; the server has the last word.) |
| Limits dialog | Speed limits · For every torrent together. 0 means no limit. |
| Remove torrent | Remove this torrent? · It stops seeding. A movie already imported stays in the library. ☐ Also delete the downloaded data |
| Seeding tab | Seeds until it reaches a ratio of {r} or has seeded for {t}, whichever comes first. Then it stops; the library's copy stays. |

## Data

As built in 6a (`packages/api-contract/src/downloads.ts`). Every route is staff; the admin calls them through `@highsea/sdk`.

| Call | Route | What |
| --- | --- | --- |
| `queue.list()` | `GET /api/v1/queue` | `QueueItem[]`, newest first: a download seen from its movie, with `stateReason` in plain words |
| `queue.pause\|resume\|forceImport(id)` | `POST /api/v1/queue/{id}/{action}` | `id` is the queue row's (a download), which outlives its torrent |
| `queue.searchAlternative(id, { reason? })` | `POST /api/v1/queue/{id}/searchAlternative` | Blocklist the release and grab the best other approved one; history says so when there's none |
| `queue.remove(id, { deleteData, blocklist })` | `DELETE /api/v1/queue/{id}` | Remove a download, optionally with its data and onto the blocklist |
| `history.list({ cursor? })` | `GET /api/v1/history` | `HistoryPage`: 50 events with the movie's `title` and `year`, and `next` |
| `history.clear()` | `DELETE /api/v1/history` | Not offered in the admin yet |
| `blocklist.list()`, `blocklist.remove(id)` | `GET /api/v1/blocklist`, `DELETE /api/v1/blocklist/{id}` | `BlocklistEntry`, with the movie's `title` (null once it's left the library) and `year` |
| `downloads.list()`, `downloads.get(id)` | `GET /api/v1/torrents[/{id}]` | `Torrent` with `files`, `trackers`, `seedingRule` (`ratio`, `minutes`, `minMinutes`) and `private` |
| `downloads.add(AddTorrentInput)` | `POST /api/v1/torrents` | `urlOrMagnet` or `torrent` (base64), and `paused`; added under `manual` |
| `downloads.delete(id, { deleteData })` | `DELETE /api/v1/torrents/{id}` | |
| `downloads.pause\|resume(id)`, `pauseAll()`, `resumeAll()` | `POST /api/v1/torrents[/{id}]/{action}` | Pause all pauses downloads; seeding continues |
| `downloads.setFilePriority(id, { path, priority })` | `PATCH /api/v1/torrents/{id}/files` | `skip`, `normal` or `high` |
| `downloads.limits()`, `downloads.setLimits(patch)` | `GET\|PATCH /api/v1/torrents/limits` | `TorrentLimits`, bytes per second, 0 for none. The VPN line reads `vpn.status()` instead of fields here |
| `system.speeds()` | `GET /api/v1/system/speeds` | The last 10 minutes of rates, a sample a second (the Network widget) |

- **Events:** `queue.updated` (queue ids), `torrents.updated` (torrent ids), `history.updated` (history and the blocklist), `vpn.updated`; an import announces `item.updated`. `queue.updated`, not the prototype's `queue.changed`, like every other topic.

## Decisions

- **Two pages, one engine.** Activity speaks in movies and fixes; Downloads speaks in torrents.
- **The fix sits in the row.** A stalled or blocked row says why and offers the one action that resolves it; everything else stays in the menu.
- **Find another is one step:** blocklist and search together. Blocklisting without searching would leave the movie stuck.
- **The VPN line is always visible** on Downloads, not buried in settings, because a leak is the failure that matters most here. When the tunnel drops, the engine stops rather than falling back.
- **Seeding rules are read-only here.** They come from the indexer's settings (private trackers ask for more); editing them per torrent is left out.
- **The torrent detail is a sheet,** so the list stays in view and live.
- **Answered by the owner on 2026-10-20** ([checkpoint 6 › questions](../plans/phase-3-checkpoint-6.md#checkpoint-questions)):
  - **Categories:** `movies` is fixed for library grabs (later `shows`, `music`); the owner adds their own for manual torrents, each with a folder. Built in 6b; 6a has `movies` and `manual` (answer 5).
  - **Limits:** global only in milestone 1; per-torrent limits and a scheduled alternative speed later (answer 6).
  - **Import into the library:** a finished manual torrent offers it in the sheet's More menu, opening A17 on its folder (answer 7). It comes with 6b's categories; in 6a, A17 opens from Activity's **Manual import** and starts in the downloads folder.
- **Download client settings are the owner's** (the checkpoint's judgement call 13); A7 and A8 stay staff.

## Open questions

- **Peers tab.** The roadmap lists peers in the torrent detail; the mock has counts only. Is a peer list (address, client, flags, rates) worth showing?
