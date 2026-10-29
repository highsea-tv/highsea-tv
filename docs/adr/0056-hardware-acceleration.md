# 0056. Hardware acceleration: four paths, each used only once a check on this host passes

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Checkpoint 4.1 made transcodes on the processor with libx264 (ADR 0051). A NAS's processor makes 1080p in about real time at best, and 4K HDR not at all, so Phase 4's checkpoint 4.3 adds the graphics chip ([phase-4-checkpoint-3.md › Hardware acceleration](../plans/phase-4-checkpoint-3.md#hardware-acceleration-43b)). Settings › Playback was prototyped and specified in 4.0b (docs/product/playback-settings.md): what highsea found, a Check per path, Use (Automatic, a path, or the processor only), and Convert HDR.

What constrains it:

- **Hardware differs from machine to machine.** The same path passes on one Intel generation and fails on another, drivers change with Debian's updates, and a container may see a device it can't open. Nothing here runs in CI on a GPU.
- **The segments must line up.** 4.1's playlist is known before anything is made: a keyframe every 6 s and no scene cuts between (ADR 0051's 2026-10-27 section). A GPU encoder must keep that, or seeking breaks.
- **Most homes run highsea in Docker** (ADR 0003), as PUID:PGID, on amd64 NAS boxes with Intel graphics, the owner's DS1520+ (a J4125) among them.

What the servers highsea replaces do: Jellyfin and Plex offer VAAPI, QSV, NVENC and VideoToolbox, chosen by the owner, and fall back to the processor when a transcode fails on the chip. Jellyfin's own image carries its own ffmpeg and Intel's drivers.

## Decision

**Four paths** (`@highsea-tv/stream/hardware`, pure; the runtime's `hardware.ts` does the looking and running): VAAPI (Intel and AMD on Linux), Intel Quick Sync, NVIDIA NVENC, and VideoToolbox (a Mac, outside Docker, the owner's answer 4).

**Detection**, at boot in the background and again before each check, from what ffmpeg itself reports rather than a separate tool:

- `ffmpeg -encoders` and `-filters`, for what this ffmpeg can do. A path whose encoder is missing says so.
- VAAPI and QSV: the first render node in `/dev/dri` (`renderD128` and on), opened with `-init_hw_device vaapi=va:<node>` at `-v verbose`, whose "VAAPI driver:" line names the driver ([ffmpeg's VAAPI wiki](https://trac.ffmpeg.org/wiki/Hardware/VAAPI)). QSV is offered only for Intel's iHD driver ([ffmpeg's QuickSync wiki](https://trac.ffmpeg.org/wiki/Hardware/QuickSync)): i965 and Mesa say why not.
- NVENC: `-init_hw_device cuda` succeeding, with the GPU's name from `nvidia-smi`, which NVIDIA's container toolkit provides with the `video` capability ([NVIDIA › Specialized configurations with Docker](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)).
- VideoToolbox: macOS, outside Docker (`/.dockerenv`), and `-init_hw_device videotoolbox` succeeding ([ffmpeg's HWAccelIntro](https://trac.ffmpeg.org/wiki/HWAccelIntro)).

**The check decides.** A check transcodes a 10 s 1080p HEVC Main 10 HDR10 clip, made once into the data folder's `hardware/` with libx265, to H.264 on the path, timed for its frames a second. Intel's low-power encoder is tried first and then without, and the one that worked is kept: that answers the spec's open question without a switch. Then the same again with the path's tone mapping, where this ffmpeg has its filters. Results are kept in the settings table under `playback.hardware`, with the device and driver they ran on: a check on another device or driver is forgotten. **Automatic uses the first path whose check passed, in the order above, and never one that hasn't**; a path chosen by name is used once its check passes. **highsea checks what it finds by itself** (the owner, 2026-10-28, at 4.3b's review): at boot, after detection and in the background, every path found without a check on its device and driver is checked, one at a time (`checkNew`), so a new install, or a new chip or driver, uses the GPU without a visit to Settings › Playback, which is left for seeing the result and changing it. Only paths without a check are checked, so a server that merely restarts loads no GPU, and a failed check isn't run again by itself; Check (Check again) runs one at any time. ffmpeg's errors become sentences (can't open `/dev/dri`, Quick Sync on a chip older than Tiger Lake, the media driver didn't load, no NVIDIA GPU, timed out, or ffmpeg's last line).

**Command lines per path** (`deviceArgs`, `gpuFilters` and `encoderArgs`, beside 4.1's in `hls/args.ts`), each from ffmpeg's documentation for the path:

- Decode on the device, with frames kept there (`-hwaccel vaapi|cuda|videotoolbox` and `-hwaccel_output_format`). QSV on Linux decodes with VAAPI and maps the frames (`hwmap=derive_device=qsv`), the QuickSync wiki's interop.
- Scale on the device: `scale_vaapi`, `vpp_qsv`, `scale_cuda`, `scale_vt` ([ffmpeg-filters](https://ffmpeg.org/ffmpeg-filters.html)).
- Encode H.264 (`h264_vaapi`, `h264_qsv`, `h264_nvenc`, `h264_videotoolbox`; [ffmpeg-codecs](https://ffmpeg.org/ffmpeg-codecs.html)) with the bitrate capped as libx264's is, High profile, the level as a number every encoder takes, and the encoder's speed for each of Settings' three presets. **Keyframes come from `-force_key_frames` at every 6 s with `-g` set out of the way,** and each encoder's own scene cuts and lookahead off (`-forced_idr`, `-no-scenecut`), so the segments are 4.1's to the frame.
- Output colour flags make ffmpeg add an automatic scale, which can't take GPU frames, so on the GPU the frames are labelled bt709 with `setparams` in the graph instead.
- A picture subtitle is drawn on the processor: the frames are downloaded, overlaid and uploaded again. A 10-bit picture downloads as `p010le`, then converts.

**Tone mapping**, on by default (Convert HDR):

- Intel: `tonemap_vaapi` for PQ, or `vpp_qsv`'s tonemap, which needs the frames' HDR metadata ([ffmpeg-filters › tonemap_vaapi](https://ffmpeg.org/ffmpeg-filters.html#tonemap_005fvaapi), [vpp_qsv](https://ffmpeg.org/ffmpeg-filters.html#vpp_005fqsv)). HLG goes to the processor.
- NVIDIA and AMD: `libplacebo` on Vulkan ([ffmpeg-filters › libplacebo](https://ffmpeg.org/ffmpeg-filters.html#libplacebo)), which reads HDR10, HLG and Dolby Vision, profile 5 included. AMD maps VAAPI frames to Vulkan and back; NVIDIA downloads the frames after `scale_cuda`, and libplacebo uploads them to its own Vulkan device.
- VideoToolbox: `scale_vt`'s colour conversion, everything but Dolby Vision profile 5.
- The processor: `zscale` and `tonemap` (Hable), slower, for what the path can't do. Without `zscale` (Homebrew's ffmpeg) it's left as it is, with 4.1's "looks washed out" reason.
- The decision's reason changes from "looks washed out" to "Converted from HDR to SDR for this screen" (ADR 0052).

**A run that fails on the chip** goes on on the processor from the segment it had reached, with a reason in Now playing ("The graphics chip failed partway, so the processor makes the rest"), and the path's check is marked failed, so Automatic stops using it until it's checked again.

**The image** (ADR 0003's 2026-10-28 section), on amd64 only: `intel-media-va-driver-non-free` (from Debian's non-free component, added for it alone, so chips before Ice Lake encode without the HuC firmware loaded on the host: [Intel's media driver README](https://github.com/intel/media-driver#build-types)), `libmfx-gen1.2` and `libvpl2` for Quick Sync (oneVPL's GPU runtime, which starts at Tiger Lake: [vpl-gpu-rt](https://github.com/intel/vpl-gpu-rt). Media SDK's runtime for older chips, `libmfx1`, isn't in trixie, so on them Quick Sync's check fails with its own sentence and VAAPI does the work, as on the owner's DS1520+), `mesa-va-drivers` for AMD, and `mesa-vulkan-drivers` for libplacebo (the owner's answer 3). Debian's ffmpeg already has every encoder and filter above. NVIDIA's libraries come from the host through the toolkit. `scripts/image.ts hardware` checks the built image's encoders, filters and driver files in CI.

**Handing the device to the container:**

- Intel and AMD: `devices: [/dev/dri:/dev/dri]`. The entrypoint adds the PUID user to each render node's group, whatever the host numbered it, and switches user with `setpriv --init-groups` then, since gosu given `uid:gid` drops every other group, and a compose file's `group_add` reaches only the container's first process ([setpriv(1)](https://man7.org/linux/man-pages/man1/setpriv.1.html)).
- NVIDIA: a device reservation with `driver: nvidia` and `capabilities: [gpu, video]` ([Docker › GPU support in Compose](https://docs.docker.com/compose/how-tos/gpu-support/)), after NVIDIA's container toolkit on the host.
- The compose files and NAS templates carry these lines commented out, and Unraid's template an optional device.

## Consequences

- A path is only ever used after a real transcode has passed on this host, so a driver or a generation that misbehaves costs a failed check, not a failed film. A failure mid-film costs the processor's start on the next segment, not the film.
- The image grows about 134 MB on amd64, and its budget rises from 2,200 MB to 2,300 MB.
- One package in the image is non-free in Debian's terms: its source is open, but some GPU kernels come from Intel as binaries. docker/NOTICE says so.
- Command lines are tested as snapshots, and VideoToolbox's and the processor's runs with real ffmpeg where it's present. VAAPI and QSV are checked by hand on the owner's NAS; NVENC and AMD weren't checked on real hardware at 4.3b and stay off unless their check passes on the owner's host.
- Not done: HEVC and AV1 output (the clients play H.264 everywhere), decoding on one device and encoding on another, more than one GPU (the first render node is used), and a check that reruns by itself after a driver update.

## 2026-10-28: the handover is on by default (checkpoint 4.3c, ADR 0057)

The Decision's "Handing the device to the container" is replaced by ADR 0057's:

- **Intel and AMD:** the compose files and the TrueNAS and Synology templates hand over `/dev/dri` as a bind mount, with `device_cgroup_rules` for the render nodes 226:128 to 226:135, uncommented. A host without graphics starts with an empty folder, and highsea reports the processor. Unraid's template has the same as a Path and `--device-cgroup-rule` in `ExtraParams`. The entrypoint still adds highsea's user to each render node's group. `devices: [/dev/dri:/dev/dri]` still works where the device exists.
- **NVIDIA:** nothing in compose. The image sets `NVIDIA_VISIBLE_DEVICES=all` and `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility`, and the host makes NVIDIA's runtime Docker's default. Unraid has `highsea-nvidia.xml`, with `--runtime=nvidia`.
- **Detection:** when CUDA doesn't open but sysfs lists an NVIDIA display controller, NVENC's reason names the host step (`unavailable.nvidiaHost`), and System › Health shows it as a notice under Playback. The check's own NVIDIA message now names the default runtime in place of "give the container the GPU".
