# Activity and Downloads

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/activity` (A7), `#/admin/downloads` (A8).
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
- **Blocklist:** movie (release name under it), indexer, reason, when, **Unblock** (staff).

### Downloads (A8)

- `PageHeader`: "Downloads"; **Limits**, **Pause all**, **Resume all**, **Add torrent**.
- **VPN line**, always first: a shield and "Bound to wg0", the exit address, and the current limits. When the tunnel is down it turns to a warning: "wg0 is down · Torrents are stopped until the tunnel is back."
- A `TableFrame`. Toolbar: state tabs with counts (All, Active, Seeding, Paused, Needs attention), a category select, and total ↓ and ↑. Columns: name (category and source under it), size, progress, ↓, ↑, seeds/peers, ratio, status.
- **Torrent sheet** (right, 40rem): the name and state; Pause or Resume, **Open the movie** (library torrents), **Remove**; the state reason if any; tabs:
  - **General:** progress, speed, time left, seeds, peers, uploaded and ratio, added, save path, info hash (mono, wraps);
  - **Files:** each file with size, a priority select (High, Normal, Don't download) and its own progress;
  - **Trackers:** URL, status (Working, Updating, Not responding), peers, message;
  - **Seeding:** the rule in a sentence ("Seeds until it reaches a ratio of 2 or has seeded for 7d, whichever comes first").
- **Add torrent** dialog: magnet or .torrent URL (mono), category, **Start right away**.
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
- **Needs attention:**
  - **Stalled:** "No seeds for 2 hours. highsea will search for another release at 3 hours." · **Replace** now.
  - **Import blocked:** "The release contains an executable file (Nosferatu.exe). It wasn't imported, and it has been blocklisted." · **Find another**; the row menu also offers **Import without the blocked file**.
- **Permission-limited:** members see the queue, history and blocklist, without actions or Unblock. Downloads is staff-only: members get "Only owners and admins can open Downloads" with **Go to the dashboard**.

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
| VPN up | Bound to {interface} · All torrent traffic leaves through {ip}. If the tunnel drops, torrents stop. |
| VPN down | {interface} is down · Torrents are stopped until the tunnel is back. Nothing leaks onto your own connection. |
| Add dialog | Add a torrent · Manual torrents aren't imported into the library. Use Discover for movies. |
| Add error | That isn't a magnet link or a .torrent URL. |
| Limits dialog | Speed limits · For every torrent together. 0 means no limit. |
| Remove torrent | Remove this torrent? · It stops seeding. A movie already imported stays in the library. ☐ Also delete the downloaded data |
| Seeding tab | Seeds until it reaches a ratio of {r} or has seeded for {t}, whichever comes first. Then it stops; the library's copy stays. |

## Data

- `queue.list()` → `GET /api/v1/queue`: `QueueItem[]`, a torrent seen from its movie, with `stateReason` in plain words.
- `queue.pause|resume|remove(torrentId)`, `queue.forceImport(torrentId)`, `queue.searchAlternative(torrentId)` → `POST /api/v1/queue/{id}/{action}`, `DELETE /api/v1/queue/{id}`.
- `history.list()` → `GET /api/v1/history`; `blocklist.list()`, `blocklist.remove(id)` → `/api/v1/blocklist`.
- `downloads.list()`, `downloads.get(id)` → `GET /api/v1/torrents[/{id}]` (staff): `Torrent` with `files`, `trackers`, `seedingRule`.
- `downloads.add(AddTorrentInput)`, `downloads.delete(id, deleteData)`, `downloads.pause|resume(id)`, `downloads.pauseAll()`, `downloads.resumeAll()`, `downloads.setFilePriority(id, path, priority)` → `/api/v1/torrents…`.
- `downloads.limits()`, `downloads.setLimits(patch)` → `GET|PATCH /api/v1/torrents/limits`: `TorrentLimits` includes the VPN binding (`vpnConnected`, `vpnInterface`, `vpnIp`).
- Events: `queue.changed`, `torrents.updated`, `history.updated`, and `tick` for rates.

## Decisions

- **Two pages, one engine.** Activity speaks in movies and fixes; Downloads speaks in torrents. Members need the first, not the second.
- **The fix sits in the row.** A stalled or blocked row says why and offers the one action that resolves it; everything else stays in the menu.
- **Find another is one step:** blocklist and search together. Blocklisting without searching would leave the movie stuck.
- **The VPN line is always visible** on Downloads, not buried in settings, because a leak is the failure that matters most here. When the tunnel drops, the engine stops rather than falling back.
- **Seeding rules are read-only here.** They come from the indexer's settings (private trackers ask for more); editing them per torrent is left out.
- **The torrent detail is a sheet,** so the list stays in view and live.

## Open questions

- **Peers tab.** The roadmap lists peers in the torrent detail; the mock has counts only. Is a peer list (address, client, flags, rates) worth showing?
- **Categories.** Are categories user-defined (qBittorrent-style) or fixed per media type?
- **Per-torrent limits** and a scheduled "alternative speed" (night-time limits): in M1 or later?
- **Manual import (A17)** will hang off Activity; does a finished manual torrent offer "Import into the library" from its sheet?
