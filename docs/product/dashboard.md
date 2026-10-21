# Dashboard

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin` (flow A3). Customize mode is part of the same route.
- **Roadmap:** [Phase 2 › A3](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Personalization › Widgets](../roadmap.md#personalization-highseapersonalization), [Admin UI routes › Dashboard](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes). Layout locked in [admin.md › Dashboard](../design-language/platforms/admin.md#dashboard-sidebar--widgets).

## Purpose

The first page after sign-in. It answers "is everything working, and what's happening right now?" at a glance: network and disk, indexer health, the subtitle backlog, what's coming out, and the live queue. Each person arranges it for themselves. Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md)), so only they have a dashboard. The owner chooses the starting layout for owners and admins.

## Entry points

- Sign-in (A18) and the end of setup (A2) land here.
- The sidebar's **Dashboard** item, the lockup, and **Go to the dashboard** on the not-found and no-access pages.
- The ⌘K palette: **Dashboard** under pages, and **Customize the dashboard** under actions (it navigates here and opens Customize).

## Layout

- **Top row** (`PageHeader`): the title "Dashboard", the search trigger (opens ⌘K), and **Customize**. In Customize mode the actions become **Add widget**, a **More layout options** menu, **Cancel** and **Done**, and a one-line description appears under the title.
- **Widget grid** (`WidgetEditor` from ui-web): 4 columns at expanded and wide, 2 at medium, 1 at compact, in rows of 84px with a 12px gap. Widgets flow in order; each one spans the columns and rows it's sized to (columns clamped to the columns available). There's no dense packing, so a short row can leave a gap: the visual order always matches the DOM and keyboard order.
- **Widgets** and their sizes: widths in columns and heights in rows, each a range the resize snaps within. The default size is width × height.

  | Widget | Width | Height | Default | Who sees it | Content |
  | --- | --- | --- | --- | --- | --- |
  | Network | 1–2 | 2–4 | 2 × 2 | Owners, admins | Down and up speeds, torrent rates, a sparkline of the last 10 minutes |
  | Storage | 1–4 | 2–4 | 1 × 2 | Owners, admins | Free of total, and a stacked bar of what uses the disk, with a legend |
  | Indexers | 1–4 | 2–6 | 1 × 2 | Owners, admins | "N of M healthy"; each row shows response time, or "retry in 4m" while backing off |
  | Subtitles | 1–4 | 2–3 | 1 × 2 | Owners, admins | Synced today and still waiting, a progress bar, and the average offset corrected |
  | Upcoming | 1–4 | 2–6 | 2 × 2 | Owners, admins | Monitored movies releasing in the next 14 days, with date badges, linked to the movie |
  | Announcement | 1–4 | 2–4 | 1 × 2 | Owners, admins | The live announcement, its audience, placements and end date |
  | Queue | 1–4 | 3–8 | 4 × 5 | Owners, admins | Filter tabs with counts (All, Downloading, Seeding, Issues) and the queue |
  | Recently added | 1–4 | 3–6 | 2 × 3 | Owners, admins | Posters of the newest imports; the count fits the width |
  | Calendar | 1–4 | 3–5 | 2 × 3 | Owners, admins | This month as a table, with release days marked and today highlighted |
  | System health | 1–4 | 2–4 | 1 × 2 | Owners, admins | Health checks with a badge per level |

- **Role defaults:** owners and admins start from Network (2 × 2), Storage, Indexers, Subtitles, Upcoming (2 × 2), Announcement, then the Queue (4 × 5). Each role's default can be saved apart.
- **Content that doesn't fit** the widget's height is cut at a whole row, with "{count} more in {page}" linking to the page with the rest.
- **Live since checkpoint 6a** (2026-10-20), with the `downloads` source:
  - **Network:** the download and upload rates now, over a sparkline of the last 10 minutes from `system.speeds()`, asked again every 2 seconds, since the rates have no event (the plan's `tick`). The ↓ caption counts active downloads ("2 downloads", "Nothing downloading"); while the VPN is down or failed it reads "Stopped while the VPN is down" (not in the prototype). The ↑ caption reads "seeding".
  - **Queue:** `queue.list()`, moving over `queue.updated` and `torrents.updated`; the filter tabs count with the same rules as Activity's.
  - **System health** listens to `queue.updated` and `vpn.updated` too, for the downloads' and the VPN's health checks ([system.md](system.md)).
- **Queue widget** chooses its layout from its own width, not the viewport's: a full table from 760px, a table with fewer columns from 520px, and stacked rows below that.
- **Responsive:**

  | Breakpoint | Behavior |
  | --- | --- |
  | expanded and wide (≥ 1024) | Full sidebar; 4-column grid |
  | medium (600–1023) | Icon rail; 2-column grid; 4-wide widgets take the full row |
  | compact (< 600) | Menu sheet; 1-column grid; the queue becomes stacked rows; header actions wrap below the title |

## States

- **Loading:** each widget shows its own skeleton inside its frame, so the grid doesn't jump when data arrives. The layout itself loads first; until then the role default is drawn.
- **Populated:** live. Speeds, progress and ETAs update in place on the mock server's clock; bars animate their width, numbers change without motion.
- **Empty (new server):**
  - Indexers: "No indexers yet" with **Add indexers** (to `/indexers`);
  - Subtitles: "No subtitles yet";
  - Upcoming: "Nothing due in the next 14 days";
  - Announcement: "No announcement is live" with **Write one** (to `/curation`);
  - Queue: "The queue is empty";
  - Recently added: "Nothing added yet";
  - System health: "Everything looks healthy".
- **Empty (no widgets):** "Your dashboard is empty" with **Add widget**.
- **Error:**
  - a widget that fails shows "Couldn't load {widget}" inside its frame with the server's message and **Try again**; the rest of the grid keeps working;
  - if the layout itself fails: "Couldn't load your dashboard" with the server's message and **Try again**.
- **Admins** don't get the **Default layout** menu items: role defaults are the owner's.
- **Customizing:**
  - each widget gets a drag handle (top left), a remove button (top right) and a resize corner (bottom right);
  - widget meta (for example, "updated 2s ago") hides while customizing, so the header has room for the controls in a 1-column widget;
  - nothing is saved until **Done**.

## Interactions

- **Enter Customize:** the **Customize** button, or the palette action.
- **Move, by pointer:** drag a widget's handle over another widget to take its place. Neighbors glide aside (layout animation; instant under reduced motion).
- **Resize, by pointer:** drag the corner sideways or down. The size snaps to whole columns and rows within the widget's ranges; there's no free-form size.
- **Move and resize, by keyboard:** focus a handle (Tab), then:

  | Key | Action |
  | --- | --- |
  | Space or Enter | Pick up the widget, or drop it |
  | Arrow keys | Move it one position: Left and Up earlier, Right and Down later |
  | Shift + Left or Right | Make it narrower or wider by a column |
  | Shift + Up or Down | Make it shorter or taller by a row |
  | Escape | Put it back where it was picked up |

  Focus stays on the handle after each move. A polite live region announces each step: "Network picked up, position 1 of 7.", "Network is now 2 columns wide and 3 rows tall.", "Network dropped at position 2 of 7."
- **Remove:** the × button (labelled "Remove Network"). It's undoable until Done, through Cancel.
- **Add widget:** opens a right-hand sheet, "Add a widget", listing the allowed widgets not already on the grid, each with a one-line description. Picking one adds it at the end at its default size, closes the sheet, and toasts "Calendar added at the end".
- **More layout options:**
  - **Reset to default** replaces the draft with the role's default. Done then forgets the person's own layout, so later changes to the role default reach them.
  - **Make this the default for admins** (the owner only) saves the current draft as that role's default, without any widgets the role can't see. The toast says which were left out.
- **Cancel** drops the draft. Navigating away also drops it.
- **Done** saves and leaves Customize mode with a "Dashboard saved" toast. If nothing changed it just leaves.
- **Live updates:** a layout saved in another tab or on another device arrives over the event stream (`layout.updated`) and redraws the grid. Once this tab has a draft, the draft wins until Done or Cancel.
- **Sound:** admin sound is off by default ([sound › defaults](../design-language/sound.md#defaults)). These interactions play nothing. Pick-up and drop sounds are an open question below.
- **TV, D-pad and touch:** not applicable. The admin isn't a TV app. On touch screens, drag works through pointer events on the handle and corner.

## Copy

| Where | Text |
| --- | --- |
| Customize description | Drag a widget by its handle to move it, or by its corner to make it wider or taller. Nothing is saved until you press Done. |
| Add sheet | **Add a widget** · Widgets go at the end of the grid. Move them once they're in. |
| Add toast | {Widget} added at the end · Move it where you want it. |
| Save toast | Dashboard saved |
| Save error | Couldn't save the dashboard · {server message} |
| Reset error | Couldn't load the default layout |
| Role default toast | New admins start from this layout · Admins who haven't customized their dashboard see it now. |
| Layout error | Couldn't load your dashboard · {server message} · Try again |
| No widgets | Your dashboard is empty · Add the widgets you want to see first. · Add widget |
| Widget error | Couldn't load {widget} · {server message} · Try again |
| Indexers empty | No indexers yet · Searches need at least one. The catalog adds public ones in a click. · Add indexers |
| Network, no downloads | No downloads yet, with the speeds at zero |
| Queue empty | The queue is empty · Movies you add show here while they download and import. |
| Recently added empty | Nothing added yet · New movies show here once they're imported. |

## Data

Through `@highsea/sdk` (the contract is `@highsea/api-contract`'s `dashboard` group):

- `dashboard.layout()` → `GET /api/v1/me/dashboard`. Staff, as are saving and resetting it.

  ```ts
  type WidgetPlacement = {
    id: string
    kind: WidgetKind
    span: 1 | 2 | 3 | 4 // columns
    rows: number // 84px rows
    settings?: Record<string, unknown> // filled from the widget's defaults on read
  }
  type WidgetLayout = {
    scope: { kind: 'user'; userId: string } | { kind: 'role'; role: 'owner' | 'admin' }
    widgets: WidgetPlacement[]
    updatedAt: number | null // null while nobody has saved it: the built-in default
    inherited: boolean // true while the person sees their role's default
  }
  ```

  The server filters out widgets the person's role can't see, and kinds it doesn't know (a widget removed in a later version), which it keeps in storage so a downgrade doesn't lose them.
- `dashboard.saveLayout({ body: { widgets } })` → `PUT /api/v1/me/dashboard`. Refuses (403, `widget-not-allowed`) a widget the role can't see.
- `dashboard.resetLayout()` → `DELETE /api/v1/me/dashboard`. The person inherits their role's default again.
- `dashboard.roleDefault({ params: { role } })` → `GET /api/v1/dashboard/defaults/{role}`. Staff.
- `dashboard.saveRoleDefault({ params: { role }, body: { widgets } })` → `PUT /api/v1/dashboard/defaults/{role}`. Owner only. Widgets the role can't see are dropped and listed in `dropped`.
- Event `layout.updated` on the event stream.
- **The widget registry** is `@highsea/personalization/widgets`: each widget's id, title, description, width and height ranges, default size, the roles that may add it, its data source and a zod settings schema with defaults (Network: 10 minutes; Upcoming: 14 days; Queue: the All filter). The settings are stored with each placement; there's no UI to edit them yet.
- **Data sources:** the server's public info lists the sources it has (`sources`). A widget whose source isn't there shows its empty state and calls nothing. In checkpoint 3 the server has `system`, which feeds Storage (`system.status`) and System health (`system.healthChecks`). Checkpoints 4 and 5 add `movies` and `indexers`; checkpoint 6a adds `downloads`, which feeds Network (`system.speeds`, `downloads.list`, `vpn.status`) and Queue (`queue.list`); checkpoint 7a adds `subtitles`, which feeds Subtitles (`subtitles.stats`, `subtitles.wanted`). Since checkpoint 7b its sync figures are live: synced since midnight UTC, the tracks waiting, and today's average correction. The curation source arrives with its checkpoint.

## Decisions

- **The queue is a widget** (Queue, 4 wide by default), not a fixed card below the grid as [admin.md](../design-language/platforms/admin.md#main-area) describes. That lets owners and admins move or remove it like anything else. *Approved by the owner on 2026-10-20.*
- **Widgets can be up to 4 wide.** admin.md says widgets span 1 or 2 columns. The queue, calendar, upcoming and recently added need the width. Network stays at 1 or 2, as the signed-off prototype has it. *Approved by the owner on 2026-10-20.*
- **Order is the layout.** Widgets flow through the grid; resize changes the span only, snapped to allowed sizes. No free x/y placement and no dense packing, so the visual, DOM and keyboard orders always agree, and the same layout works at 4, 2 and 1 columns.
- **Widgets resize in height too,** in 84px rows, as the signed-off prototype does. A widget's content is cut at a whole row with a link to the rest, so the grid stays even.
- **Draft until Done.** Every change is local until Done, so Cancel is a full undo and nothing half-arranged reaches other devices.
- **Reset forgets rather than copies.** A reset layout is the role default by reference, so an owner's later change to the default still reaches that person.
- **Widget meta hides while customizing,** so the handle, title and remove button fit in a 1-column widget at 1024 (about 175px wide).
- **The queue lays out by its own width** (container measurement), not the viewport, because the same widget can be 2 or 4 columns wide.
- **The members' dashboard is gone** (owner's decision, 2026-10-20). Migration `0004_roles` deletes their saved role layouts. The registry still filters widgets by role on the server, so an owner-only widget could be added later without leaking.
- **The editor is ui-web's `WidgetEditor`,** shared by the admin and the prototype; the registry is `@highsea/personalization`'s.
- **Per-widget settings are stored, not yet edited** (owner's decision, 2026-10-20). Each widget shows its defaults.
- **Columns come from the main area's width, not the viewport's.** At 1024 with the 216px sidebar, a 1-column widget is about 175px: tight for Indexers and Storage. The grid chooses 4, 3 or 2 columns from the main area's width (a container query). *Approved by the owner on 2026-10-20; built with the [dashboard follow-up](#follow-up-customization-on-homarrs-level).*

## Open questions

- **Sounds for Customize.** Should picking up and dropping a widget play `select` and `back` when admin sound is on?
- **Per-widget settings** and **multiple instances:** answered by the follow-up below (a settings dialog per widget; any widget more than once).

## Follow-up: customization on Homarr's level

The owner asked on 2026-10-20 for the dashboard to become as customizable as [Homarr](https://github.com/homarr-labs/homarr)'s boards, with a visible grid while customizing. It comes after Phase 3, and its plan is [plans/dashboard-customization.md](../plans/dashboard-customization.md):
- free placement on a grid, with resizing on both axes;
- layouts per breakpoint, with columns from the main area's width;
- containers;
- a settings dialog per widget;
- any widget more than once;
- the grid's cells drawn while customizing.

Until then, the decisions above stand.
