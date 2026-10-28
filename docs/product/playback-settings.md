# Settings › Playback

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `design/prototypes/src/admin/settings/playback.tsx` (`#/admin/settings/playback`), with its mock in `src/mock/playback.ts`. Prototyped at Phase 4's checkpoint 4.0b, 2026-10-23, and waiting for the owner's approval. In the prototype, Harbor has an Intel GPU whose VAAPI check passed two days ago; **Check** on Quick Sync runs a check that passes; **Prototype only · Fail the next check** makes the next one fail; **Prototype only · Fill the cache** puts the cache over its limit; and the empty server has no hardware.
- **Built:** at 4.1 (transcoding on the processor, the remote ceiling and the cache) and 4.3 (hardware acceleration), on [ADR 0051](../adr/0051-playback-engine.md).
- **Plan:** [phase-4-checkpoint-0.md › Settings › Playback](../plans/phase-4-checkpoint-0.md#settings--playback-admin).

## Purpose

How highsea sends films it has to change for a device, and what it does that with. Most of the time highsea plays a file as it is; this page is about the rest. The hard part for an owner is hardware acceleration in Docker: the graphics chip has to be passed through to the container, and nothing says whether it worked. This page says what highsea found, checks it with a real transcode, and gives the compose lines when it's missing.

## Who sees it

The owner and admins, as every server setting ([phase-4-checkpoint-0.md answer 6](../plans/phase-4-checkpoint-0.md#the-owners-answers)). A User never opens the admin.

## Layout

One page in Settings' **Playback** group, before Downloads and alerts. Four sections, each a settings group with Save and Discard at the bottom of the page, as the other settings pages.

### Hardware acceleration

- **The summary:** "Transcoding with {path} on {device}" when a path is in use; "Transcoding with the processor, for now" when hardware is there but unchecked; "Transcoding with the processor" when there's none; "Hardware acceleration is off. Each transcode takes a processor core or more." when it's turned off.
- **What highsea found:** a row per path: VAAPI, Intel Quick Sync, NVIDIA NVENC and VideoToolbox, each with a line on what it is, the device it found (`/dev/dri/renderD128`, "Intel UHD Graphics 770") or why it can't be used here ("No /dev/dri in the container.", "No NVIDIA GPU in the container.", "Only when highsea runs on a Mac, outside Docker."), and its last check: "Passed · 286 fps · 2 days ago" with what it decodes and encodes, or "Failed" with what went wrong and what to do. **Check** transcodes a short clip (1080p HEVC to H.264) on that path; while it runs, "Transcoding a short clip…".
- **Use:** Automatic (the first path whose check passed), one path, or "The processor only". "highsea never uses one that hasn't" passed its check: an untested path stays off (the Phase 4 plan's risk).
- **Convert HDR for screens that can't show it:** tone mapping, on by default.
- **When nothing is found:** how to give the container the chip, with copyable compose lines for Intel and AMD (`devices: [/dev/dri:/dev/dri]`) and NVIDIA (a device reservation with the `gpu` and `video` capabilities, after NVIDIA's container toolkit on the host), and a link to the guide.

### Transcoding

- **Transcodes at once** (1 to 8, default 3): "More wait until one finishes."
- **Encoder:** Faster, Balanced (the default) or Sharper, with a line on each.

### Away from home

- **The most each stream is sent:** 4 Mbps · 720p, 8 Mbps · 1080p (the default), 12 Mbps · 1080p, high, 20 Mbps · 4K, compressed, 40 Mbps · 4K, or No limit. "Set it below your upload speed, shared by everyone watching at once. People can choose less in their apps." Streams on the owner's own network are never limited.

### Cache

- **Use:** "6.1 GB of 20 GB for transcodes", a bar, and "Over its limit" when it is, with "highsea removes the oldest segments first, from films nobody is watching. Raise the limit if it stays over while people watch."
- **Trickplay:** "Preview images for the scrubber take 12.3 GB. They're kept with each film and don't count towards the limit."
- **Folder** (default `/config/cache/transcodes`; "A fast disk helps. It needn't be backed up.") and **Limit, in GB** (default 20).
- **Clear:** empties the transcode cache; films that are playing make their segments again.

## States

| State | What shows |
| --- | --- |
| No hardware found | Every path unavailable with its reason; the summary says the processor; the compose lines show |
| Hardware found, not checked | The path "Found, not checked", with Check; Automatic still uses the processor. Brief: highsea checks every path it finds by itself when it starts |
| Checked and in use | The path's check passed; the summary names it |
| A check that failed | "Failed", with what ffmpeg reported and what to try (the Intel media driver not loading, a GPU that encodes partway and stops) |
| The cache over its limit | The warning badge, the bar in warning, and the line on what highsea removes |

## Data

- `transcoding.status()` → `GET /api/v1/playback/status`: the paths found, the one in use, the cache. Staff only.
- `transcoding.check(path)` → `POST /api/v1/playback/checks/{path}`; `transcoding.clearCache()` → `DELETE /api/v1/playback/cache`.
- `settings.get('playback')` and `settings.save('playback', …)`, as every settings page.
- Events: `playback.updated` when a check ends or the cache changes.
- The prototype's mock names the namespace `transcoding`, since `playback` is already the clients' positions and picks; the server's names are settled at 4.1.

## Decisions

- **A real transcode decides,** not the device's presence: a render node that's there but unusable (no driver, wrong permissions) is the commonest failure, and only a check finds it.
- **Automatic never uses an unchecked path.** A path that fails mid-film is worse than a slower processor transcode.
- **highsea checks what it finds by itself** (the owner, 2026-10-28, at 4.3b's review): at boot, in the background, every path found without a check on its device and driver is checked, one at a time, so a new install uses its chip without a visit here. Settings › Playback is for seeing the result and changing it. A failed check isn't run again by itself.
- **The remote ceiling is per stream,** not shared: the owner knows their upload speed, and "per stream" is what Plex and Jellyfin ask, so it's what owners coming from them expect.
- **Trickplay isn't in the cache's limit,** since it's made once per film and kept; clearing it would mean making it again.

## Open questions

- **Several GPUs:** pick which render node to use? Left out until someone has one to test.
- **Low-power encoding** (Intel's `low_power` mode): a switch, or decided by the check?
