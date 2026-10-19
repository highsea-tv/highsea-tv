# Player chrome

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/play/4`, `#/mobile/play/4`, `#/tv/play/4` (C5); `…/play/4/start` plays from the start. There's no real video in Phase 2: a still stands in for the frame and the position runs on a timer.
- **Roadmap:** [Phase 2 › C5](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off). Streaming is Phase 4 (`stream`).

## Purpose

Everything around the picture: where you are and moving through it, sound and subtitles, and putting subtitles back in step when they drift. It gets out of the way while the film plays.

## Entry points

- **Play** / **Resume** on Home, Continue watching and the item page; **Play from the start** on the item page.

## Layout

### Web and desktop

- **Top:** Back (to the item page), the title and the version's description ("4K · HEVC · 2.4 GB"), the version tag at the right.
- **Centre:** a large Play while paused (a pointer target only; the transport's Play is the accessible one).
- **Bottom:** the scrubber with a **trickplay** frame and time over the pointer; Play/Pause, back 10 s, forward 10 s, Mute, "4:12 / 12:00", then **Audio and subtitles** and **Full screen** at the right.
- **Audio and subtitles panel** (right, 22rem, glass): Version (when several), Audio, Subtitles (Off first), then **Subtitle timing** when subtitles are on: − and + in 50 ms steps, the offset ("+100 ms", "On time"), **Reset**, the **live preview line**, and "Subtitles appear 100 ms later. Saved for this movie."
- **Subtitles** sit in the lower third and rise above the chrome while it shows.

### Mobile

Landscape, full screen (the prototype turns it a quarter inside the portrait phone frame). A tap shows or hides the chrome: Back and the title at the top with Audio and subtitles at the right; back 10 s, Play/Pause (72pt) and forward 10 s in the middle, in thumb reach; the times and the scrubber at the bottom. The panel is the web's.

### TV

- **Top:** the title (2.2u) and the version's description; the version tag at the right.
- **Bottom:** the scrubber (focused on arrival) with elapsed and remaining time; **Audio and subtitles**; and a legend of the remote mapping: "◀ ▶ Seek 10 s · OK Pause · ▼ Audio and subtitles · Back Hide".
- **Seeking** shows a trickplay frame (14u) over the scrubber.
- **Audio and subtitles** is the TV panel ([client-detail.md](client-detail.md#layout)) plus **Subtitle timing**: a row that takes **Left** and **Right** as −50 ms and +50 ms, with the preview line.

### The live preview line

Two bars on one time axis, speech above and the subtitle below, and the subtitle bar moves as you nudge (1px per 10 ms, up to ±600 ms), with a cue line on the frame. It answers "which way did I move it?" without waiting for the next line of dialogue.

## States

- **Playing:** the chrome hides 3 s after the last input; the pointer hides with it (web).
- **Paused:** the chrome stays; the large Play shows (web, mobile).
- **Ended:** playback stops at the end; Play starts over.
- **Subtitles off:** no timing section; nothing on the frame.
- **Not on this server:** "That title isn't on this server." with **Go home**.
- **Remote:** the version's description shows what's being sent (in the product, the transcode, e.g. "1080p · 8 Mbps for your connection").

## Interactions

| Input | Web | Mobile | TV |
| --- | --- | --- | --- |
| Play / pause | Space, or the button | Tap Play | OK on the scrubber; Play/Pause key anywhere |
| Seek | ← / → 10 s; drag the scrubber | Skip buttons; drag | ← / → on the scrubber |
| Tracks | The button, or the panel | The button | ↓ to Audio and subtitles |
| Close panel / leave | Esc closes the panel, then leaves | Back | Back closes the panel, hides the chrome, then leaves |
| Full screen | F, or the button | Always | Always |
| Mute | M | The device's buttons | The TV's volume |

- **Saving:** the position is reported on pause, on seeking and on leaving (Resume, Continue watching). The version, audio, subtitles and the subtitle offset are saved as they change, per person and title.
- **Skip intro:** left out. It needs intro detection, which is a later feature; a greyed button would promise something that doesn't work.
- **Sound:** none over playback.

## Copy

| Where | Text |
| --- | --- |
| Timing | On time · +{n} ms · −{n} ms |
| Timing hint | Subtitles match the audio track's timing. · Subtitles appear {n} ms later. · Subtitles appear {n} ms earlier. |
| Saved | Saved for this movie. |
| TV legend | ◀ ▶ Seek 10 s · OK Pause · ▼ Audio and subtitles · Back Hide |

## Data

- `library.item(id)` for the versions and tracks; `playback.prefs(id)` and `playback.setPrefs(id, patch)` (`PlaybackPrefs`: version, audio, subtitles, `subtitleOffsetMs`) → `GET|PUT /api/v1/items/{id}/prefs`.
- `playback.progress(id, seconds)` → `POST /api/v1/items/{id}/progress`.
- Trickplay frames: `GET /api/v1/items/{id}/trickplay/{n}.jpg` (BIF-style tiles) in the product; the still in the prototype.
- Events: `watch.updated`.

## Decisions

- **The nudge is 50 ms,** the same step as the admin's subtitle offset ([movies.md](movies.md#decisions)), and it's saved per person and title, not on the track: the admin's offset fixes the file for everyone; this fixes it for you.
- **A preview line, not a test clip.** Moving a bar under a cue shows the direction at once; replaying a line of dialogue is the product's job when real video exists.
- **No skip intro** until intro detection exists (decided here, as the plan asked).
- **Mobile is landscape,** like every phone video player; portrait playback isn't designed.
- **TV keeps Left and Right for seeking** while the scrubber has focus, and moves focus only with Down, so a press of the arrows never leaves the scrubber by surprise.

## Open questions

- **Next up:** at the end of a film in a collection, offer the next part?
- **Audio description and commentary tracks:** they're audio tracks with titles; do they need their own labels in the panel?
- **Picture-in-picture** on web and mobile: in M1 of the clients?
