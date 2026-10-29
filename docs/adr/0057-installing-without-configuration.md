# 0057. Installing without configuration: detect, decide, and leave Settings for changes

- **Status:** Accepted
- **Date:** 2026-10-28

## Context

Until 0.2.0, installing highsea meant editing its compose file before the first start: `PUID` and `PGID` found with `id`, `TZ`, and graphics lines left commented out because `devices: [/dev/dri:/dev/dri]` stops a container on a host without them ("error gathering device information"). Then setup asked nine questions, including a TMDB key. The owner asked on 2026-10-28 for an install that needs none of that ([install-simplicity.md](../plans/install-simplicity.md), approved with the owner's answers of 2026-10-28). Setup asks only what highsea can't find out, and Settings is for changing what it decided.

What the alternatives cost:

- **`devices:` in the default file** breaks every host without `/dev/dri`: Docker Desktop, AMD Ryzen NAS boxes, VPSs.
- **`privileged: true`** hands over every device and capability ([Docker: runtime privilege](https://docs.docker.com/engine/containers/run/#runtime-privilege-and-linux-capabilities)).
- **`gpus:`, `deploy.resources.reservations.devices` with `driver: nvidia`, and `runtime: nvidia`** all fail to start on a host without NVIDIA's runtime ([Compose: GPU support](https://docs.docker.com/compose/how-tos/gpu-support/)). So does a CDI device name without its spec ([Docker: CDI](https://docs.docker.com/engine/daemon/cdi/)).
- **A Docker socket mount** would let highsea look at the host and update itself, but it gives the container root on the host. Watchtower-style self-updating is the same trade.

## Decision

**Graphics are handed over in the default files, as a bind mount with device rules** (part A):

```yaml
volumes:
  - /dev/dri:/dev/dri
device_cgroup_rules:
  - "c 226:128 rw"   # … to "c 226:135 rw": renderD128 to renderD135
```

- A short-syntax bind mount makes a missing source folder ([Docker: bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)), so a host without graphics starts with an empty `/dev/dri`, and highsea uses the processor.
- `device_cgroup_rules` lets the container open the DRM render nodes (major 226, minors 128 to 135), and not the `card*` display nodes, which highsea never needs ([Compose: device_cgroup_rules](https://docs.docker.com/reference/compose-file/services/#device_cgroup_rules)).
- This is in `compose.yaml`, `compose.bridge.yaml`, `compose.dev.yaml`, `compose.e2e.yaml` and the TrueNAS and Synology templates. Unraid's template has a `/dev/dri` Path and the rules in `ExtraParams`.
- **NVIDIA:** the image sets `NVIDIA_VISIBLE_DEVICES=all` and `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility`. Under runc they do nothing. Under NVIDIA's runtime they hand every card and its video libraries to the container ([NVIDIA Container Toolkit: specialized configurations](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)). Compose needs no lines for it. The one step is on the host: `nvidia-ctk runtime configure --runtime=docker --set-as-default` ([install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)). Unraid has a second template, `highsea-nvidia.xml`, with `--runtime=nvidia`, one template per accelerator as Immich's are.
- When an NVIDIA display controller (vendor `0x10de`, class `0x03…`) is in sysfs's PCI list but ffmpeg can't open CUDA, Settings › Playback's NVENC row and System › Health say the host step is missing ([sysfs-pci](https://docs.kernel.org/PCI/sysfs-pci.html)).

**What's detected instead of asked:**

- **The user.** When the container starts as root and `PUID` or `PGID` isn't set, `docker/entrypoint.sh` takes the owner of `/data`. If root owns `/data`, it takes the first thing at `/data`'s top level not owned by root, since a NAS's shared folder is often root's with the user's folders inside. If root owns everything, or `/data` is empty, it falls back to 1000:1000. A value that's set wins, and the log's first line says which user it chose and why. `scripts/image.ts user` checks five cases on the built image in CI. Two templates still set the user, since detection would guess wrong there: Unraid (99:100, `nobody:users`; a share Docker makes for a missing path is root's) and TrueNAS (568, `apps`; the Apps preset grants it through an ACL on a dataset root owns).
- **The time zone.** Setup takes it from the browser and saves it as General's time zone (part B). When Docker gave no `TZ`, the server entry hands the runtime `followTimeZone`, which sets `process.env.TZ` to General's zone at boot and when it's changed. Node reads a `TZ` set while it runs ([Node: TZ](https://nodejs.org/api/cli.html#tz)). A `TZ` that's given wins for the process, and General's zone still decides the schedules.
- **Hardlinks.** Once setup is done, the runtime makes a real hardlink from the downloads folder into each movies folder, then removes it, once per pair while it runs (`hardlinkIssues` in `packages/runtime/src/system.ts`). `EXDEV`, `EPERM`, `ENOTSUP` or `EOPNOTSUPP` from link(2) becomes a warning on Health before the first import ([link(2)](https://man7.org/linux/man-pages/man2/link.2.html)). A real link, not `st_dev`, because a FUSE union such as Unraid's `/mnt/user` reports one device and may still refuse.
- **The server's name, folders and address** are found as setup opens, and its Review shows them with a Change each (part B, [setup.md's 2026-10-28 section](../product/setup.md)).
- **No TMDB key is asked for.** Release images carry highsea's own key, built in from the `release` environment, as the OpenSubtitles.com and Trakt keys are (part B, ADR 0050's dated section). A build from source reads `HIGHSEA_TMDB_READ_TOKEN` from its environment.
  - **In the image:** the Dockerfile mounts the `tmdb` build secret (`--mount=type=secret,id=tmdb,required=false`) and installs it as `/usr/share/highsea/tmdb-read-token`, which `HIGHSEA_TMDB_READ_TOKEN_FILE` names. A secret mount never lands in a layer or the build's history ([Docker: build secrets](https://docs.docker.com/build/building/secrets/)). A build without the secret installs no file.
  - **The owner's key wins:** `@highsea-tv/metadata` uses the owner's sealed key when there is one, and highsea's otherwise. Settings › General › Metadata shows **highsea's key** until the owner adds theirs, and Remove goes back to it.
  - **With neither key**, as in a source build without the variable, System › Health warns that Discover, adding movies and refreshing details don't work.
  - **TMDB's terms:** highsea's key is used under TMDB's API terms for an application, with the attribution highsea already shows in System › About ([TMDB API Terms of Use](https://www.themoviedb.org/api-terms-of-use)).

**Not done:** no Docker socket and no self-updater. Updates stay the owner's, through Docker, a NAS's app store, or a pinned tag (ADR 0050). The stores highsea lists in, and the Linux installer at `get.highsea.tv`, are part C's, recorded in ADR 0050's 2026-10-28 section on the stores. Each listing hands over the graphics the store's own way (TrueNAS's `resources.gpus`, Umbrel's `GPU` permission), keeps downloads and the library in one folder, and asks nothing highsea finds by itself.

## Consequences

- A new install is a compose file with no edits. The only thing an owner might change is where their films are, and the defaults (`./data`, `/volume1/data`, `/mnt/tank/data`, `/mnt/user/data`) are each platform's usual place.
- The device rules are new ground: none of Jellyfin, Plex, Immich or linuxserver.io ships them. On cgroup v2, runc turns them into an eBPF device filter. That's community evidence, not Docker's docs, so the checks on real hosts (the owner's DS1520+, TrueNAS and Unraid) confirm them, and their results are recorded in the plan.
- Rootless Docker and Podman can't open a device the user running them doesn't own; the hardware guide says so.
- On a host without `/dev/dri`, Docker makes an empty `/dev/dri` folder on the host. That's harmless, and it's what the short syntax documents.
- Detection guesses the user from files. A `/data` whose top level mixes owners takes whichever `find` meets first that isn't root; the log says which, and `PUID` and `PGID` override it.
- The hardlink check writes and removes one empty file, `.highsea-link-check-<pid>`, in the downloads folder and each movies folder, once per start.
