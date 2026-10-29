# Setup

- **Platforms:** Admin (`apps/server`), every breakpoint. It runs before any account exists, so it has no shell.
- **Prototype:** `#/admin/setup` (flow A2).
- **Roadmap:** [Phase 2 › A2](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes › Setup and access](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes), [Connectivity](../roadmap.md#connectivity-local-and-remote-highseanetwork--sdk), [Indexers and the independent catalog](../roadmap.md#indexers-and-the-independent-catalog), [Subtitles](../roadmap.md#subtitles-first-class-highseasubtitles).

## Purpose

Takes a freshly started server to a working one in a few minutes: a name, the owner account, where movies and downloads live, somewhere to search, subtitle languages, and how apps reach it from outside the home. Every step has a sensible default, so someone who doesn't know what a hardlink or a reverse proxy is can press Continue and end up with a working server. Everything can be changed later in Settings, and the wizard says so.

## Entry points

- The server's first start: while `system.publicInfo().setupComplete` is false, every admin route redirects to `/setup`. (The prototype doesn't redirect, so the other flows stay reachable.)
- In the prototype, both seeds are already set up, so the flow is opened directly from the launcher or at `#/admin/setup`.
- The wizard is never reachable again once finished; its choices live in Settings.

## Layout

- **Header** (56px, `line` border below): the lockup, "Setup" in `text-3`, and **Start over** on the right once you've passed the first step.
- **Body** (max 960px, centered):
  - **Stepper** on the left at expanded and wide: an ordered list of the 9 steps. The current step is highlighted; finished steps show a check and are buttons, so you can go back.
  - Below expanded the stepper collapses to "Step 4 of 9 · Media folders" and a progress bar above the form.
  - **Form** (max 600px): the step's heading and one-line explanation, its fields, then a footer with **Back** (from step 2) and **Continue** (or **Finish setup** on the last step).
- **Steps:**

  | # | Step | Fields | Default |
  | --- | --- | --- | --- |
  | 1 | Server name | Server name | Empty |
  | 2 | Owner account | Your name, Username, Password, Confirm password | Empty |
  | 3 | TMDB key | The key (masked), **Open TMDB's API page**, why highsea asks, and TMDB's logo and notice; **Add it later in Settings** beside Continue | Empty |
  | 4 | Media folders | Movies folder, Downloads folder, each with **Browse**; the hardlink check below | `/data/media/movies` and `/data/downloads`, the container layout the server detects |
  | 5 | Indexers | The catalog's starter pack, one checkbox each; private ones carry a "Needs an account" badge | Public indexers checked |
  | 6 | Subtitles | Language chips; the order you pick them in is the preference order | English |
  | 7 | Remote access | Three radio cards; the chosen one reveals its field | Only at home |
  | 8 | highsea cloud | One switch, and what linking does and doesn't share | Off |
  | 9 | Review | Every choice in a list, each with **Change** | |

  The TMDB key step is new in Phase 3 (decision 4), between the owner and the folders as the [checkpoint 4 plan](../plans/phase-3-checkpoint-4.md#the-key) places it; the prototype has the other 8. The indexer step arrived with checkpoint 5 and the subtitle step with 7a, so the server's wizard has all 9. The server's starter pack lists only public starters that need no setting, so each adds without a form and the "Needs an account" badge has nothing to mark.

- **Path picker** (a dialog from **Browse**): the server's folders, not this device's. Breadcrumbs at the top (each segment is a button), "Up one level", the folders in the current one, then **Cancel** and **Use this folder**.
- **Hardlink check** (step 3): a banner under the folders. Success when both are on the same disk; a warning when they're not, explaining the cost and how to avoid it.
- **Responsive:** one column below expanded, with the compact stepper above the form. Fields stay full width; radio cards stack. Nothing scrolls sideways at 390px.

## States

- **Populated:** the normal walk. Progress (step, furthest step reached, and every answer) survives a reload.
- **Loading:**
  - the indexer pack, the language list and each folder in the path picker show skeletons in place of their lists;
  - the hardlink banner appears once the check answers; there's no spinner, because it takes milliseconds;
  - **Finish setup** shows a spinner while the server applies the choices.
- **Validation errors** show under the field on Continue, never while typing. Focus stays in the form.
- **Error:**
  - catalog: "Couldn't load the catalog" with the server's message, "You can skip this and add indexers later.", and **Try again**;
  - languages: "Couldn't load the languages" with **Try again**;
  - path picker: "Can't open this folder" with the server's message;
  - finishing: a toast, "Setup didn't finish", with the server's message. The wizard stays on Review with every answer intact.
- **Empty:**
  - a folder with no subfolders shows "Up one level" and "No folders inside. Use this one, or go up a level.";
  - a typed path the server doesn't know shows no hardlink banner, and **Browse** opens on "Can't open this folder", where the breadcrumbs lead back up;
  - no indexers checked is allowed: Review shows "None yet", and the dashboard's Indexers widget prompts later.
- **Permission-limited:** not applicable. Setup runs before any accounts exist. Once it's done the route is gone.
- **Live:** not applicable.

## Interactions

- **Continue** (or Enter in any field) validates the step and moves on. **Back** moves back without validating.
- **Stepper:** finished steps can be clicked to jump back. Later steps can't be skipped to.
- **Focus:** each step change moves focus to the step's heading, so a screen reader announces where you are.
- **Path picker:** Tab through the breadcrumbs and folders; Enter opens one. Escape closes the dialog without changing the field.
- **Language chips** are toggle buttons (`aria-pressed`). The line under them, a polite live region, reads the order back: "English, then Spanish, in that order."
- **Remote access** is a native radio group: arrow keys move between the cards.
- **Review › Change** jumps to that step. Continue then walks forward again through the later steps.
- **Start over** clears every answer and returns to step 1.
- **Finish setup** applies everything, signs the owner in, toasts "{Server name} is ready", and lands on the dashboard.
- **Sound:** admin sound is off by default, and setup plays nothing.
- **Touch:** the language chips and radio cards wrap and stack; nothing needs hover.
- **D-pad:** not applicable.

## Copy

| Step | Heading | Explanation |
| --- | --- | --- |
| 1 | Name your server | Everyone who connects sees this name. You can change it later in Settings. |
| 2 | Create the owner account | The owner can do everything, including inviting people and giving them roles. Keep this password somewhere safe. |
| 3 | Add your TMDB key | highsea gets movie details, posters and cast from TMDB. Each server uses its owner's own free key. |
| 4 | Choose your folders | Movies is where your library lives. Downloads is where torrents land before they're imported. |
| 5 | Add indexers | Indexers are the sites highsea searches for releases. These public ones need no account. Add private ones from the catalog later. |
| 6 | Subtitle languages | highsea finds subtitles in these languages and syncs them to each movie. The first one is preferred. |
| 7 | Watching away from home | Choose how apps reach this server from outside your network. You can change it later. |
| 8 | Link to highsea cloud | Optional. Everything works without it: the cloud only adds conveniences, and your library never leaves this server. |
| 9 | Check and finish | Everything here can be changed later in Settings. |

*As built (6b; checkpoint 6's answer 10):* step 1 adds a line under the name: "Coming from Radarr or qBittorrent? You can bring your library across after setup." It's plain text, because Settings › Migration opens only once setup has signed the owner in.

**TMDB key** (checkpoint 4, as built):
- the field is "TMDB API key or Read Access Token", with the hint "Either one works. TMDB shows both on your account's API page.";
- the link: **Open TMDB's API page**;
- why: "TMDB's terms ask each app to use its own key, so highsea doesn't share one between servers. Once highsea cloud can fetch movie details for you, this step goes away.", then TMDB's logo and notice: "This product uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.";
- **Add it later in Settings** skips the step; Continue checks the key with TMDB first;
- Review: "TMDB key" reads "Added, ending in {last4}" or "Not yet: add it later in Settings".

**Remote access options:**
- **Only at home:** Apps connect on this network. Nothing is opened to the internet.
- **Through my reverse proxy:** You already serve it at an address of your own, such as Caddy or Traefik with HTTPS. Reveals **Public address** (placeholder `https://movies.example.com`).
- **Forward a port on my router:** highsea serves HTTPS on a port you forward. It checks the port is reachable. Reveals **Port** ("Forward this TCP port on your router to this server.").

**highsea cloud:**
- the switch is "Link this server to highsea cloud", with the hint "Off by default. You can link or unlink it any time in Settings.";
- what linking adds:
  - Apps find this server from anywhere, without a port or a proxy.
  - Push notifications on phones, without running your own relay.
  - Movie details without your own TMDB key.
- what it shares: The cloud sees your server's address and account email, never your library or what you watch.

**Hardlink check:**
- **Hardlinks will work:** Both folders are on the same disk, so imports are hardlinked: seeding takes no extra space.
- **Imports will be copied:** These folders are on different disks, so imports are copied. While a movie seeds, it takes twice the space. To avoid it, pick a downloads folder on the same disk as your movies.

**Validation:**

| Field | Message |
| --- | --- |
| Server name | Give the server a name. |
| Your name | Enter your name. |
| Username | Use 2 to 32 lowercase letters, numbers, dots, dashes or underscores. |
| Password | Use at least 10 characters. |
| Confirm password | The passwords don't match. |
| TMDB key | Paste your TMDB key, or add it later in Settings. / TMDB didn't accept that key. Copy it again from your TMDB account. / Can't reach TMDB right now. Check the server's internet connection, or add the key later in Settings. |
| Movies folder | Pick a folder for movies. |
| Downloads folder | Pick a folder for downloads. / Use a different folder from the movies folder. |
| Languages | Pick at least one language, or turn subtitles off later in Settings. |
| Public address | Enter the full address, starting with https:// |
| Port | Use a port from 1024 to 65535. |

**Done:** "{Server name} is ready · Add your first movie from Discover." The page title is "Set up highsea".

## Data

As built in Phase 3, checkpoints 2, 4, 5 and 7a.

- `system.publicInfo()` → `GET /api/v1/system/info/public`: `{ id, name, version, setupComplete, auth, sources, attributions }`. Unauthenticated.
- `setup.defaults()` → `GET /api/v1/setup/defaults`: the media root and the suggested folders.
- `setup.listFolders(path)` → `GET /api/v1/setup/fs?path=…`: `{ name, path, kind: 'folder' }[]` inside the media root only, or a 404 "{path} doesn't exist on the server."
- `setup.checkHardlinks(a, b)` → `GET /api/v1/setup/fs/hardlinks?a=…&b=…`: `{ ok, sameDevice, message }`.
- `setup.checkMetadataKey({ body: { key } })` → `POST /api/v1/setup/metadata-key`: the key step's Continue. It asks TMDB (`GET /3/authentication`) without saving the key: 204 when TMDB accepts it, 400 with `details.reason` `tmdb-key-rejected` when it doesn't, 503 `tmdb-unreachable` or 429 `tmdb-rate-limited` when TMDB can't say. Either credential works, the v3 API key or the Read Access Token, told apart by shape.
- `setup.starterPack()` → `GET /api/v1/setup/indexers` (checkpoint 5): the catalog's public starters that need no setting, as `CatalogIndexer[]`. Unauthenticated, like the rest of setup, and a 404 once setup is complete; staff use `catalog.indexers({ starter: true })` afterwards.
- `setup.languages()` → `GET /api/v1/setup/languages` (checkpoint 7a): the languages the subtitle step offers, as `SubtitleLanguage[]`. Unauthenticated like the rest of setup, and a 404 once setup is complete; staff use `subtitles.languages()` afterwards.
- `setup.complete(input)` → `POST /api/v1/setup`, allowed only while `setupComplete` is false. It returns the server and starts a session for the owner.

  ```ts
  type SetupInput = {
    serverName: string
    owner: { username: string; displayName: string; password: string }
    folders: { movies: string; downloads: string }
    remoteAccess:
      | { kind: 'local-only' }
      | { kind: 'reverse-proxy'; url: string }
      | { kind: 'port-forward'; port: number }
    cloudLink: boolean
    // the key step: the key when added (checked already), and the owner's locale for both
    metadata?: { key?: string; language?: string; region?: string } // 'en-US', 'GB'
    // the indexer step: starter definition ids, added after the owner exists, each tested first;
    // a failure is logged and doesn't hold up setup (checkpoint 5)
    indexers?: string[]
    // the subtitle step (checkpoint 7a): language codes in preference order, written into the
    // seeded profile (renamed after them, each Regular and forced, Without SDH); 400
    // `subtitleLanguages` for a code not in `subtitles.languages()`
    subtitleLanguages?: string[]
  }
  ```

- The setup endpoints (`/api/v1/setup/*`) are open only until setup is complete, then return 404.
- The wizard keeps its place and its answers in the browser (`highsea:setup` in localStorage), except the password and the TMDB key. After a reload, a key TMDB accepted is asked for again on Finish ("For your safety the key isn't kept when the page reloads. Paste it again, or add it later in Settings."); the server stores it encrypted.

## Decisions

- **One submit at the end.** The server applies everything in one call on Finish, so a half-finished wizard leaves no half-configured server. The draft is kept on the client until then.
- **The prototype keeps progress in `localStorage`** (`highsea-proto:setup`), password included, because it's mock data. The product should keep the draft in the browser's session storage and never persist the password: after a reload, the owner step asks for it again.
- **Folder defaults come from the container.** The server detects the usual `/data/media/movies` and `/data/downloads` layout and suggests it, so Docker users press Continue.
  - *As built (checkpoint 6a, 2026-10-20):* the defaults are `{data}/media/movies` and `{data}/downloads` under the data root, which the Docker image mounts at `/data` (before 6a the movies default was `{data}/movies`; the checkpoint's judgement call 2). The two folders are stored as the `folders` setting (it was `media`; migration `0006_downloads` renames the row), and the engine saves library grabs under `{downloads}/movies` and torrents added by hand under `{downloads}/manual`. Manual import (A17) starts in the downloads folder.
- **Hardlinks are explained, not required.** Different disks still work, with a warning that names the cost (twice the space while seeding) and the fix.
- **Public starter indexers are pre-checked** once, when the pack first loads. Unchecking them sticks across reloads.
- **Language order is pick order.** The first language picked is preferred. That's simpler than a separate drag-to-reorder list, and the line under the chips reads the order back.
- **Three remote-access choices, local first.** "Only at home" is the default: nothing is exposed to the internet unless the owner chooses it. The cloud's relay is a separate, later step, so remote access never depends on it.
- **Cloud is its own step, off by default,** with what it does and doesn't see written out. It matches the brief: the cloud is optional and only adds conveniences.
- **Validation runs on Continue,** not while typing, so the form doesn't scold half-typed values.
- **Review uses Change links** back to each step, rather than inline editing, so each field has one home.

- **Setup asks for the owner's TMDB key** until the highsea cloud metadata proxy exists, with a link to TMDB's key page and a note on why (Phase 3 decision 4). It's checked with TMDB on Continue, can be skipped ("Add it later in Settings"), and is changed later in Settings › General › Metadata ([checkpoint 4 plan](../plans/phase-3-checkpoint-4.md#the-key)).

## Open questions

- **Port reachability check.** The copy promises "It checks the port is reachable". Should that check run in the wizard (it needs the cloud or a public echo service) or only later in Settings? If it can't run without the cloud, the copy should change.
- **Restoring an existing server.** Should step 1 offer "Restore from a backup" for people moving an install?
- **More than one movies folder.** The roadmap's root folders allow several. Setup asks for one. Is that enough, with the rest in Settings?
- **Two-factor for the owner.** Should setup offer to turn on two-factor right after the owner account, or leave it to Settings?

## 2026-10-28: the shorter setup (checkpoint 4.3c, prototyped and approved by the owner on 2026-10-28)

[install-simplicity.md › B](../plans/install-simplicity.md#b-highsea-detects-what-setup-used-to-ask) cuts the nine steps down to what highsea can't find out for itself. The prototype at `#/admin/setup` now shows it. The owner approved it on 2026-10-28. Where this section and the layout, copy and data above disagree, this section wins. The server's wizard is built to it in 4.3c's part B.

- **Steps:** **Owner account**, then **Review**. **Media folders** comes between them only when highsea found no movies folder and downloads folder under `/data`. The stepper lists only the steps this server needs: "Step 1 of 2" when the folders were found, and "Step 1 of 3" when they weren't. The toolbar's Populated shows the first case and Empty the second.
- **No TMDB key step** (the owner, 2026-10-28, reviewing the prototype): movie details always come with highsea's own key. A build from source reads `HIGHSEA_TMDB_READ_TOKEN` from its environment instead, as development does from `.env.local`. Review's **Movie details** line takes the owner's own key, which is optional.
- **Owner account** gains **Server name** below the password fields. It is filled in from the host's name, with the hint "From this computer's name. Everyone who connects sees it.", or left empty when the container's hostname is only its id. The two-factor line and the migration line become one caption.
- **Media folders**, when asked, opens with "highsea didn't find a movies folder and a downloads folder under /data. Pick the folders you mounted for it." The fields start empty, and the picker opens at `/data`.
- **Review** ("Check and finish": "highsea chose these from what it found. Change anything here now, or later in Settings.") is one line per decision. A line that was asked in a step has **Change**, which goes back to that step. A line highsea decided has **Change**, which opens its editor in place under the line, and **Done** closes it after checking it. A line keeps its "from …" note until the owner changes it.

  | Line | What highsea chose | Its editor |
  | --- | --- | --- |
  | Owner, Server name | what the owner typed | back to Owner account |
  | Folders | the folders found, and "Same disk, so imports are hardlinked." or "Different disks, so imports are copied." | the folder fields, Browse and the hardlink banner (or back to Media folders) |
  | Movie details | "From TMDB, with highsea's key" or "From TMDB, with your key ending in {last4}" | "Your own TMDB key", optional; the owner's key wins |
  | Indexers | the catalog's public starters, all on | the checklist |
  | Subtitles | the browser's languages that highsea has subtitles in, in the browser's order, or English | the language chips |
  | Time zone | the browser's (`Intl.DateTimeFormat().resolvedOptions().timeZone`) | a list of every IANA zone |
  | Address on your network | the host's LAN address with host networking; in bridge mode, the address the browser used (`location.host`) | the address, checked as host and port |
  | Away from home | Only at home | the three radio cards |
  | Video conversion | the graphics chip whose check passed at boot, or the processor | none: Settings › Playback, once setup is done |
  | highsea cloud | Not linked | none, until the relay exists |

- **Away from home:** **Forward a port on my router** now means highsea asks the router to forward the port, with UPnP or NAT-PMP (answer 10: only once the owner chooses it): "highsea asks your router to forward this port, using UPnP or NAT-PMP, and serves HTTPS on it. If the router doesn't answer, Health says how to forward it yourself."
- **Finish setup** checks each editor again. One left wrong opens again with its message, for example "Enter the address apps use, such as 192.168.1.20:3000."
- **Gone:** the Server name, TMDB key, Indexers, Subtitles, Remote access and highsea cloud steps, and the cloud's switch.
- **Owner account's password fields** line up at the top (`items-start` on their two-column grid). Before, the grid stretched both fields to the taller one's height, so Confirm password sat lower than Password whenever Password showed its hint.
- **Data:** `setup.detect()` returns `{ serverName, folders, address, graphics }`, with null for anything not found (`mock/types.ts` `SetupDetected`). `SetupInput` gains `metadataKey?`, `timeZone` and `address`.
- **Loading and error:** the stepper and the form show skeletons until `detect` answers. When it fails, the page shows "Can't reach the server" and **Try again**.

### As built in 4.3c's part B (2026-10-28)

`apps/server/src/admin/setup.tsx` follows the prototype, with these differences that real data forced:

- **The owner's own key** is sent as `metadata.key`, beside the browser's locale, as before, rather than as a top-level `metadataKey`. TMDB checks it on Finish. A key it refuses opens the Movie details line with "TMDB didn't accept that key. Copy it again from your TMDB account."
- **A field the server refuses** goes back to where it's asked: an owner field to Owner account; a folder to Media folders, or to the Folders line when the folders were found; the time zone, the address, subtitles and remote access to their lines.
- **What highsea finds** (`packages/runtime/src/setup.ts`):
  - **The name** is the hostname's first label, and null for Docker's 12-digit id or `localhost`.
  - **The folders:** an empty `/data` gets `media/movies` and `downloads`; hidden folders, `lost+found` and highsea's own `transcodes/` don't count. Otherwise highsea looks for `media/movies`, `movies`, `media/films` or `films` and for `downloads` or `torrents`, without regard to case, with `downloads` beside the movies when there is none.
  - **The address** is `HIGHSEA_PUBLISHED_URL`'s, if set. Otherwise it is the private LAN address outside a container, or with host networking, which shows Docker's own interfaces. Otherwise it's null.
  - **The graphics** are the path the boot check chose.
- **The time zone** Setup sends replaces the container's `TZ` in Settings › General, as a saved setting already does.
- **The address** is kept as its own setting and leads the addresses that apps are told and that discovery answers with. Settings › Network doesn't show it yet.
