# Appearance

- **Platforms:** Admin, every breakpoint. Every client inherits what it sets.
- **Prototype:** `#/admin/settings/appearance` (A12).
- **Roadmap:** [Phase 2 › A12](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Personalization](../roadmap.md#personalization-highseapersonalization). Rules: [color.md › custom themes and server branding](../design-language/color.md#custom-themes-and-server-branding), [sound.md › defaults](../design-language/sound.md#defaults).

## Purpose

How the server presents itself to everyone who connects: its name, mark and accent; the theme the apps start in, and the owner's own themes; and where interface sounds play by default. Each person can still choose differently on their own device ([client-settings.md](client-settings.md)).

## Entry points

- Settings › **Appearance** (owners and admins); the palette ("themes", "appearance").

## Layout

A settings area ([settings.md](settings.md#layout)): the areas beside it from expanded, a back link below.

- **Server identity:**
  - **Name** (40 characters);
  - **Mark**: upload a square SVG or PNG (at least 256 px), or **Use the highsea mark**;
  - **Use a brand accent** (off: each theme keeps its own): a color picker and its hex value, with the audit's verdict ("Passes contrast", "Adjusted for contrast", "Not a color");
  - **In the apps**: a sample of the server switcher with the mark and name, as the clients show it.
- **Themes:**
  - the **default theme** as a choice of cards (radio): the three built-ins (Abyss Neutral, OLED black, High contrast) and the server's own, each with its swatches (bg, s2, text-2, accent) and "Default", "Built in" or "Custom";
  - the custom themes, each with **Edit**, **Copy share code** and **Delete**;
  - **New theme** opens the **theme editor** inline: Name, **Based on** (a built-in), **Accent** (the rest of the accent family is generated to pass contrast), **Quiet text** (`text-3`, the override worth exposing) with **Reset**; the **Contrast** audit (Passes, or each failing pairing with its Lc and minimum, and **Fix** where a lightness change can fix it); **Load a share code**; **Add theme** or **Save theme**, **Cancel**; and beside it the product in miniature (the server's mark and name, posters, a title, its meta and synopsis, Play and Details), in the theme being edited.
- **Sounds:**
  - **TVs** (on by default), **Phones and tablets** (off), **Web and desktop** (off): switches with why;
  - **Volume** (a slider, 0–100%) and **Sound pack** ("Felt and wood"; more come with the catalog);
  - **Listen**: a button per event (Move, Select, Back, Done, Error, Notice, Arrival) that plays it at the chosen volume, even where sound is off.
- A **save bar** ("You have unsaved changes." · **Discard**, **Save**) sticks to the bottom while the identity (the mark included), default theme or sounds have changed. Themes save on their own.

## States

- **Loading / error:** as every settings area: skeleton rows; "Couldn't load the appearance settings" with **Try again**.
- **Invalid:** an empty name ("The server needs a name."); a theme that fails contrast can't be saved ("Themes that fail can't be saved: someone would struggle to read them."); a damaged share code ("This theme code is damaged", "Not a highsea theme code").
- **Live:** the clients pick up a new name, default theme or sounds the next time they check in (SSE `server.updated`).

## Interactions

- **Save** sends the identity, default theme and sounds together; the toast says "Every app picks it up the next time it checks in."
- **Delete** a theme that's the default: the default falls back to Abyss Neutral.
- **Copy share code** copies an `hs1.…` code that anyone can load into their own editor.
- **Listen** plays through the admin's own sound player, so it works while admin sound is off.
- **Sound:** only the Listen buttons.

## Copy

| Where | Text |
| --- | --- |
| Identity | Shown to everyone who connects: in the apps' server switcher, on the TV, and at the top of this admin. |
| Themes | The apps start in the default theme. Anyone can pick another on their own device. |
| Sounds | Where the apps play their interface sounds until someone changes it on their device. Never over a film. |
| Saved | Appearance saved · Every app picks it up the next time it checks in. |
| Theme saved | {Name} saved · Pick it as the default, or people can choose it themselves. |

## Data

Through `@highsea/sdk` (the contract is `@highsea/api-contract`'s `appearance` group):

- `appearance.get()` → `GET /api/v1/appearance`. Everyone signed in: clients read their defaults here. `Appearance` is `defaultTheme`, `themes: CustomTheme[]`, `sound: SoundDefaults`, `packs` (the sound packs, built in or uploaded) and the server's `branding` (`name`, `accent`, `customMark`, and `mark`, the mark's URL or null for the highsea mark).
- `appearance.save({ body })` → `PATCH /api/v1/appearance`. Staff. The name, accent, default theme and sound defaults, any of them.
- `appearance.saveTheme({ params: { id }, body })` → `PUT /api/v1/appearance/themes/{id}`; `appearance.deleteTheme({ params: { id } })` → `DELETE`. Staff. A theme that fails the contrast audit is refused (`invalid`, `contrast`); deleting the default theme puts the default back to Abyss Neutral.
- `appearance.uploadMark({ body: { data } })` → `PUT /api/v1/appearance/mark`, the file base64-encoded; `appearance.removeMark()` → `DELETE`. Staff. The mark itself is `GET /api/v1/appearance/mark`, public, with an `ETag` ([ADR 0028](../adr/0028-files-the-owner-uploads.md)).
- `appearance.soundPack({ params: { id } })` → `GET /api/v1/appearance/sound-packs/{id}`, a pack's recipe; `uploadSoundPack` and `deleteSoundPack` for staff. There's no upload UI yet: packs come with the catalog.
- Themes are `ThemeInput`s for `@highsea/tokens`' theme engine (`createTheme`, `auditTheme`, `nearestPassing`, `encodeTheme`/`decodeTheme`). The server checks them with the same engine.
- Every change is written to the audit log.
- Events: `server.updated`.

## Decisions

- **The editor is the Storybook theme editor, in the product:** the same engine, the same audit, the same share codes. One override is exposed (quiet text); anything more is a share code away.
- **A failing theme can't be saved.** The audit is the design system's contrast policy, not advice.
- **The brand accent is optional** and goes through the same generator, so the accent family still passes contrast whatever color the owner picks.
- **Sound defaults are per kind of app** (TV on, phones and web off), following [sound.md › defaults](../design-language/sound.md#defaults); the admin's own sound stays a per-browser choice.
- **Clients follow, people override.** The default theme and sounds are where a device starts; a person's choice on a device wins there.

## Open questions

- **A custom mark on the TV:** at 2u the owner's mark may need its own small-size version. Ask for two files?
- **Fonts:** should a theme be able to change the type? The design system says no; owners may ask.
- **Sound packs from the catalog:** signed like indexer definitions, or a plain download?
