# Curation: announcements and featured sections

- **Platforms:** Admin (`apps/server`), every breakpoint. What it composes shows on every client.
- **Prototype:** `#/admin/curation` (announcements), `#/admin/curation/featured` (featured sections), `#/admin/curation/announcements/{id|new}` and `#/admin/curation/featured/{id|new}` (the composers) (A11).
- **Roadmap:** [Phase 2 › A11](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Curation](../roadmap.md#curation-highseacuration). The clients' side is [client-home.md](client-home.md#announcements).

## Purpose

What the household sees first, decided by the owner: announcements (movie night, a restart, a new remote address) with who sees them, where and for how long; and the featured sections that make up every home screen. Each composer shows the draft live on a TV, the web and a phone before anything changes for anyone.

## Entry points

- Sidebar › **Curation** (owners and admins).
- The dashboard's Announcement widget (**Write one** when none is live), and the palette ("announcements", "featured", "hero").

## Layout

### The lists

- Page header: "Curation", "What everyone sees first: your announcements, and the sections on every home screen.", and the primary action of the tab: **New announcement** or **New section**.
- Line tabs: **Announcements**, **Featured sections**. Each tab has its own address.
- **Announcements:** one card each, live first, then scheduled, drafts and ended:
  - the severity icon, the title (a link to the composer), the status (Live, Scheduled, Draft, Ended), "Must acknowledge" when it's required;
  - a line: where it shows ("Banner, Home card"), the audience ("Everyone", "Owners and admins", "Every app but the admin") and the schedule ("Since Thu 15 Oct, 20:15 · until Fri 23 Oct");
  - the reach: "Seen by 2 of 5" ("Acknowledged by" when required) with a bar, or "Not shown yet";
  - **Edit**, and a More menu: **End now** (live or scheduled), **Delete**.
- **Featured sections:** in home-screen order, with "In home-screen order. Continue watching always comes right after the hero."; each card has a drag handle, the title and its suffix, the layout (Hero, Row, Spotlight), the status when not live, the source and its count ("Saved filter: year < 1930 · 10 titles · Everyone"), a strip of the first six posters, then **Edit** and **Delete**.

### The composers

Two columns from expanded (the form at 22–28rem, the preview beside it and sticky); stacked below expanded, preview second.

- **Announcement:**
  - **Title** (80 characters) and **Message** (markdown: `**bold**`, `_italic_`, `[links](https://…)`);
  - **Image** (none, or a backdrop from the library), shown with the dialog and on the TV's screen;
  - **Add a button**: a label and a link (https), shown on banners, cards and dialogs (not on TV, which can't follow a link);
  - **How important**: Info, Notice, Warning, Critical (segmented). Warnings and critical ones take their tone in banners;
  - **Where it shows**: **Everyone has to acknowledge it** (a switch: it becomes a dialog with only **Got it**, and on TV a screen of its own before Home), then **Banner** (web, desktop, the admin), **Home card** (phones), **Toast** (web and desktop, once). The TV always shows the newest as a pill;
  - **Who sees it**: Everyone, **Roles** (Owners, Admins, Users), **People** (each person), or **Apps** (TVs; Phones and tablets; Web and desktop; The admin);
  - **When**: **Start now** or **Start later** (a date and time); **No end** or **End at**;
  - **Publish** (or **Schedule** when it starts later, **Save changes** when it's live), **Save as draft**, **Cancel**.
- **Featured section:**
  - **Title** and **After the title** (the lighter suffix: "by Ines", "Restored and scored");
  - **Layout**: Hero, Row, Spotlight, with what each means;
  - **Titles**: **Pick them** (search the playable library, add, reorder by the drag handle, remove) or **Use a rule**: Recently added (7, 30 or 90 days), a genre, a collection, or a saved filter ("year < 1930"). A rule shows what it picks now: "Right now this picks 10 titles, and keeps up as the library changes", with their posters;
  - **Taglines on the hero** (hero only): a line per title in place of its synopsis;
  - **Who sees it** and **When**, as above;
  - **Add to home** or **Save changes**, **Cancel**, and **Delete** when editing.

### The live preview

- **TV · Web · Mobile** (segmented) and **Preview as** (Ines, the owner; Ruth, a user).
- The client's real home screen in a frame: 16:9 for TV and a 16:10 window for the web (at least 1600 and 1280 wide, growing to fill the space), the phone in its bezel, scaled to fit. It's a picture: it can't be tabbed into or clicked.
- The announcement composer shows only the draft (other announcements would stack with it or cover it); the section composer leaves announcements out and scrolls to the section being edited.
- Under it: "What Ines sees on a TV, with this announcement as it stands. Other announcements are left out. Nothing changes for anyone until you save." When the viewer isn't in the audience on that app: "Ruth isn't in the audience on a TV, so this announcement doesn't show there."

## States

- **Loading:** row skeletons; the composer's fields wait for the saved item.
- **Empty:** "No announcements yet" · Tell everyone about movie night, a new remote address or a restart… **Write one**. "No featured sections yet" · Sections make up every home screen… **Add a section**.
- **Error:** "Couldn't load the announcements" with the server's message and **Try again**.
- **Invalid:** errors show on Publish, beside the field: "Give it a title. It's the first thing people read." · "Choose at least one place to show it." · "Choose at least one role." · "The button needs a label and a full link, starting with https://." · "The end has to come after the start." · "Add at least one title." A draft needs only a title.
- **A rule that picks nothing:** "Nothing matches right now. The section stays hidden until something does."
- **Live:** the reach updates as people dismiss or acknowledge; the lists update when another admin saves.
- **No reduced states.** Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md)); users get the refusal page.

## Interactions

- **Publishing** an announcement puts it on screens at once (or at its start). **End now** takes it off every screen and keeps it, with its reach, as Ended. **Delete** removes it and its reach, after a confirmation that suggests ending instead.
- **Reordering** is by the drag handle on each card or picked title, as on the dashboard: drag it with a pointer, or press Space on it, move it with Up and Down, and press Space to drop it (Escape puts it back); each step is announced. Sections save their new order as soon as one is dropped; the order is the home screen's (the person's own order, [client-settings.md](client-settings.md#home-screen), comes on top of it).
- **The preview** follows every keystroke (about 120 ms after typing stops). It shows the draft as live, whatever its schedule. Switching platform or viewer reloads the frame.
- **Keyboard:** the forms are native controls in reading order; the preview frame is skipped.
- **Leaving with unsaved changes:** the browser asks before the tab closes.
- **Sound:** none.

## Copy

| Where | Text |
| --- | --- |
| Page | Curation · What everyone sees first: your announcements, and the sections on every home screen. |
| Reach | Seen by {n} of {m} · Acknowledged by {n} of {m} · Not shown yet |
| Saved | "{Title}" is live · It's on everyone's screens in its audience now. |
| Scheduled | "{Title}" is scheduled · It goes out on its own at the start time. |
| Draft | "{Title}" saved as a draft · Nobody sees it until you publish it. |
| Ended | "{Title}" ended · It's gone from every screen. |
| Delete | Delete "{Title}"? · It leaves every screen, and the record of who saw it goes too. To keep the record, end it instead. |
| Section saved | "{Title}" saved · Every home screen in its audience shows it now. |

## Data

- `curation.announcements()` → `GET /api/v1/curation/announcements`: `AnnouncementSummary[]` (the announcement, its status from the schedule, `seenBy`, `audienceSize`).
- `curation.announcement(id)`, `curation.saveAnnouncement(a)` → `PUT /api/v1/curation/announcements/{id}`; `curation.endAnnouncement(id)` → `POST …/{id}/end`; `curation.deleteAnnouncement(id)`.
- `curation.sections()` → `GET /api/v1/curation/sections`: `SectionSummary[]` (status, `itemCount`, a `sample` of posters); `curation.section(id)`, `curation.saveSection(f)`, `curation.deleteSection(id)`, `curation.moveSection(id, by)`.
- `curation.resolve(section)` → `POST /api/v1/curation/sections/resolve`: the titles a source picks now; `curation.ruleOptions()`: genres and collections.
- **The preview:** `POST /api/v1/curation/preview` with the draft, the client type and the viewer, returning the home sections and announcements as that person would get them. In the prototype the frame runs its own copy of the mock server and is sent `curation.snapshot()` with the draft merged in (`applyPreview`), over `postMessage`.
- Events: `announcements.updated`, `curation.updated`.

## Decisions

- **Status comes from the schedule.** Only a draft is a stored state; scheduled, live and ended are read from the dates, so an announcement goes out and comes down on its own.
- **Acknowledgement and the dialog are one choice.** A dismissable dialog is just a banner that blocks, so "Everyone has to acknowledge it" is the only way to get a dialog, and it always comes with one.
- **The TV shows a pill, whatever the placements.** A TV has no banner or card slot; the newest announcement is a pill on Home, and acknowledge-required ones get their own screen.
- **The preview runs the real client screens,** in a frame against a copy of the server, rather than a drawing of them, so it can't drift from what people see. It's inert so a TV's focus or a dialog can't escape into the admin.
- **The preview shows the draft alone.** The point is the draft; the full stack of announcements is on the clients themselves.
- **"Reach" counts people, not devices,** and only accepted accounts: invites don't count until they join.
- **Rules, not just picks.** A rule section (recently added, a genre, a collection, a filter) keeps itself fresh; a section whose rule matches nothing hides rather than showing an empty row.

## As built (8c)

Built in checkpoint 8c, on 2026-10-21: `/curation`, `/curation/featured`, and the composers at `/curation/announcements/{id|new}` and `/curation/featured/{id|new}`, in `apps/server` (`src/admin/curation*.tsx`). The server side is `@highsea/curation/service` ([ADR 0048](../adr/0048-curation.md)). What real data changed from the prototype:

- **The preview is the server's own drawing** of a home screen, at `/curation-frame`. The prototype framed the real client screens, and those arrive in Phase 4. The frame is the device's size: TV at 1600 × 900, the web at 1280 × 800, a phone at 390 × 844. It is scaled to fit and inert, as specified, and the admin posts it the result of `POST /curation/preview`. It follows the draft about 150 ms after typing stops.
- **Preview as** lists every accepted person, not the prototype's Ines and Ruth, and starts on you.
- **Only titles with a file** show: in a section, in the picker and in what a rule picks. This is the prototype's "playable" until streaming arrives. The picker searches the library by title.
- **A collection rule** stores the collection's TMDB id. The list's summary names the collection from the rule options.
- **The filter rule** takes `year` and `rating` comparisons (`<`, `<=`, `=`, `>=`, `>`), joined by `and`, with rating out of 5. Anything else is refused with the hint's own words.
- **Rule orders:**
  - recently added: newest first;
  - a genre and a filter: best rated first;
  - a collection: release order.
- **The first hero leads** wherever it sits in the order. Another hero shows as a row, and a person can arrange it on their own home screen.
- **The sections' order saves whole** (`PUT /api/v1/curation/sections/order`), not `moveSection(id, by)`. Deleting is `removeAnnouncement` and `removeSection`, and creating is a `POST` to the list.
- **The apps' side is its own SDK group:**
  - `home.sections({ query: { client } })` → `GET /api/v1/home`;
  - `announcements.active({ query: { client } })` → `GET /api/v1/announcements`;
  - `announcements.seen({ params: { id } })` → `POST /api/v1/announcements/{id}/seen`.
- **Events:**
  - `announcements.updated` and `home.updated` are personal. Each reaches only the people whose announcements or home screen changed.
  - `curation.updated` is the admin's lists, and goes to staff only.
  - The `curation.schedule` job runs every hour, and once more at each start and end.
- **The admin's own announcements** show as banners above every admin page, as in the prototype's shell. Dismissing or acknowledging one counts toward its reach.
- **Ending a scheduled announcement** marks it ended from now, so it never goes out.

## Open questions

- **Per-title artwork overrides:** the data model has them; should the composer let the owner pick a still or upload art for the hero?
- **Push notifications** for critical announcements on phones: in M1, or with the mobile app?
- **Translations:** should an announcement carry a version per language?
