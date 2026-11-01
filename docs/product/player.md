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
- **Bottom:** the scrubber with a **trickplay** frame and time over the pointer, and at the position while the scrubber's keys move it (until a second after the last press); Play/Pause, back 10 s, forward 10 s, Mute (from the medium breakpoint up), "4:12 / 12:00", then **Audio and subtitles**, **Picture in picture** (where the browser has it) and **Full screen** at the right.
- **Picture in picture** (checkpoint 4.2b): the film plays in the browser's own window, through the [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API). The button is left out where the browser hasn't got the API (Firefox has its own toggle on the video). While it's out, the frame shows the icon, "Playing in picture in picture" and **Back to this tab**; the chrome stays.
- **Audio and subtitles panel** (right, 22rem, glass): Version (when several), Audio, Subtitles (Off first), then **Subtitle timing** when subtitles are on: − and + in 50 ms steps, the offset ("+100 ms", "On time"), **Reset**, the **live preview line**, and "Subtitles appear 100 ms later. Saved for this movie."
- **A subtitle the server draws into the picture** (checkpoint 4.3a: a Blu-ray or DVD picture track, or a styled ASS track the client can’t draw): the timing section keeps its heading and shows "This subtitle is drawn into the picture, so its timing can’t be changed." in place of − and +; the owner approved it as prototyped on 2026-10-28. Choosing such a track, or leaving it, starts a new stream from where the film is, since the picture itself changes.
- **Subtitles** sit in the lower third and rise above the chrome while it shows.

### Mobile

Landscape, full screen (the prototype turns it a quarter inside the portrait phone frame). A tap shows or hides the chrome: Back and the title at the top with Audio and subtitles at the right; back 10 s, Play/Pause (72pt) and forward 10 s in the middle, in thumb reach; the times and the scrubber at the bottom. The panel is the web's.

**AirPlay (the iPhone app, checkpoint 4.5a):** an AirPlay button sits before Audio and subtitles in the top bar ("AirPlay"; "AirPlay: playing on {device}" while it is, tinted in the accent). It opens iOS's own list of screens (AVRoutePickerView; the prototype draws a stand-in with iPhone and Living room TV, the current one checked). While a film plays on another screen, the chrome stays shown, the picture behind it dims, and the middle says "Playing on {device}" · "The controls here still work. Subtitles show on {device}." Play, Pause, seeking and the panel keep working from the phone. The phone draws no subtitle line then: the TV shows the subtitle the panel chose, from the HLS playlist's subtitle renditions. Prototype: `#/mobile/play/4?airplay=on` (toolbar › **AirPlay**).

**As built (4.5a, approved by the owner on 2026-10-29):** expo-video doesn't give the AirPlay route's name, so the app says "Playing on another screen" · "The controls here still work. Subtitles show on that screen.", and the button's label is "AirPlay: playing on another screen". Audio and subtitles opens as an iOS page sheet rather than the web's side panel, and the player turns with the phone rather than staying in landscape.

### TV

- **Top:** the title (2.2u) and the version's description; the version tag at the right.
- **Bottom:** the scrubber (focused on arrival) with elapsed and remaining time; **Audio and subtitles**; and a legend of the remote mapping: "◀ ▶ Seek 10 s · OK Pause · ▼ Audio and subtitles · Back Hide".
- **Seeking** shows a trickplay frame (14u) over the scrubber, until a second after the last press: focus alone never shows it. Without a pointer (TV and phone) the frame shows only while scrubbing, at the scrubber's position (owner, 2026-10-29).
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

### The stream's states (checkpoint 4.0b)

Prototyped on all three platforms; the prototype's toolbar picks one under **Stream** on a player, or `?stream=` opens one (`preparing`, `buffering`, `failed`, `stopped`, `next-up`). They're drawn once, in `src/client/stream-states.tsx`, and each platform passes its own buttons, so TV's take the D-pad.

- **Getting it ready:** the first play of a transcode, while its first segments are made. A glass card over the frame with a spinner, "Getting it ready" and "Making the first minute for your connection." The chrome stays and the position holds.
- **Buffering:** the spinner alone, in a glass circle, with the chrome showing and the position held. In the product it shows only after the wait passes a short delay (1 s), so a brief stall shows nothing; screen readers hear "Buffering".
- **Didn't start:** over a scrim, "This film didn't start", "highsea couldn't read the file. Try again, or choose another version in Audio and subtitles.", with **Try again** (focused) and **Back**. The owner sees why in System › Logs.
- **Stopped by the server:** an owner or admin's **Stop** in Now playing ([now-playing.md](now-playing.md)). Over a scrim, "{name} stopped this stream", their message in quotes when they wrote one, "You can start it again from where you were.", with **Start again** (focused) and **Back**. On mobile the chrome steps aside, so the message has the screen.
- **Next up:** where the credits start (an episode's credits mark; a film's last 20 s), a glass card at the bottom right with what comes next, "Starts in 10 s" counting down, **Play now** and **Cancel**. At zero it plays. On TV, Play now takes the focus; on web and mobile it doesn't, so Space during the credits still pauses. Cancel lets the title end as before. What comes next (stage 2):
  - an episode: the show's next one, headed **Next episode**, or **Season 3 starts** when it's the next season's first;
  - a film in a collection: the collection's next part, headed **Next up**;
  - any other film: no countdown, but **More like this** with three related titles as stills and **Close**; on TV the first takes the focus.

### Episodes (prototype-gaps stage 2, 2026-11-01)

- **The title is the show's,** with "S1, E1 · Pilot" under it in the top bar (and the TV's info panel); screen readers hear "Playing The Lantern Keepers, S1, E1 · Pilot". Leaving a player opened directly goes to the show's page, not a film's.
- **Skip intro:** while an episode's intro plays (the server's intro marks; the pilot and specials have none), a glass button over the frame at the bottom right, **Skip intro**, seeks to the intro's end. On TV it takes the focus while it shows, and focus goes back to the scrubber after.
- **Skip credits:** during the credits once Next up has been cancelled, or when nothing comes next, **Skip credits** brings Next up back, or ends the episode.
- The tracks panel says "Saved for this episode."
- Both show only while the stream is normal, never over the stream's other states or the tracks panel.

## Interactions

| Input | Web | Mobile | TV |
| --- | --- | --- | --- |
| Play / pause | Space, or the button | Tap Play | OK on the scrubber; Play/Pause key anywhere |
| Seek | ← / → 10 s; drag the scrubber | Skip buttons; drag | ← / → on the scrubber |
| Tracks | The button, or the panel | The button | ↓ to Audio and subtitles |
| Close panel / leave | Esc closes the panel, then leaves | Back | Back closes the panel, hides the chrome, then leaves |
| Full screen | F, or the button | Always | Always |
| Picture in picture | The button, where the browser has it | — | — |
| Mute | M, or the button from the medium breakpoint | The device's buttons | The TV's volume |

- **Saving:** the position is reported on pause, on seeking and on leaving (Resume, Continue watching). The version, audio, subtitles and the subtitle offset are saved as they change, per person and title.
- **Skip intro and Skip credits:** episodes only, from the server's markers (see Episodes above).
- **Sound:** none over playback.

## Copy

| Where | Text |
| --- | --- |
| Timing | On time · +{n} ms · −{n} ms |
| Timing hint | Subtitles match the audio track's timing. · Subtitles appear {n} ms later. · Subtitles appear {n} ms earlier. |
| Saved | Saved for this movie. · Saved for this episode. |
| Title line, an episode | {Show} · S1, E1 · Pilot |
| Skip | Skip intro · Skip credits |
| TV legend | ◀ ▶ Seek 10 s · OK Pause · ▼ Audio and subtitles · Back Hide |
| Getting it ready | Getting it ready · Making the first minute for your connection. |
| Drawn into the picture | This subtitle is drawn into the picture, so its timing can’t be changed. |
| Didn't start | This film didn't start · highsea couldn't read the file. Try again, or choose another version in Audio and subtitles. · Try again · Back |
| Stopped | {name} stopped this stream · "{message}" · You can start it again from where you were. · Start again · Back |
| Next up | Next up · Next episode · Season {n} starts · {title} · Starts in {n} s · Play now · Cancel |
| More like this | More like this · Close |
| Picture in picture | Picture in picture · Playing in picture in picture · Back to this tab |

## Data

- `library.item(id)` for the versions and tracks, and since stage 2 `episode` (the show, code, title, the `intro` marks and the `credits` start) and `upNext` (`{kind: 'episode' | 'part', item, season?}` or `{kind: 'choices', items}`); `playback.prefs(id)` and `playback.setPrefs(id, patch)` (`PlaybackPrefs`: version, audio, subtitles, `subtitleOffsetMs`) → `GET|PUT /api/v1/items/{id}/prefs`.
- `playback.progress(id, seconds)` → `POST /api/v1/items/{id}/progress`.
- Trickplay frames: `GET /api/v1/items/{id}/trickplay/{n}.jpg` (BIF-style tiles) in the product; the still in the prototype.
- Events: `watch.updated`.

## Decisions

- **The nudge is 50 ms,** the same step as the admin's subtitle offset ([movies.md](movies.md#decisions)), and it's saved per person and title, not on the track: the admin's offset fixes the file for everyone; this fixes it for you.
- **A preview line, not a test clip.** Moving a bar under a cue shows the direction at once; replaying a line of dialogue is the product's job when real video exists.
- **No skip intro** until intro detection exists (decided here, as the plan asked). Superseded on 2026-11-01 by prototype-gaps stage 2: episodes carry the server's intro and credits marks, so the buttons only show where a mark exists.
- **Mobile is landscape,** like every phone video player; portrait playback isn't designed.
- **Picture in picture is a button on the web** (approved by the owner on 2026-10-27, at the start of 4.2b): Chromium and Safari otherwise offer it only from a menu. To leave it room at 390, Mute shows from the medium breakpoint up; phones and tablets have their own volume buttons, and M still mutes.
- **AirPlay is iOS's own picker** (expo-video's `VideoAirPlayButton`), not a list highsea draws: iOS knows the screens and asks for codes. Added on the owner's answer 9 of 2026-10-29 ([phase-4-checkpoint-5.md](../plans/phase-4-checkpoint-5.md#the-owners-answers)).
- **TV keeps Left and Right for seeking** while the scrubber has focus, and moves focus only with Down, so a press of the arrows never leaves the scrubber by surprise.

## Open questions

- **Next up:** answered by the owner for Phase 4 ([answer 9](../plans/phase-4-clients.md#the-owners-answers)): yes, on every platform, with a 10 s countdown and Cancel. See the stream's states above.
- **Audio description and commentary tracks:** they're audio tracks with titles; do they need their own labels in the panel?
- **Picture-in-picture** on web and mobile: in M1 of the clients?
