# Now playing

- **Platforms:** Admin, every breakpoint; a widget on the dashboard.
- **Prototype:** `design/prototypes/src/admin/now-playing/` (`#/admin/now-playing`), with its mock in `src/mock/sessions.ts`, and the **Now playing** widget in `src/admin/dashboard/widgets.tsx`. Prototyped at Phase 4's checkpoint 4.0b, 2026-10-23, and waiting for the owner's approval. In the prototype, four sessions move with the mock's clock; **Prototype only · Slow a transcode** plays one that can't keep up; Stop plays a stopped session; and the empty server has nobody watching.
- **Built:** at 4.3 (sessions), on [ADR 0051](../adr/0051-playback-engine.md) and [ADR 0052](../adr/0052-device-profiles.md).
- **Plan:** [phase-4-checkpoint-0.md › Now playing](../plans/phase-4-checkpoint-0.md#now-playing-admin-and-its-widget).

## Purpose

Who's watching what, on which device, and how each stream is sent, with the reason in words when it isn't sent as it is. It answers the owner's two usual questions, "why is it buffering?" and "who's using my upload?", and lets them stop a stream with a message.

## Who sees it

The owner and admins, like the rest of the admin ([answer 5](../plans/phase-4-checkpoint-0.md#the-owners-answers)).

## Entry points

- Its own entry in the sidebar, after Activity, with a count while anyone is watching.
- The dashboard's **Now playing** widget, and its "{n} more in Now playing".
- The command palette ("sessions", "streams", "watching", "transcodes", "stop").

## Layout

Two tabs: **Now** (with the count) and **Last 30 days**.

### Now

- **The totals:** streams, Mbps sent in all, Mbps away from home, and transcodes.
- **A row per session:** the poster and title (to the movie's page), the person and device with the device's kind as an icon, then the state (Playing, Paused, Downloading, Can't keep up, Stopped) and how it's sent (Direct play, Direct stream, Transcode), and **Stop** (**Cancel** for a download).
  - **Progress:** the position as "6:52 of 15:00", or a download's "52% made" and when it started.
  - **Sent as:** what goes out ("1080p · H.264 · AAC stereo · 7.6 Mbps"), **From:** the version it's made from, **Network:** At home or Away from home with the address, and for a transcode **Transcoded by:** "VAAPI, 2.4× real time".
  - **Why:** a line per reason when it isn't direct play, in words: "Ruth is away from home, and the 4K file is more than the 8 Mbps allowed there, so it's sent as 1080p.", "Chrome can't play DTS audio, so the audio is converted to AAC. The picture is sent as it is."
  - **Can't keep up:** a transcode below real time turns its bar and line red, and says what to do: turn on hardware acceleration in Settings › Playback, or lower what's sent away from home.
- **Downloads made for a device** (Downloads, C8) are sessions of their own kind, so the owner sees the transcode they cost.

### Last 30 days

A table: movie, who, device, how it was sent (with "away" when remote), how much was watched ("All" when finished), and when. A filter by person.

### Stop

A dialog: "Stop Ruth's stream?", "Their player stops and shows your message. They can start it again.", a **Message** field ("Optional. Shown in their player, with your name."), **Keep playing** and **Stop stream**. For a download: "Cancel Ines's download?", "The copy on their device is deleted. They can download it again." The row stays a few seconds as "Stopped by {name}: "{message}"", then goes. The player's side is in [player.md](player.md#the-streams-states-checkpoint-40b).

### The widget

Registry kind `now-playing`: 1 to 4 columns, 2 to 5 rows, default 2 × 3; owner and admin. A row per session (poster, title, how it's sent or Can't keep up, person and device, progress), the total Mbps in the header, and "Nobody is watching" when nobody is. In the prototype it leads the owner's and admins' first arrangement, since it's the one widget about this minute; saved layouts keep their own order.

## States

| State | What shows |
| --- | --- |
| Nobody watching | "Nobody is watching", "Streams show here as they start, with who's watching, on what, and how it's sent." |
| One, several | The totals and the rows |
| A transcode that can't keep up | Can't keep up, the red bar, and what to do |
| Stopped | The row dimmed, who stopped it and their message, for 10 s |
| No history | "Nothing watched yet", "Every stream is recorded here for 30 days: who, what, on which device and how it was sent." |

## Data

- `sessions.list()` → `GET /api/v1/sessions`: the sessions with the person and title by name, and the totals. Staff only.
- `sessions.history({ userId? })` → `GET /api/v1/sessions/history`: the last 30 days.
- `sessions.stop(id, message)` → `POST /api/v1/sessions/{id}/stop`.
- Events: `sessions.updated` as sessions start, move, change and end.

## Decisions

- **Reasons in words, from the device profile** (ADR 0052): the decision that picks direct play, direct stream or transcode writes its reasons as it goes, so the page shows what the server decided rather than guessing.
- **A download is a session,** since its transcode costs the same as a stream's.
- **30 days of history** ([Phase 4 answer 10](../plans/phase-4-clients.md#the-owners-answers)): long enough for "who watched what last weekend", short enough not to be a record of people's viewing.
- **Stop takes a message, not a reason list:** the owner knows their household; a free line says more than a menu.

## Open questions

- **Bandwidth over time:** a graph of what was sent, as Tautulli has? Left for after 1.0.
