# Client settings, profile and You

- **Platforms:** Web and desktop, mobile, TV (settings); mobile and web (profile and downloads).
- **Prototype:** settings at `#/web/settings`, `#/mobile/you/{section}`, `#/tv/settings` (C7); the profile at `#/mobile/you` and `#/web/profile`, downloads at `#/mobile/offline` and `#/web/downloads` (C8, reference fidelity).
- **Roadmap:** [Phase 2 › C7, C8](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Personalization](../roadmap.md#personalization-highseapersonalization). The server's side is [appearance.md](appearance.md).

## Purpose

What a person can change for themselves: how this device looks and sounds, what their home screen shows and in what order, the servers they use, where they're signed in, and what's kept for offline.

## Entry points

- Web: the avatar menu › **Account** (profile) and **Settings**. Mobile: the **You** tab, and the avatar on every tab's header. TV: **Settings** in the global navigation.

## Layout

The same six sections everywhere: **Theme**, **Sounds**, **Home screen**, **Servers**, **Your devices**, **About**.

- **Web:** "Settings", then the sections as a list beside the chosen one (from medium); on a phone-width window, the list alone, each section its own page with a way back.
- **Mobile (You tab):** the person (initial, name, "@ines · owner of Harbor"); the six sections as a grouped list; then **Downloads** and **Sign out of Harbor**. Each section is a screen of its own with "‹ You".
- **TV:** "Settings" and the sections down the left; the chosen one on the right. Moving down the list shows each section; **Right** enters it, **Left** returns.

| Section | What's in it |
| --- | --- |
| **Theme** | "Only this device changes. Everyone else keeps their own." · Harbor's default (and which theme that is), the built-ins, and the server's own themes, each with its swatches |
| **Sounds** | Interface sounds (on or off; "Following Harbor: off on phones" until changed), Volume, Listen (Select, Back, Move, Done), **Follow Harbor again** |
| **Home screen** | "The featured hero stays on top. Your order follows you to every device." · each row with a drag handle (drag it, or Space, Up and Down, Space) and a switch (shown or hidden); **Use the server's order** (TV: OK toggles a row; Up and Down buttons move it) |
| **Servers** | Each known server (in use, or signed in or out, with how it's reached), **Switch** or **Sign in**, **Add a server**, **Sign out of Harbor** |
| **Your devices** | This person's devices ("This device", or last used), with **Sign out** |
| **About** | This app's version, the server and its version, the licence (AGPL-3.0); open-source licences and send diagnostics (not in the prototype) |

- **Profile (web):** the person, Account (server, two-step verification, libraries; Change password and Set up a passkey not in the prototype), and links to Settings, Your devices and Downloads.
- **Offline (mobile):** storage used and free; each download (still, title, size, quality, "plays offline for 26 more days", **Remove**); Quality (Original, High · 1080p, Data saver · 720p) and **Download on Wi-Fi only**.
- **Downloads (web):** "Downloads live in the desktop app": a browser can't keep films; the desktop app can.

## States

- **Loading:** "Loading your rows…" in Home screen.
- **Nothing downloaded:** "Nothing downloaded" · Tap Download on a movie to keep it on this phone. It plays without the server.
- **Unknown section:** "There's no setting here".
- **Live:** a row hidden on one device disappears from Home on every device; a device signed out elsewhere leaves the list.

## Interactions

- **Theme and sound** change this device at once and are remembered on it (no save button): they're preferences, not data.
- **Home screen** saves to the server as each change is made, so the person's order follows them.
- **Signing a device out** stops it at once ("It needs a code or password to come back.").
- **Sign out of Harbor** leaves downloads on the device and returns to Choose a server.
- **Sound:** TV only: `navigate`, `select`.

## Data

- Device preferences (theme, sound, volume) are the device layer of the person's preferences, on the server ([ADR 0027](../adr/0027-preferences-in-layers.md)). The prototype keeps them on the device (`highsea-proto:prefs:{platform}`).
  - `preferences.get()` → `GET /api/v1/me/preferences`: the resolved `values`, which layer each came from (`from`), and the layers themselves.
  - `preferences.save({ body: { layer: 'device', values } })` → `PATCH /api/v1/me/preferences`. A value sets a key; `null` clears it so the next layer shows through. The `client` and `user` layers take the same call, for when a client offers them.
  - Clients keep a copy to start instantly and offline, and refresh it on `preferences.updated`.
- `appearance.get()` for the server's default theme, custom themes and sound defaults.
- `home.layout()` → `GET /api/v1/me/home` (`HomeLayout`: `order`, `hidden`, and the rows to arrange); `home.saveLayout(layout)` → `PUT`. `home.sections()` applies it, keeping the hero on top.
  - Ids the server doesn't offer yet are kept, so a row that appears later lands where the person put it. Until the library (checkpoint 4) and curation (checkpoint 8) arrive, the only row is Continue watching (`continue`, with a null title so each app names it).
- `devices.mine()`, `devices.revoke(id)`; `connect.known()`.
- Events: `curation.updated`, `users.updated`, `server.updated`, `preferences.updated`, `home.updated`.

## Decisions

- **Device-level and person-level, kept apart:** how a device looks and sounds applies to it alone (a TV in the living room and a phone don't share a theme); what Home shows follows the person. The server holds both, in layers (ADR 0027).
- **The hero can't be moved or hidden.** It's the owner's featured section and the top of every home screen; everything under it is the person's to arrange, Continue watching included.
- **In the prototype, the toolbar stands in for the server's defaults:** its theme and sound are what a device follows until a choice is made in that client's settings, which then wins on that platform.
- **Downloads are a desktop and mobile feature;** the web shows where to get them rather than an empty list.

## Open questions

- **Per-person themes across devices:** offer "use this theme on all my devices" as an option?
- **Kids' profiles:** should a user's Home be arranged by the owner instead?
- **Offline expiry:** 30 days without seeing the server, as now, or set by the owner?
