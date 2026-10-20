# Settings

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `#/admin/settings` (the index) and `#/admin/settings/{area}` (A15, reference fidelity; Appearance and Users and devices are core, in [appearance.md](appearance.md) and [users-devices.md](users-devices.md)).
- **Roadmap:** [Phase 2 › A15](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Admin UI routes](../roadmap.md#admin-ui-routes-built-to-match-the-phase-2-prototypes) (`/settings/*`).

## Purpose

Everything about how the server runs, in one place, one area per page: the region and updates, how it looks, how it's reached, how people sign in, backups, people, the library's naming and quality, the download client, and notifications.

## Entry points

- Sidebar › **Settings** (owners and admins); the palette (every area by name).
- **Security** and **Backups** are the owner's alone ([ADR 0032](../adr/0032-administrative-and-normal-access.md)): admins don't see them in the index or beside an area, and their addresses say there's no setting there.
- Links from elsewhere: Backups from System › Backups, Download client from Downloads.

## Layout

- **The index** (`/settings`): four groups (Server, People, Library, Downloads and alerts), each a grid of cards (1, 2 or 3 across) with the area's icon, name and one line on what's inside. Subtitles links to its own page.
- **An area** (`/settings/{area}`): the page header with the area's name and line; from expanded, the areas beside the content (grouped, the current one marked); below expanded, **All settings** back to the index. Content is a stack of **groups** (a titled card each).
- **The save bar:** while an area has unsaved changes, "You have unsaved changes." with **Discard** and **Save** sticks to the bottom of the page.

| Area | Groups and main controls |
| --- | --- |
| **General** | Region: Language, Time zone · Metadata: TMDB key (set or not, its last four characters, **Replace**, **Remove**; checked with TMDB on save), Metadata language, Region (for certifications, release dates and Discover; the owner's locale by default) · Indexer catalog (the owner's; checkpoint 5): Channel (Stable or Beta), Install new versions automatically (or ask first), Extra catalogs (address, key ID, public key; **Remove**) · Updates: Stable or Beta, Install updates on their own · Diagnostics: Send anonymous usage counts (off), Log level |
| **Appearance** | [appearance.md](appearance.md) |
| **Network and remote access** | Remote access: External URL, **Check from outside** · Reverse proxy and TLS: My proxy handles it, Built in, Off (LAN only); Trusted proxies; X-Forwarded headers · Discovery: Let apps on this network find Harbor (with the Docker note) |
| **Security** | Signing in: **Require two-step for the owner and admins** (on for new servers; [ADR 0032](../adr/0032-administrative-and-normal-access.md)), passkeys, session length · Single sign-on (OIDC): on, button label, client ID, issuer URL, client secret, the redirect URL to copy · Ownership: Hand the server over |
| **Backups** | Schedule: every day, week or never; the time; how many to keep; the folder. Making and restoring backups is in [System › Backups](system.md) |
| **Users and devices** | [users-devices.md](users-devices.md) |
| **Media management** | Naming: Rename movies, Folder and File formats with a live preview ("Becomes Sintel (2010) Bluray-1080p.mkv") and the tokens · Importing: hardlinks, NFO files, stop monitoring deleted files, folder permissions, recycle bin |
| **Profiles and formats** | Quality profiles (allowed qualities, the cutoff marked, upgrades, format scores) · Custom formats (what they match, Preset or Yours) · Presets from the catalog (TRaSH-style: HD Bluray + WEB, UHD Bluray + WEB, Remux + WEB 2160p) |
| **Quality sizes** | A table of MB per minute (min, preferred, max) per quality, with what that means for a 2-hour film |
| **Import lists** | Each list (Trakt, TMDB, IMDb, Letterboxd): on, its count and behaviour, its quality profile |
| **Download client** | VPN binding: bound or not, the interface, stop downloads if it goes down · Connections: listening port, encryption, downloading at once, UPnP |
| **Connections** | Notifications: each channel on or off, its events, **Test** · Add a connection: Discord, Slack, Telegram, ntfy, Gotify, Pushover, Email, Webhook, Apprise |

## States

- **Loading:** "Loading…" in the area; **error:** "Couldn't load these settings." and the server's message.
- **Unsaved:** the save bar. **Saved:** "Settings saved".
- **Warnings in place:** TLS off ("Without TLS, passwords cross the network in the clear. Keep it to the LAN."); backups off ("Without backups, a failed disk takes your settings, history and users with it."); a bad external URL ("Use a full address, like https://harbor.example.net.").
- **Not found:** an unknown area: "There's no setting here" with **All settings**.
- **Reference fidelity:** controls marked "Not in the prototype" (editing a profile, adding a list or a connection, presets, the certificate, handing the server over) show a tooltip and do nothing.

## Interactions

- **Edit, then Save or Discard.** Nothing applies until Save; leaving the area keeps nothing.
- **Check from outside** asks the server to reach its own external URL from outside and reports the time and certificate.
- **Test** sends a test notification to that channel.
- **Keyboard:** native controls in reading order; the area nav is a list of links.

## Data

- `settings.get(section)` / `settings.save(section, value)` → `GET|PUT /api/v1/settings/{section}` for `general`, `media`, `downloadClient`, `network`, `security`, `backups`, `connections`, `importLists` (draft shapes in `design/prototypes/src/mock/settings.ts`). Network and Security are built (checkpoint 2); the rest come with their checkpoints.
- **General › Metadata** (checkpoint 4): the TMDB key, the metadata language and the region live together in one settings row, `GET`, `PUT` and `DELETE /api/v1/settings/metadata`:
  - `settings.metadata()` (staff) → `MetadataSettings`: `key` (`set`, and `last4`, its last four characters; never the key itself), `language` (`en-US`, TMDB's language parameter) and `region` (`GB`, ISO 3166-1; the owner's locale by default, set in setup);
  - `settings.saveMetadata({ body })` (the owner) → `PUT`, any of `key`, `language` and `region`. A new key is checked with TMDB first (400 `tmdb-key-rejected`; 503 `tmdb-unreachable` or 429 `tmdb-rate-limited` when TMDB can't say), and nothing is saved unless every field is. The key is stored encrypted;
  - `settings.removeMetadataKey()` (the owner) → `DELETE`. The library and its pages keep working from the cache.
- **General › Indexer catalog** (checkpoint 5): `catalog.settings()` and `catalog.updateSettings(patch)` → `GET`, `PATCH /api/v1/catalog/settings`, both the owner's. Each change saves at once; an admin sees a line saying only the owner can change them. See [indexers.md › Data](indexers.md#data).
- **Quality sizes:** `settings.qualitySizes()` → `GET /api/v1/settings/qualitySizes` (staff): `{ quality, min, preferred, max }` per quality, lowest first, in MiB per minute. Read-only until checkpoint 8.
- **Profiles and formats:** `quality.profiles()` → `GET /api/v1/qualityprofiles[/{id}]` and `quality.customFormats()` → `GET /api/v1/customformats`, both staff. Seeded and read-only until checkpoint 8 ([ADR 0031](../adr/0031-quality-and-the-decision-engine.md)).
- **Root folders** (Media management › Importing): [movies.md › Data](movies.md#data).
- Events: `settings.updated`.

## Decisions

- **An index, then one area per page,** rather than one long page: each area's address can be linked from where its setting matters (Downloads → Download client, System → Backups).
- **Drafts with a save bar** for settings pages; immediate saves for lists (curation, people), where each change is its own action.
- **Subtitles stays on its own page** and is listed here as a link, so its settings and its wanted list sit together.
- **Backups split:** the schedule is a setting; making and restoring a backup is an action on System.

- **The TMDB key lives in General › Metadata,** with the metadata language and region; setup sets it first, and every missing-key message links here. Approved by the owner on 2026-10-20 ([checkpoint 4 plan](../plans/phase-3-checkpoint-4.md#owners-decisions)); the prototype doesn't show the group.
- **The catalog's settings sit in General after Metadata,** owner only, and the search timeout stays a fixed 30 seconds (checkpoint 5, answer 7). The prototype doesn't show the group.
- **Profiles and formats stay read-only until checkpoint 8.** Their editors are prototyped and approved first.

## Open questions

- **Search across settings** (like macOS): worth it with about a dozen areas?
- **Per-section advanced toggles** (Sonarr's "Show advanced"), or keep advanced values in a share code / config file?
