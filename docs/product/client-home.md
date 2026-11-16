# Client home

- **Platforms:** Web and desktop, mobile, TV.
- **Screen:** `apps/client/src/app/(in)/index.tsx`, one screen for every form factor, with its parts in `apps/client/src/home/` (the TV's composition in `home/tv.tsx`).
- **Prototype:** `#/web`, `#/mobile`, `#/tv` (C2): the client's mock export in each frame.
- **Roadmap:** [Phase 2 › C2](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Curation](../roadmap.md#curation-highseacuration) (featured sections and announcements). Layouts: [desktop-web.md](../design-language/platforms/desktop-web.md), [mobile.md](../design-language/platforms/mobile.md#home-tabs--carousel) (locked), [tv.md](../design-language/platforms/tv.md#layout) (locked).

## Purpose

Where the household starts: what the server's owner is featuring, where you left off, and what's new, under the owner's announcements. The owner decides what's on it (featured sections, announcements); each person's watch state adds Continue watching.

## Entry points

- Launch, after connecting.
- Web: **Home** in the top bar; the server switcher.
- Mobile: the **Home** tab.
- TV: launch; **Home** in the global navigation; Back from most screens.

## Layout

One screen, laid out by the form-factor rule in three compositions, since each prototype laid Home out its own way: a pointer's (Web and desktop below), touch's (Mobile) and the TV's. The sections come from the server in the owner's order: featured sections (hero, row, spotlight) with **Continue watching** right after the hero. Each person can reorder or hide the rows under the hero in Settings › Home screen ([client-settings.md](client-settings.md)); the order follows them to every device. The owner composes the sections and announcements in Curation ([curation.md](curation.md)).

### Web and desktop

A **featured card** (the TV's hero brought to the desktop as a card, the owner, 2026-10-30; kept, with Play and paging added, by the owner's answer 9 at prototype-gaps stage 4, 2026-11-01; [ADR 0017](../adr/0017-web-home-full-bleed-hero.md)'s dated section):

- one large card inside the page's gutters, up to 1680px, `clamp(18rem, min(62svh, 42vw), 44rem)` tall with 20px corners, its backdrop under a dark gradient from the left and the bottom, and a bloom in its most vibrant colour behind the top bar and the card that fades once the card has mostly scrolled away;
- low on the left: the title's logo (its name when there's none), meta (year, runtime, genre, quality tags), the tagline or two lines of synopsis, then **Play** or **Resume** (primary) and **More info**. A click anywhere else on the card opens the title too;
- at the bottom right, in a regular window, when the featured section has more than one title: Previous and Next arrows with a dot for each title between them, the current one a wider bar. It changes only when chosen, never by itself or on hover, and the bloom follows it;
- then the rows. On a phone-width window the card sits under the top bar rather than behind it.
- **Spotlight:** a curated theme's row of wider cards (about 30% of the window): the still, the title, the meta and two lines of synopsis, opening the title.
- **Rows** (max 1680px, rows bleed to the right edge):
  - **Continue watching:** 16:9 stills with the progress bar, the title and "8 min left"; they open the player directly.
  - **Rows:** posters with the quality tag; hover or focus shows a Play button over the art.

### Shows, episodes and music (prototype-gaps stage 2, 2026-11-01)

Home is for every kind, not just films, on every app:

- **Continue watching** has a card per show as well as each film part way: the episode the show resumes at, its still, the show's name and "S2, E6 · 32 min left".
- **Next up**, right after it: for each show you're watching, the next episode after the last one you finished. Stills that open the player at that episode, with no progress bar.
- After the owner's rows:
  - **New episodes:** the newest episode of each still-airing show you've watched, when you haven't seen it and it isn't already on a card above;
  - **Recently added shows:** posters with the unwatched count on the art, opening the show;
  - **Recently played:** the albums and artists you last played, squares and circles, opening their pages.
- Each is a row in Settings › Home screen, to move or hide.
- On the phone: the stills are 62% wide, and posters and music 30%. On the TV: wide tiles, poster tiles and square or round tiles.

### Mobile (locked)

Header (server switcher, avatar) · the announcement card · the featured carousel (78% wide 4:5 cards, the next peeking, kicker "New · 2010 · Fantasy" and the title; never auto-advancing) · Continue watching (62% wide stills) · poster rows (30% wide, three and a peek; spotlights become rows) · the tab bar (Home, Search, Library, Offline, You; translucent, the active tab in `accent-text`).

### TV (locked)

Under the head (the server at the left; Search, Home, Collections and Movies centred, with Shows and Music where the server has them; Alerts and the account at the right): the **featured card**, the featured section's first title as one large card across the page, 1u above and below it, with its backdrop, title, meta and tagline or synopsis, and a bloom behind it while the page rests at its top. OK anywhere on the card opens the film; it has no Play or Details of its own (as the prototype has it, apps-catch-up.md's call 3). Then the rows in the server's order: Continue watching as wide cards 22u wide, which resume, then the owner's rows, each poster with its title and year under it (wide cards: the time left).

- **The page follows focus.** It rests at its top while focus is on the featured card; Down to a row lifts the page so that row's title sits near the safe area's top, and the head scrolls away with the page, as the prototype's does. Up to the featured card brings the top back.
- **Rows scroll sideways** by transform, keeping focus 30% in (tv.md#scrolling); a focused poster lifts without being clipped.
- **Global navigation:** the head, on every screen but the player (the owner, 2026-10-30). Focus reaches it by **Up** from the featured card or a page's top stops, through a focus guide across the screen's width that lands on the stop for where the person is; **Down** returns to the page.
- **With no featured card,** Home starts at its first row, which takes focus.

## Announcements

| Placement | Web | Mobile | TV |
| --- | --- | --- | --- |
| Acknowledge-required (modal) | A dialog, **Got it** only; Escape and outside clicks don't close it | A dialog, **Got it** across the width | Its own screen before Home, **Got it** focused |
| Banner | Not drawn: the bell's Alerts popover lists every live one, with a dot while any is new | n/a (card instead) | n/a (Alerts instead) |
| Card | n/a | Under the header, dismissible | n/a |
| Alerts | The bell in the top bar opens them as a popover | n/a | **Alerts** in the head opens their page, every live one |
| Toast | Once, when the app opens; then counted as seen | n/a | n/a |
| Image and button | The image tops the dialog; the button sits on banners and dialogs | The same, on cards and dialogs | The image tops the acknowledge screen; no button (a TV can't follow a link) |

Audience rules apply per client type, so an owner can address the TVs only, or leave the admin out.

## States

- **Loading:** each form factor draws Home as it will be (`home/skeleton.tsx`): a pointer, the featured card and a row of poster skeletons; touch, two carousel cards and a row; the TV, the featured card and a row of skeletons (B1 of the one client platform converged the TV onto the skeletons; it was a spinner).
- **Empty:** "Nothing to watch yet" · When the server's owner adds films, shows or music, they show up here. (TV adds **Library**.)
- **Error:** "Couldn't load the home screen" with the server's message and **Try again**.
- **Live:** Continue watching follows playback; a new announcement arrives over SSE.
- **Connection:** Connected remotely and unreachable as in [connectivity.md](connectivity.md#states).

## Interactions

- **Play** on the featured card (a pointer) plays what it shows; **Resume** when there's progress. On the phone a carousel card, and on the TV the featured card, opens the title.
- **Continue watching**, Next up and New episodes open the player directly; everything else opens the item's page (C4).
- **Continue watching's menu (stage 2):** **Go to the show** (at the episode, its season chosen) or **Go to the film**, **Mark as watched**, and **Remove from Continue watching**, which forgets the place without marking it watched; a toast says which. A show taken off comes back when an episode of it is played again.
  - **Web and desktop:** ⋯ over the card's art, shown on hover and focus, opening a menu.
  - **Phone:** a long press (0.6 s) opens a sheet with the title and episode; the tap that ends it doesn't play.
  - **TV:** OK held for 0.6 s opens the menu over the page, as the Apple TV app's does; a short OK plays. Back closes it, and focus goes back to the card, or to the next one when the card has gone.
- **Pointer:** hover lifts posters to 1.02 and shows Play over the art; rows scroll by wheel and trackpad, with paging arrows on hover.
- **Keyboard (web):** Tab moves between regions; arrows move inside a row.
- **D-pad (TV):** the platform's focus engine, and the spatial model in a browser ([tv.md](../design-language/platforms/tv.md#spatial-focus-model)); rows remember their last item; at the home root, Back returns focus to the featured card (or the first row's first item), and a second Back leaves highsea.
- **Touch (mobile):** rows and the carousel scroll natively with snapping; press feedback is a 0.97 scale.
- **Pull to refresh (mobile; Phase 4's answer 9, prototyped at 4.0b):** from the top of Home, pulling down moves the page at half the finger's distance and shows a turning arrow with "Pull to refresh"; past 72 px it says "Let go to refresh", and letting go shows "Refreshing" with a spinner while Home asks the server again (the sections and announcements). Let go sooner and it settles back. Screen readers hear the status. In the prototype a mouse drag does the same.
- **Sound:** TV only by default: `navigate`, `select`, `back`.

## Copy

| Where | Text |
| --- | --- |
| Hero eyebrow | The section's title ("Featured on Harbor") |
| Continue watching | {n} min left · {h}h {m}m left |
| Acknowledge | Got it |
| Continue watching, an episode | S2, E6 · 32 min left |
| Next up, New episodes | S2, E7 · The Crossing |
| Menu | Go to the show · Go to the film · Mark as watched · Remove from Continue watching |
| Removed | {Show}, S2, E6 removed from Continue watching · It isn’t marked as watched. |
| Marked | {Show}, S2, E6 marked as watched |
| Empty | Nothing to watch yet · When the server's owner adds films, shows or music, they show up here. |

## Data

- `home.sections(client)` → `GET /api/v1/home?client=`: `HomeSection[]` (`hero`, `row`, `spotlight`, `continue`, and since stage 2 `episodes`, `shows` and `music`; an episode on a card is a `ClientItem` with `show` set), resolved per user and app: audience and schedule applied, rule sources evaluated, overrides merged, only playable titles, then the person's own order and hidden rows.
- `announcements.active(client)` → `GET /api/v1/announcements?client=`: live ones for this person and this client type, with `seen`.
- `announcements.dismiss(id)` → `POST /api/v1/announcements/{id}/seen` (dismiss and acknowledge alike, tracked per user).
- `playback.dismiss(id)` → `DELETE /api/v1/watch/{id}/continue`: Remove from Continue watching (the plan named it `watch.dismiss`); `playback.setWatched` and `library.setEpisodeWatched` for Mark as watched.
- `system.server()` for the name and branding.
- Events: `announcements.updated`, `curation.updated`, `watch.updated`, `movies.updated`.

## Decisions

- **A full-bleed hero on the web** ([ADR 0017](../adr/0017-web-home-full-bleed-hero.md)): two options were built at checkpoint 3, this one and a contained card with the other featured titles beside it. The owner chose the full-bleed hero, which carries the TV's hero to the desktop. On 2026-10-30 the owner brought the TV's card to the web in its place, and at prototype-gaps stage 4 (answer 9, 2026-11-01) kept it, with Play and paging added.
- **Continue watching goes after the hero,** whatever the owner's order: it's the most personal row and the most used.
- **The hero's titles were also the first TV row,** so every featured title could be reached and bound by focus, and **only that row bound the hero** (the owner's call at the checkpoint 3 review). Since the owner's change of 2026-10-30 the TV draws the featured section as one card instead, as the prototype does, and nothing rebinds it.
- **Nothing is pinned on TV.** The head is the first thing in the page and scrolls away with it, so nothing passes over a poster; Up brings focus, and the page, back to it. (The navigation was pinned on its own pill at the checkpoint 3 review; the prototype's head, which the client draws, scrolls with the page.)
- **Spotlights become rows on a phone:** there's no room for the synopsis beside the art.
- **Acknowledge-required comes before Home on TV,** as a screen of its own, since a modal over a D-pad layout would leave focus ambiguous.

## Open questions

- **Hero rotation on web:** never on its own (current), or slowly while the window is idle?
- ~~**Pull to refresh on mobile Home** (mobile.md): the live events make it mostly unnecessary. Keep it for habit?~~ Yes, by the owner's change ([Phase 4's answer 9](../plans/phase-4-clients.md#the-owners-answers)); [above](#interactions).
