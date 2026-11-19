# Player chrome

- **Platforms:** Web and desktop, mobile, TV.
- **Screen:** `apps/client/src/app/play/[id]/index.tsx` and `start.tsx` (an episode's under `play/episode/[id]/`), which draw `apps/client/src/player/screen.tsx`: `pointer.tsx`, `touch.tsx` and `tv.tsx` by the form factor's input, with the decisions in `parts.tsx`. The music player is `apps/client/src/music-player/`, mounted once by the shell.
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
- **Bottom:** the scrubber with a **trickplay** frame and time over the pointer, and at the position while the scrubber's keys move it (until a second after the last press); Play/Pause, back 10 s, forward 10 s, Mute (in a regular window) with the **Volume** slider opening beside it on hover or focus, "4:12 / 12:00", then **Audio and subtitles**, **Picture in picture** (where the browser has it) and **Full screen** at the right, which reads **Exit full screen** while it is (prototype-gaps stage 4, 2026-11-01).
- **Speed** (the web and desktop, prototype-gaps stage 4): a group at the end of the Audio and subtitles panel, 0.5×, 0.75×, Normal, 1.25×, 1.5× and 2×, for this play only.
- **Picture in picture** (checkpoint 4.2b): the film plays in the browser's own window, through the [Picture-in-Picture API](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API). The button is left out where the browser hasn't got the API (Firefox has its own toggle on the video). While it's out, the frame shows the icon, "Playing in picture in picture" and **Back to this tab**; the chrome stays.
- **Audio and subtitles panel** (right, 22rem, glass): Version (when several), Audio, Subtitles (Off first), then **Subtitle timing** when subtitles are on: − and + in 50 ms steps, the offset ("+100 ms", "On time"), **Reset**, the **live preview line**, and "Subtitles appear 100 ms later. Saved for this movie."
- **A subtitle the server draws into the picture** (checkpoint 4.3a: a Blu-ray or DVD picture track, or a styled ASS track the client can’t draw): the timing section keeps its heading and shows "This subtitle is drawn into the picture, so its timing can’t be changed." in place of − and +; the owner approved it as prototyped on 2026-10-28. Choosing such a track, or leaving it, starts a new stream from where the film is, since the picture itself changes.
- **Subtitles** sit in the lower third and rise above the chrome while it shows.

### Mobile

Landscape, full screen (the prototype turns it a quarter inside the portrait phone frame). A tap shows or hides the chrome: Back and the title at the top with Audio and subtitles at the right; back 10 s, Play/Pause (72pt) and forward 10 s in the middle, in thumb reach; the times and the scrubber at the bottom. The panel is the web's.

**AirPlay (the iPhone app, checkpoint 4.5a):** an AirPlay button sits before Audio and subtitles in the top bar ("AirPlay"; "AirPlay: playing on {device}" while it is, tinted in the accent). It opens iOS's own list of screens (AVRoutePickerView; the prototype draws a stand-in with iPhone and Living room TV, the current one checked). While a film plays on another screen, the chrome stays shown, the picture behind it dims, and the middle says "Playing on {device}" · "The controls here still work. Subtitles show on {device}." Play, Pause, seeking and the panel keep working from the phone. The phone draws no subtitle line then: the TV shows the subtitle the panel chose, from the HLS playlist's subtitle renditions. Prototype: `#/mobile/play/4?airplay=on` (toolbar › **AirPlay**).

**As built (4.5a, approved by the owner on 2026-10-29):** expo-video doesn't give the AirPlay route's name, so the app says "Playing on another screen" · "The controls here still work. Subtitles show on that screen.", and the button's label is "AirPlay: playing on another screen". Audio and subtitles opens as an iOS page sheet rather than the web's side panel, and the player turns with the phone rather than staying in landscape. Every other screen stays upright, so leaving the player in landscape turns the app back (HT-58, 2026-11-18).

**Now Playing (the iPhone app):** the Lock Screen, Control Center and the Dynamic Island show the film's title with its year under it (an episode's show, with "S1, E1 · Pilot"), its poster, the elapsed time and play, pause, back and forward 10 s and scrubbing, through expo-video's `showNowPlayingNotification` (HT-58).

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

Prototyped on all three platforms; the prototype's toolbar picks one under **Stream** on a player, or `?stream=` opens one (`preparing`, `buffering`, `failed`, `stopped`, `next-up`). They're drawn once, in the prototype's `src/client/stream-states.tsx` and the client's `player/parts.tsx`, and each form factor passes its own buttons, so the TV's take the D-pad.

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
- **As built (part E3, 2026-11-15):** the client's episode player has the show's title line, Next episode and Season {n} starts, and "Saved for this episode." **Skip intro** and **Skip credits** aren't built yet: the contract carries the `intro` marks (`api-contract`'s `kinds.ts`), and the buttons come with the TV series phase, which finds the marks on the server.
- **As built (Phase 5's C2, 2026-11-19, ADR 0067):** the server finds the marks (chapters, then the sound a season shares), and the owner can correct them in the admin's episode row. **Skip intro** shows from the intro's start until its last second and seeks to its end; *Skip intros automatically* does that once per intro, so seeking back into it plays it. Next up opens where the credits start (a film's stays its last 10 s) and counts its 10 s from there. After Cancel, **Skip credits** brings Next up back, counting again from that moment; with nothing to come it shows through the credits and seeks to the end. Both are the library's overlay button on the frame's glass with the Next icon, at Next up's place: bottom right, 32 px in and 112 px up with a pointer, above the safe area on touch, at the TV's safe edge, where it takes the focus and gives it back to the scrubber when it goes. Neither shows over the stream's other states or the tracks panel.

### The music player (prototype-gaps stage 3, 2026-11-01)

What stage 2 drew (the bar on the web and desktop, the mini player and Now playing on the phone, Now playing in the TV's head) gains the items below. As built (B3 of the one client platform) it's `apps/client/src/music-player/`, mounted once above the routes so music plays on from page to page, only on a server that serves music; on the TV, Play/Pause on the remote plays and pauses it from anywhere but the film player.

- **The queue:** **Playing from** (the album, artist, playlist, Songs, a search or a single song's album, as a link), the song playing, then **Up next**, each with **Remove** and played from there, and **Clear**. On the web and desktop it's a panel from the bar's queue button; on the phone the sheet from Now playing, reordered by its handles; on the TV a row under the controls, where Remove moves focus to a neighbour.
- **Shuffle and Repeat** on every Now playing. Repeat goes off, the queue, then this song ("Repeat: off", "Repeat: the queue", "Repeat: this song"), pressed while on.
- **Stop:** on the phone in Now playing's ⋯ (with Go to the album and Go to the artist) and by swiping the mini player down; on the TV a button in Now playing. Stop closes the bar or the mini player: "Music stopped".
- **A song's ⋯ menu** on album, artist, Songs and playlist pages: **Play next**, **Add to queue**, **Add to playlist…**, then **Go to the album** and **Go to the artist** where the page isn't already that, and on a playlist's page **Remove from this playlist**. An album's header has the same menu for the whole album. On the TV it's holding OK on a song, or on the album's Play.
- **The artist page's Play** becomes Pause while the artist plays, on the phone as on the web.
- **AirPlay** on the phone's Now playing, as on its film player.
- **Icons:** `@highsea-tv/ui`'s icon set has `repeat`, `repeat-one` and `queue` (Lucide's Repeat, Repeat1 and ListMusic).

## Interactions

| Input | Web | Mobile | TV |
| --- | --- | --- | --- |
| Play / pause | Space, or the button | Tap Play | OK on the scrubber; Play/Pause key anywhere |
| Seek | ← / → 10 s; drag the scrubber | Skip buttons; drag | ← / → on the scrubber |
| Tracks | The button, or the panel | The button | ↓ to Audio and subtitles |
| Close panel / leave | Esc closes the panel, then leaves | Back | Back closes the panel, hides the chrome, then leaves |
| Full screen | F, or the button (Exit full screen while it is) | Always | Always |
| Picture in picture | The button, where the browser has it | — | — |
| Mute | M, or the button in a regular window | The device's buttons | The TV's volume |
| Volume | The slider beside Mute, on hover or focus | The device's buttons | The TV's volume |
| Speed | The Speed group in the panel | — | — |

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

### Shuffle and Play in order (HT-96, 2026-11-19)

Shuffle on a show's page or a collection's page plays its episodes or films in a random order, one after another. A collection's **Play** (the owner's review of 2026-11-19) plays its films in the collection's own order, the order its page lists them, like a playlist. Both run through the same queue.

- **The order** is a uniform shuffle (Fisher–Yates) made once, when Shuffle is pressed, and kept on the device for that sitting: Next and Previous move through it, and nothing comes twice. After the last item it stops: Next up doesn't show, and the last ends as any film does. It never falls back to the show's next episode or More like this.
- **What goes in:** a show's episodes with a file, specials left out unless the show has only specials; a collection's films with a file. Watched ones are in, since shuffle is mostly for watching again.
- **Play in order** starts at the collection's first film with a file and resumes it if it has a saved place, as plain Play does elsewhere (`/play/{id}?queue=1`); the films after it start at their beginning. Next up reads as plain **Next up** with the next film's title. It's offered with one film or more.
- **Each item of a shuffle starts from its beginning,** not its resume point (`/play/{id}/start?queue=1`, `/play/episode/{id}/start?queue=1`); Play elsewhere still resumes. Each is marked watched as normal, for the profile playing.
- **Next up** says **Next in shuffle**, with the next episode's title and "S2, E4", or the next film's title, and counts down as Next up does when Autoplay is on.
- **Previous and Next** show only in a shuffle or a collection's Play: with a pointer after Forward 10 seconds, on touch either side of the centre controls, on the TV as overlay buttons beside Audio and subtitles. Previous is dimmed at the first item, Next at the last.
- **Leaving the player ends the queue,** however it's left (Back to details, the browser's Back, a swipe). A reload on the web loses it; the item plays on alone.
- **Where it lives:** on the client, in memory. The video players hold one item at a time (expo-video's `VideoPlayer` swaps sources with `replace()` and has no queue, https://docs.expo.dev/versions/latest/sdk/video/; the web's `<video>` plays one `src`), so each item takes the player's place in the history, as Next up's already does. No server route.

## Decisions

- **The nudge is 50 ms,** the same step as the admin's subtitle offset ([movies.md](movies.md#decisions)), and it's saved per person and title, not on the track: the admin's offset fixes the file for everyone; this fixes it for you.
- **A preview line, not a test clip.** Moving a bar under a cue shows the direction at once; replaying a line of dialogue is the product's job when real video exists.
- **No skip intro** until intro detection exists (decided here, as the plan asked). Superseded on 2026-11-01 by prototype-gaps stage 2: episodes carry the server's intro and credits marks, so the buttons only show where a mark exists.
- **Mobile is landscape,** like every phone video player; portrait playback isn't designed.
- **Picture in picture is a button on the web** (approved by the owner on 2026-10-27, at the start of 4.2b): Chromium and Safari otherwise offer it only from a menu. To leave it room at 390, Mute shows only in a regular window; phones and tablets have their own volume buttons, and M still mutes.
- **AirPlay is iOS's own picker** (expo-video's `VideoAirPlayButton`), not a list highsea draws: iOS knows the screens and asks for codes. Added on the owner's answer 9 of 2026-10-29 ([phase-4-checkpoint-5.md](../plans/phase-4-checkpoint-5.md#the-owners-answers)).
- **TV keeps Left and Right for seeking** while the scrubber has focus, and moves focus only with Down, so a press of the arrows never leaves the scrubber by surprise.

## Open questions

- **Next up:** answered by the owner for Phase 4 ([answer 9](../plans/phase-4-clients.md#the-owners-answers)): yes, on every platform, with a 10 s countdown and Cancel. See the stream's states above.
- **Audio description and commentary tracks:** they're audio tracks with titles; do they need their own labels in the panel?
- **Picture-in-picture** on web and mobile: in M1 of the clients?
