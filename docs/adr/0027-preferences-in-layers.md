# 0027. Preferences in layers, on the server

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
The sources disagreed about where a person's preferences live:
- the roadmap (Personalization) and [sound.md](../design-language/sound.md), which is locked, say the server stores them in layers and every client syncs them;
- [client-settings.md](../product/client-settings.md) says a device's theme and sound live on the device, and the prototype keeps them in `localStorage`.

The owner decided for the layered store on 2026-10-20 ([Phase 3 plan › Checkpoint 3 in detail](../plans/phase-3-server.md#preferences-layered-on-the-server-owners-decision)). What the person sees stays what client-settings.md promises: a change in a client's settings applies to that device only.

## Decision
- **Four layers, most specific first:**
  1. the device;
  2. the client type, such as all of a person's TVs;
  3. the user, on all their devices;
  4. the server's defaults, from Appearance (the default theme, and sound by kind of app: TVs on, phones and the web off, as sound.md › Defaults says).

  The first layer that sets a key wins. The resolved view says which layer each value came from, so staff can see why a device behaves as it does (`GET /api/v1/devices/{id}/preferences`).
- **Keys are a typed list** in `@highsea/personalization/keys`: `theme`, `sound` and `volume`, each a zod schema. A layer is a `z.strictObject`, so an unknown key is refused rather than stored ([Zod, strict objects](https://zod.dev/api#zstrictobject)). A theme must exist when it's saved; one deleted later falls through to the next layer.
- **Writes** go through `PATCH /api/v1/me/preferences` with `{ layer, client?, values }`. A value sets a key, `null` clears it so the next layer shows through, and a layer left empty is deleted.
  - The device layer is the signed-in device's own. Clients write it from their settings screens.
  - The client and user layers have routes now and no UI yet. They're what client-settings.md's open question, "use this theme on all my devices", would use.
- **Storage:** one row per person and layer (`user`, `client:{type}`, `device:{id}`) in the `preferences` table. A device's row references the device with `ON DELETE CASCADE`, so a TV that signs out starts again from the person's layers ([SQLite, foreign key actions](https://sqlite.org/foreignkeys.html#fk_actions); foreign keys are on for every connection, ADR 0019).
- **Changes** emit `preferences.updated` for the person, so their other clients refresh.
- **Clients keep a copy** to start instantly and offline, and refresh it on that event.
- **The admin's own sound** stays a per-browser choice in `localStorage`, as appearance.md decides. Each admin sign-in is a new device row (ADR 0023), so a device layer would forget it.

## Consequences
- A person's choices follow them to a new device through the user layer once a client offers it, with no change to the data.
- A new key needs only a schema in the list and a server default. Older clients ignore keys they don't know.
- Every client depends on the server for its first start. Its cached copy covers later starts while the server is away.

## 2026-11-01: the apps' playback settings (apps-catch-up.md › A.3)

Settings › Playback in every app (client-settings.md › Playback) is seven keys, `playback.audio`, `playback.subtitles`, `playback.onlyForeign`, `playback.autoplayNext`, `playback.skipIntros`, `playback.qualityHome` and `playback.qualityAway`, in the same list and layers as the theme. The apps write them to the user layer, as the spec has them on every device, and a device or client layer still overrides them for one device.

- **Defaults** (`PLAYBACK_DEFAULTS`) change nothing for anyone until they choose: the film's own audio, subtitles off, Next up playing by itself, intros not skipped, and the original quality at home and away. The prototype's own copy starts with English subtitles for foreign films and 8 Mbit/s away; the server doesn't guess a person's language.
- **Who reads them:** the play decision (`packages/runtime/src/playback.ts`). The audio language picks the film's track in it when nothing else is picked. The subtitle language picks a full track in it (forced ones are for foreign lines only) only while the person hasn't picked anything for that title: their own picks win, as before. With Only when the audio isn't in my language, a track in the language they're hearing is left off. Languages are compared as ISO 639-1, the streams' 639-2 tags read through `@highsea-tv/subtitles/shared`'s `toLanguageCode`.
- **Quality:** a cap is a bitrate with the picture it allows (`capOf`: 20 and 8 Mbit/s 1080p, 4 Mbit/s 720p, 2 Mbit/s 480p, as the prototype labels them). Away, the tighter of the person's cap and Settings › Playback's remote ceiling holds, each part on its own; at home, only the person's. The server-wide settings don't overlap: they decide how the server transcodes and the most it sends away, the person's only ask for less.
- Next up and Skip intros are kept now, for the apps to read; the server has no intro markers for films yet, so Skip intros changes nothing until it does.
