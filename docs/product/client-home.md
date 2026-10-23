# Client home

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web`, `#/mobile`, `#/tv` (C2).
- **Roadmap:** [Phase 2 › C2](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Curation](../roadmap.md#curation-highseacuration) (featured sections and announcements). Layouts: [desktop-web.md](../design-language/platforms/desktop-web.md), [mobile.md](../design-language/platforms/mobile.md#home-tabs--carousel) (locked), [tv.md](../design-language/platforms/tv.md#layout) (locked).

## Purpose

Where the household starts: what the server's owner is featuring, where you left off, and what's new, under the owner's announcements. The owner decides what's on it (featured sections, announcements); each person's watch state adds Continue watching.

## Entry points

- Launch, after connecting.
- Web: **Home** in the top bar; the server switcher.
- Mobile: the **Home** tab.
- TV: launch; **Home** in the global navigation; Back from most screens.

## Layout

The sections come from the server in the owner's order: featured sections (hero, row, spotlight) with **Continue watching** right after the hero. Each person can reorder or hide the rows under the hero in Settings › Home screen ([client-settings.md](client-settings.md)); the order follows them to every device. The owner composes the sections and announcements in Curation ([curation.md](curation.md)).

### Web and desktop

A **full-bleed hero** (the TV's Hero + rows, adapted; chosen in [ADR 0017](../adr/0017-web-home-full-bleed-hero.md)):

- the hero spans the window, 58% of the viewport tall from medium, under the translucent top bar: eyebrow (the section's title), title, meta (year, runtime, genre, quality tags), tagline or synopsis, **Play** or **Resume**, **Details**;
- the hero's titles are chosen with a pager (bottom right); on desktop the hero changes only on selection, never on hover;
- then the owner's banners, then the rows.
- On a phone-width window, the hero sits under the top bar rather than behind it.
- **Rows** (max 1680px, rows bleed to the right edge):
  - **Continue watching:** 16:9 stills with the progress bar, the title and "8 min left"; they open the player directly.
  - **Rows:** posters with the quality tag; hover or focus shows a Play button over the art.
  - **Spotlight:** wider cards (still, title, meta, two lines of synopsis), for a curated theme.

### Mobile (locked)

Header (server switcher, avatar) · the announcement card · the featured carousel (78% wide 4:5 cards, the next peeking, kicker "New · 2010 · Fantasy" and the title; never auto-advancing) · Continue watching (62% wide stills) · poster rows (30% wide, three and a peek; spotlights become rows) · the tab bar (Home, Search, Library, Offline, You; translucent, the active tab in `accent-text`).

### TV (locked)

Server identity (top left) · the announcement pill (top right) · the hero (top 62%, cross-fading artwork; copy at 7.5u: eyebrow, title, meta, tagline or synopsis (two lines), **Play** or **Resume** and **Details**) · rows from about half way down: the featured titles first, then Continue watching (wide tiles), then the owner's rows. Every poster has its title and year under it (wide tiles: the time left).

- **The hero belongs to the featured row.** Focus on a featured title binds the hero after a 220 ms dwell; the rows below don't.
- **The page lifts past the hero.** Down from the featured row moves the whole page up, so the focused row's title sits at the safe area's top with the next row under it; the server identity and the pill go with it, and the row above fades out under the top edge. Up to the featured row brings the hero back.
- **Rows scroll sideways** by transform, keeping focus 30% in (tv.md#scrolling); a focused poster lifts without being clipped.

- **Global navigation (new design work):** a tab row (Home, Search, Library, Settings) at the top centre, in a pill, hidden until focus moves **Up** from the hero actions. It's an isolated focus region entered only by that guide; **Down** returns to the hero. While it's showing, the hero stays as it was.

## Announcements

| Placement | Web | Mobile | TV |
| --- | --- | --- | --- |
| Acknowledge-required (modal) | A dialog, **Got it** only; Escape and outside clicks don't close it | A dialog, **Got it** across the width | Its own screen before Home, **Got it** focused |
| Banner | Under the hero, dismissible | n/a (card instead) | n/a (pill instead) |
| Card | n/a | Under the header, dismissible | n/a |
| Pill | n/a | n/a | Top right: the newest one's title |
| Toast | Once, when the app opens; then counted as seen | n/a | n/a |
| Image and button | The image tops the dialog; the button sits on banners and dialogs | The same, on cards and dialogs | The image tops the acknowledge screen; no button (a TV can't follow a link) |

Audience rules apply per client type, so an owner can address the TVs only, or leave the admin out.

## States

- **Loading:** web: a hero block and a row of poster skeletons; mobile: two carousel cards and a row; TV: a spinner in the centre.
- **Empty:** "Nothing to watch yet" · When the server's owner adds movies, they show up here. (TV adds **Library**.)
- **Error:** "Couldn't load the home screen" with the server's message and **Try again**.
- **Live:** Continue watching follows playback; a new announcement arrives over SSE.
- **Connection:** Connected remotely and unreachable as in [connectivity.md](connectivity.md#states).

## Interactions

- **Play** on the hero plays what the hero shows (TV: the dwelled title). **Resume** when there's progress.
- **Continue watching** items open the player directly; everything else opens the item's page (C4).
- **Pointer:** hover lifts posters to 1.02 and shows Play over the art; rows scroll by wheel and trackpad, with paging arrows on hover.
- **Keyboard (web):** Tab moves between regions; arrows move inside a row.
- **D-pad (TV):** the spatial model ([tv.md](../design-language/platforms/tv.md#spatial-focus-model)); rows remember their last item; Up from any row goes to the hero actions; at the home root, Back returns to the top row's first item.
- **Touch (mobile):** rows and the carousel scroll natively with snapping; press feedback is a 0.97 scale.
- **Sound:** TV only by default: `navigate`, `select`, `back`.

## Copy

| Where | Text |
| --- | --- |
| Hero eyebrow | The section's title ("Featured on Harbor") |
| Continue watching | {n} min left · {h}h {m}m left |
| Acknowledge | Got it |
| Empty | Nothing to watch yet · When the server's owner adds movies, they show up here. |

## Data

- `home.sections(client)` → `GET /api/v1/home?client=`: `HomeSection[]` (`hero`, `row`, `spotlight`, `continue`), resolved per user and app: audience and schedule applied, rule sources evaluated, overrides merged, only playable titles, then the person's own order and hidden rows.
- `announcements.active(client)` → `GET /api/v1/announcements?client=`: live ones for this person and this client type, with `seen`.
- `announcements.dismiss(id)` → `POST /api/v1/announcements/{id}/seen` (dismiss and acknowledge alike, tracked per user).
- `system.server()` for the name and branding.
- Events: `announcements.updated`, `curation.updated`, `watch.updated`, `movies.updated`.

## Decisions

- **A full-bleed hero on the web** ([ADR 0017](../adr/0017-web-home-full-bleed-hero.md)): two options were built at checkpoint 3, this one and a contained card with the other featured titles beside it. The owner chose the full-bleed hero, which carries the TV's hero to the desktop.
- **Continue watching goes after the hero,** whatever the owner's order: it's the most personal row and the most used.
- **The hero's titles are also the first TV row,** so every featured title can be reached and bound by focus, and **only that row binds the hero** (the owner's call at the checkpoint 3 review): the hero is the featured section's, and other rows shouldn't repaint it while it's scrolled away.
- **Nothing is pinned on TV.** The server identity and the pill scroll with the page, so they never sit over a poster.
- **Spotlights become rows on a phone:** there's no room for the synopsis beside the art.
- **Acknowledge-required comes before Home on TV,** as a screen of its own, since a modal over a D-pad layout would leave focus ambiguous.

## Open questions

- **Hero rotation on web:** never on its own (current), or slowly while the window is idle?
- **Pull to refresh on mobile Home** (mobile.md): the live events make it mostly unnecessary. Keep it for habit?
