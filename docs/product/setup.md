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
  - **Stepper** on the left at expanded and wide: an ordered list of the 8 steps. The current step is highlighted; finished steps show a check and are buttons, so you can go back.
  - Below expanded the stepper collapses to "Step 3 of 8 · Media folders" and a progress bar above the form.
  - **Form** (max 600px): the step's heading and one-line explanation, its fields, then a footer with **Back** (from step 2) and **Continue** (or **Finish setup** on the last step).
- **Steps:**

  | # | Step | Fields | Default |
  | --- | --- | --- | --- |
  | 1 | Server name | Server name | Empty |
  | 2 | Owner account | Your name, Username, Password, Confirm password | Empty |
  | 3 | Media folders | Movies folder, Downloads folder, each with **Browse**; the hardlink check below | `/data/media/movies` and `/data/downloads`, the container layout the server detects |
  | 4 | Indexers | The catalog's starter pack, one checkbox each; private ones carry a "Needs an account" badge | Public indexers checked |
  | 5 | Subtitles | Language chips; the order you pick them in is the preference order | English |
  | 6 | Remote access | Three radio cards; the chosen one reveals its field | Only at home |
  | 7 | highsea cloud | One switch, and what linking does and doesn't share | Off |
  | 8 | Review | Every choice in a list, each with **Change** | |

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
| 3 | Choose your folders | Movies is where your library lives. Downloads is where torrents land before they're imported. |
| 4 | Add indexers | Indexers are the sites highsea searches for releases. These public ones need no account. Add private ones from the catalog later. |
| 5 | Subtitle languages | highsea finds subtitles in these languages and syncs them to each movie. The first one is preferred. |
| 6 | Watching away from home | Choose how apps reach this server from outside your network. You can change it later. |
| 7 | Link to highsea cloud | Optional. Everything works without it: the cloud only adds conveniences, and your library never leaves this server. |
| 8 | Check and finish | Everything here can be changed later in Settings. |

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
| Movies folder | Pick a folder for movies. |
| Downloads folder | Pick a folder for downloads. / Use a different folder from the movies folder. |
| Languages | Pick at least one language, or turn subtitles off later in Settings. |
| Public address | Enter the full address, starting with https:// |
| Port | Use a port from 1024 to 65535. |

**Done:** "{Server name} is ready · Add your first movie from Discover." The page title is "Set up highsea".

## Data

As built in Phase 3, checkpoint 2. The indexer and subtitle steps arrive with their packages.

- `system.publicInfo()` → `GET /api/v1/system/info/public`: `{ id, name, version, setupComplete, auth }`. Unauthenticated.
- `setup.defaults()` → `GET /api/v1/setup/defaults`: the media root and the suggested folders.
- `setup.listFolders(path)` → `GET /api/v1/setup/fs?path=…`: `{ name, path, kind: 'folder' }[]` inside the media root only, or a 404 "{path} doesn't exist on the server."
- `setup.checkHardlinks(a, b)` → `GET /api/v1/setup/fs/hardlinks?a=…&b=…`: `{ ok, sameDevice, message }`.
- Later: `catalog.starterPack()` → `GET /api/v1/catalog/indexers?starter=true` and `subtitles.languages()` → `GET /api/v1/subtitles/languages`.
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
    // later: indexers: string[]; subtitleLanguages: string[]
  }
  ```

- The setup endpoints (`/api/v1/setup/*`) are open only until setup is complete, then return 404.
- The wizard keeps its place and its answers in the browser (`highsea:setup` in localStorage), except the password.

## Decisions

- **One submit at the end.** The server applies everything in one call on Finish, so a half-finished wizard leaves no half-configured server. The draft is kept on the client until then.
- **The prototype keeps progress in `localStorage`** (`highsea-proto:setup`), password included, because it's mock data. The product should keep the draft in the browser's session storage and never persist the password: after a reload, the owner step asks for it again.
- **Folder defaults come from the container.** The server detects the usual `/data/media/movies` and `/data/downloads` layout and suggests it, so Docker users press Continue.
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
