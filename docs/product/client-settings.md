# Client settings, profile and You

- **Platforms:** Web and desktop, mobile, TV (settings); mobile and web (profile and downloads).
- **Prototype:** settings at `#/web/settings`, `#/mobile/you/{section}`, `#/tv/settings` (C7); the profile at `#/mobile/you` and `#/web/profile`, downloads at `#/mobile/offline` and `#/web/downloads` (C8, reference fidelity; core fidelity since checkpoint 4.0b, with `?app=desktop` for the desktop app's).
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
| **Theme** | "Only this device changes. Everyone else keeps their own." · Harbor's default (and which theme that is), the built-ins, and the server's own themes, each with its swatches · **Use on all my devices** ([below](#use-on-all-my-devices)) |
| **Sounds** | Interface sounds (on or off; "Following Harbor: off on phones" until changed), Volume, Listen (Select, Back, Move, Done), **Follow Harbor again** |
| **Home screen** | "The featured hero stays on top. Your order follows you to every device." · each row with a drag handle (drag it, or Space, Up and Down, Space) and a switch (shown or hidden); **Use the server's order** (TV: OK toggles a row; Up and Down buttons move it) |
| **Servers** | Each known server (in use, or signed in or out, with how it's reached), **Switch** or **Sign in**, **Add a server**, **Sign out of Harbor** |
| **Your devices** | This person's devices ("This device", or last used), with **Sign out** |
| **About** | This app's version, the server and its version, the licence (AGPL-3.0); open-source licences and send diagnostics (not in the prototype). In a browser, **Get the apps**; in the desktop app, its updates ([desktop-app.md](desktop-app.md)) |

- **Profile (web):** the person, Account (server, two-step verification, libraries; Change password and Set up a passkey not in the prototype), and links to Settings, Your devices and Downloads.
- **Offline (mobile)** and **Downloads (desktop app):** the list of downloads ([below](#offline)).
- **Downloads (web, in a browser):** "Downloads live in the desktop app": a browser can't keep films; the desktop app can. **Get the desktop app** opens Get the apps ([desktop-app.md](desktop-app.md#get-the-apps)).

### Offline

Checkpoint 4.0b filled in what Phase 2 left at reference fidelity. Mobile's Offline and the desktop app's Downloads are one list (`src/client/offline-list.tsx`); each app keeps its own, on the device.

- **Space:** a bar and "{n} movies ready to watch · {used} · {free} free on this phone" (or "this computer").
- **Each download:** its still (it plays from there once it's downloaded), title, and where it's got to:

  | State | Line | Actions |
  | --- | --- | --- |
  | Downloading | the bar with its percentage, then "{speed}/s · {left} to go" | **Pause**, **Cancel** |
  | Paused | the bar in neutral, "Paused · {done} of {size}" | **Resume**, **Cancel** |
  | Queued | "Waiting to download · {size} · 1080p" (one downloads at a time) | **Cancel** |
  | Waiting for Wi-Fi (mobile) | "Waiting for Wi-Fi · {size} · 1080p" | **Use mobile data**, **Cancel** |
  | Failed | a **Stopped** badge, "The download stopped when Harbor couldn't be reached." | **Try again**, **Cancel** |
  | Downloaded | "{size} · 1080p · plays offline for 26 more days" | **Remove** |
  | Expired | an **Expired** badge, "Connect to Harbor to keep watching it." | **Remove** |

  Remove says "{title} removed · It still plays from Harbor."
- **Settings under the list:** Quality for new downloads (Original, High · 1080p, Data saver · 720p; "Higher looks better and takes more room."), then on a phone **Download on Wi-Fi only**, and in the desktop app **Kept in** (below).
- **Kept in** (the desktop app, prototyped at checkpoint 4.4a): the folder, in mono, with **Change** and "New downloads go here. Changing it moves what's already downloaded." It starts in the OS's videos folder (`~/Movies/highsea`, `C:\Users\{you}\Videos\highsea`, `~/Videos/highsea`). **Change** opens the system's folder picker (in the prototype it picks a folder on another drive at once). With nothing downloaded, the folder just changes ("New downloads go here"). Otherwise a dialog asks "Move your downloads?": "Your {n} downloaded movies ({size}) move to {folder}. Make sure it has room. They keep playing while they move.", **Move downloads** and **Cancel**. While they move, a bar and "Moving {n} movies to {folder} · {done} of {size}. They play from where they are until they've moved."; then "Downloads moved".
- **Download on the item page:** [client-detail.md › Download](client-detail.md#download).
- **The desktop app** has its own Downloads page in place of the browser's "Downloads live in the desktop app"; the same address shows one or the other.
- **Expiry:** a download plays offline for 30 days after the device last saw its server; seeing it again renews it. An expired download stays on the device until it does.

### Use on all my devices

Under the themes, off by default (Phase 4's answer 9). Turned on, the theme this device has becomes the person's, saved to the account, and every device they're signed in on takes it; choosing a theme then changes it everywhere. The legend says "All your devices change." Turned off, each device keeps the theme it has until it's changed there. TV has it as a button under its themes ("Use on all my devices: Off"). In the product it's the user layer of ADR 0027's preferences, with the device layer cleared; the prototype writes all three platforms' choices.

## States

- **Loading:** "Loading your rows…" in Home screen.
- **Nothing downloaded:** "Nothing downloaded" · Tap Download on a movie to keep it on this phone. It plays without the server. (In the desktop app: "Choose Download on a movie to keep it on this computer.")
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

- **Device-level and person-level, kept apart:** how a device looks and sounds applies to it alone (a TV in the living room and a phone don't share a theme); what Home shows follows the person. The server holds both, in layers (ADR 0027). Amended at checkpoint 4.0b: a person may choose **Use on all my devices** for a theme; devices still differ by default.
- **The hero can't be moved or hidden.** It's the owner's featured section and the top of every home screen; everything under it is the person's to arrange, Continue watching included.
- **In the prototype, the toolbar stands in for the server's defaults:** its theme and sound are what a device follows until a choice is made in that client's settings, which then wins on that platform.
- **Downloads are a desktop and mobile feature;** the web in a browser shows where to get them rather than an empty list.
- **Downloads live on the device,** so the server's API has no list of them; it issues each download's file and renews its 30 days when the device is seen (Phase 4 › Downloads).

## Open questions

- ~~**Per-person themes across devices:** offer "use this theme on all my devices" as an option?~~ Yes, off by default ([Phase 4's answer 9](../plans/phase-4-clients.md#the-owners-answers)).
- **Kids' profiles:** should a user's Home be arranged by the owner instead?
- **Offline expiry:** 30 days without seeing the server, as now, or set by the owner?
