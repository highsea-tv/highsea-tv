# Follow-up plan: installing highsea with nothing to configure

- **Status:** Requested by the owner on 2026-10-28, at 4.3b's review. Scoped the same day from research, and approved the same day with the owner's answers below: every recommendation but one (highsea ships its own TMDB key). A to C are built as checkpoint 4.3c after 4.3b's sign-off, starting with the new setup's prototype; D follows; E goes into 4.4–4.6; F waits for 1.0. Nothing is built yet.
- **Gate:** each part below is built, reported and signed off on its own, as for any checkpoint. Any change to the setup wizard's locked layout is prototyped and approved first.
- **Owner's direction (2026-10-28):** "the installation and setup process should be as automatic as possible, and if possible, a user shouldn't even have to make any changes to their docker files or compose. things like hardware passthrough (gpu, etc). the setup should, ideally, just work 'out of the box'. i think it would be a worthwhile investment to consider creating all-in-one 'apps' for things like Synology, TrueNAS, etc as well." This covers the server and the client apps. At the same review the owner had highsea check graphics by itself in the background (built in 4.3b: `checkNew`, ADR 0056), and that is the pattern here: highsea detects and decides, and Settings is only for changing what it decided.

## Read first

1. `CLAUDE.md` and [docs/roadmap.md](../roadmap.md).
2. [phase-4-clients.md](phase-4-clients.md), for where the client apps' checkpoints stand, and [phase-4-checkpoint-3.md](phase-4-checkpoint-3.md) (4.3b's hardware work this builds on).
3. [ADR 0056](../adr/0056-hardware-acceleration.md) (hardware acceleration and how the chip is handed over), [ADR 0003](../adr/0003-server-runtime-custom-entry.md) (the image), [ADR 0020](../adr/0020-discovery-port.md) (discovery), [ADR 0050](../adr/0050-release-and-versioning.md) (releases and channels).
4. What ships today: `compose.yaml`, `compose.bridge.yaml`, `templates/` (Unraid's XML, TrueNAS's and Synology's compose), `docker/entrypoint.sh`, and the install guides in `apps/docs/content/install/`.
5. The setup wizard: `docs/product/setup.md`, `design/prototypes/src/admin/setup/` and `apps/server/src/admin/setup.tsx`.

## Goal

When this is done, someone installing highsea on a NAS or a Linux machine:

- **installs it from their system's own app store** where one exists (Unraid's Community Applications, TrueNAS's catalog, Umbrel, CasaOS), or from a Synology package, or with one copied command. They never edit a compose file;
- **gets their graphics chip used without asking.** The default compose file and every template already hand Intel and AMD graphics to the container where the host has them, and start cleanly where it doesn't. NVIDIA needs one step on the host, NVIDIA's own, and nothing in highsea's files;
- **answers only what highsea can't know** in setup: who the owner is, and where the films are when highsea can't find them. The rest is filled in from the host and the browser, and can be changed later in Settings;
- **connects the apps without typing an address** on the same network, and pairs a TV from their phone.

## Out of scope

- **Running without Docker on a NAS.** Native NAS packages (Plex's and Emby's way) need ffmpeg, Node and drivers built for each NAS's system. The container route is what Jellyfin and Immich ship officially. Native packages wait until there's demand.
- **Native installers for the server on Mac, Windows and Linux.** They're recommended below for after 1.0, not built here. Phase 4's desktop app (4.4) is the *client*.
- **Anything that needs highsea's own cloud:** the relay, a `*.highsea.tv` certificate per server, finding servers across networks, push. These belong with the optional Connect relay ([roadmap](../roadmap.md), Phase 4's later items).
- **A TMDB proxy on highsea's servers.** The key ships in the image instead (the owner's answer 7).
- **QNAP, Runtipi, Cosmos, YunoHost and Home Assistant.** The reasons are under [Other platforms](#other-platforms-later-or-never).

## Where things stand

- **The image** (`ghcr.io/highsea-tv/highsea`, amd64 and arm64) runs as `PUID:PGID`. Its entrypoint (`docker/entrypoint.sh`) adds that user to the group of each `/dev/dri/renderD*` passed through, whatever the host numbered it. The drivers for Intel, AMD and NVIDIA's userspace are in the image (ADR 0056).
- **Hardware is checked by itself.** At boot highsea finds each path and checks any that have no check for the current device and driver. It then uses the first that passed (`packages/runtime/src/hardware.ts`, `checkNew`). What's left for the user is handing the chip to the container.
- **`compose.yaml` leaves the GPU commented out.** `devices: - /dev/dri:/dev/dri` makes the container fail to start on a host without that device. The NVIDIA `deploy` block fails on a host without NVIDIA's runtime. Each needs an edit. It also asks for `PUID`, `PGID` and `TZ`.
- **The templates** have the same gaps:
  - Unraid's (`templates/unraid/highsea.xml`) has a `Type="Device"` entry defaulting to `/dev/dri`, which probably breaks hosts without an iGPU (unconfirmed);
  - TrueNAS's and Synology's are compose files to paste.
  - None is listed in a store. The Unraid template's submission to Community Applications was left open at 0.1.0.
- **Setup** has nine steps: name, owner, metadata (the TMDB key), folders, indexers, subtitles, remote, cloud, review. Folders are already suggested from what's mounted.
- **Discovery** answers on UDP 7368 and advertises `_highsea._tcp` over mDNS (`packages/network`). In bridge mode its replies carry the container's address, which apps can't reach.
- **Pairing** a TV or app is already a device code (RFC 8628, ADR 0024). UPnP and NAT-PMP port mapping exist for the torrent engine (`packages/torrent/src/portmap.ts`).

## The parts

Six parts. A to C are server work, built as one checkpoint, 4.3c, after 4.3b's sign-off and before the desktop app (answer 1). D is a Synology package. E folds into Phase 4's client checkpoints. F is after 1.0.

| Part | What | Size | Depends on |
| --- | --- | --- | --- |
| **A** | The compose file and templates work with no edits, GPU included | 3–4 days | the DS1520+ and VMs for a check (answer 12) |
| **B** | highsea detects what setup used to ask, and setup shrinks | 1 week, and a prototype first | A; the owner's approval of the new setup |
| **C** | Store listings: Unraid, TrueNAS, Umbrel, CasaOS, and `install.sh` | 1–2 weeks, plus each store's review | A |
| **D** | A Synology package (SPK) that runs the container | 1–2 weeks | A |
| **E** | The apps find, pair and update without typing | spread across 4.4–4.6 | B's advertised address |
| **F** | Native server installers (macOS first) | weeks each, after 1.0 | — |

## Progress

- **2026-10-28, 4.3c, the new setup's prototype, approved by the owner on 2026-10-28:** `design/prototypes/src/admin/setup/setup.tsx` is rewritten as B describes. With everything found, the steps are Owner account and then Review, with Media folders only when highsea found none. Review shows what highsea decided, and each line has an editor in place. The mock adds `setup.detect` (`mock/server.ts`, `SetupDetected` in `mock/types.ts`), and the toolbar's Populated and Empty show the two cases. At review the owner had the TMDB key step removed (the owner's change 1) and the password fields lined up; both are done and checked again. The spec's dated section in [docs/product/setup.md](../product/setup.md) lists every change. Checks: three new setup flows in `test/flows.test.tsx` (1,021 prototype tests pass), the admin page sweep clean (928 pages), and a walk of each step and editor in three themes at 1440, 768 and 390 clean (axe and overflow). Nothing in `apps/server` has changed.

- **2026-10-28, 4.3c, part A built** (waiting for the checks on TrueNAS and Unraid, and the owner's review at 4.3c's gate):
  - **Compose files and templates:** `compose.yaml`, `compose.bridge.yaml`, `compose.dev.yaml`, `compose.e2e.yaml` and the Synology and TrueNAS templates hand over `/dev/dri` as a bind mount, with `device_cgroup_rules` for 226:128 to 226:135. `PUID`, `PGID` and `TZ` are commented out as optional overrides, here and in `compose.connects.yaml` and `compose.gluetun.yaml`. Unraid's `highsea.xml` has a `/dev/dri` Path and the rules in `ExtraParams`. The new `highsea-nvidia.xml` runs `--runtime=nvidia`, with the two NVIDIA variables. Two templates keep the user set, because detection would guess wrong there: Unraid (99:100; a share Docker makes for a missing path is root's) and TrueNAS (568; the Apps preset grants it through an ACL on a dataset root owns).
  - **The image:** the `Dockerfile` drops `PUID=1000 PGID=1000` and sets `NVIDIA_VISIBLE_DEVICES=all` and `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility`. When the container starts as root without `PUID` or `PGID`, `docker/entrypoint.sh` takes them from `/data`'s owner, else from the first thing at its top level not owned by root, else uses 1000:1000, and logs its choice. `scripts/image.ts user` checks five cases on the built image, and `ci.yml` runs it after `hardware`.
  - **The runtime:**
    - `hardlinkIssues` (`packages/runtime/src/system.ts`) makes a real link from the downloads folder into each movies folder once per start, and Health warns "Imports into … will be copied" before the first import.
    - `followTimeZone` makes the process take General's time zone when Docker gave no `TZ`; the server entry passes it.
    - An NVIDIA card in sysfs's PCI list that ffmpeg can't open gives NVENC the reason `unavailable.nvidiaHost`, shown as a notice on Health under Playback. The check's NVIDIA message now names the default runtime.
  - **Guides:** `install/docker.mdx`, `synology.mdx`, `truenas.mdx` and `unraid.mdx` lose their editing steps. `install/hardware-acceleration.mdx` keeps NVIDIA's host step and the troubleshooting. `settings/general`, `media-management/importing` and `system/health` follow. They say 0.2.0-beta.3. Setup's steps in `install/docker.mdx` wait for part B.
  - **ADRs:** 0057, and dated sections in 0003 and 0056.
  - **Checked on the DS1520+ over SSH (answer 12):** the amd64 image from this checkout was loaded straight onto the NAS, and the Synology template ran as a test project in `/volume1/docker/highsea-test`, with only its image, name, data folder and port changed.
    - Container Manager's Docker 24.0.2 accepted the device rules.
    - The entrypoint chose 1026:100, the DSM user, with no `PUID`.
    - The boot-time check passed VAAPI through the rules at 136 frames a second, tone mapping on the GPU. Quick Sync failed with its Tiger Lake sentence, as in 4.3b.
    - `card0` was refused ("Operation not permitted"), and sysfs's PCI list was readable.
    - Run read only (`:ro`) on the real `/volume1/data`, the entrypoint would choose 1026:65541: root owns the share, and `media`'s group is the NAS's `highseatv` group.
    - The test project, its image and its folder are deleted, and the owner's containers and `/docker/acme` are untouched.
  - **Checks under Node 26.11.1:** lint (1,342 files), typecheck, 11,769 tests pass (8 skipped, 206 files), the guides' tests (738), `image.ts user` on `highsea:dev` and `highsea:amd64`, `image.ts size` (2,287 MB of 2,300), and the end-to-end run through the image on the new defaults, on a Docker without graphics (Docker Desktop).
  - **Found and fixed:** `image.ts size` read the image's size before running a container, and Docker's containerd image store reports the compressed size until then. A fresh image measured 509 MB against its true 2,287, so the size check could pass any image. It now measures after its `du` run.
  - **Checked on TrueNAS SCALE 25.10.7 (answer 3):** installed from its published ISO (sha256 checked) in an x86 VM under QEMU on this Mac, with a pool `tank` on a second disk and Apps on it (Docker 28.3.1). `tank/apps/highsea` and `tank/data` were made with the Apps preset, the amd64 image from this checkout was loaded and tagged as `latest`, and the TrueNAS template went in unchanged through `app.create` with `custom_app`, which is the call behind Install via YAML.
    - The app reached RUNNING with all eight device rules, the `/dev/dri` bind mount (an empty folder, since the VM has no graphics) and both datasets.
    - `node` runs as 568 (TrueNAS's `apps`), under tini as root, and the config files are 568:568. highsea migrated, answered discovery on 7368 and sent `/` to `/setup`.
    - Found: mDNS can't bind on TrueNAS. Its avahi-daemon is set to `disallow-other-stacks=yes`, which avahi-daemon.conf(5) says stops any other process binding UDP 5353. Apps find highsea there by the broadcast only. The template's comment said both, so it now says so. highsea still logs "advertising over mDNS" after the bind fails, with ciao's stack traces before it; see the report.
    - Found: `useradd` warns that uid 568 is outside `UID_MIN` to `UID_MAX`. It's harmless, but it's the first line an owner sees in the log.
    - The VM is kept, shut down, in the session's scratchpad for part B's setup check.
  - **Checked on Unraid 7.3.4 (answer 3 after the TrueNAS check):** booted in an x86 VM under QEMU from the owner's USB stick, passed through for its trial, with the stick backed up first. The array used only a VM disk. The amd64 image was tagged as `latest` and the template went in through dockerMan's own `docker run` command (its Apply always pulls the published image), in bridge mode.
    - highsea published through Unraid's avahi (`via: avahi`); Unraid's `avahi-browse` resolved it at `Unraid.local` port 3000 with its TXT record.
    - `node` and `avahi-publish` run as 99 (`nobody`), the config files are 99:100, `useradd` no longer warns, and `/` sends to `/setup`.
    - Afterwards the container and template were removed, Unraid was powered down, and the stick was restored file for file from the backup (rsync with `--delete`, then compared). That brought back the stick's own earlier `my-highsea.xml`, which the cleanup had removed.
  - **Built from the answers after the TrueNAS check:**
    - **mDNS through the host's avahi** (ADR 0020's 2026-10-28 section): `chooseResponder` in `packages/network/src/mdns.ts` uses `avahi-publish` (from `avahi-utils`, now in the image and `docker/NOTICE`) when the container has `/run/dbus`. It falls back to highsea's own responder when avahi doesn't publish. Without the bus, highsea checks it can share UDP 5353 before starting ciao, and otherwise logs one plain warning. With seven new tests.
    - The TrueNAS, Unraid and Synology templates and `compose.yaml` mount `/run/dbus:/run/dbus:ro` (Unraid's as an advanced **D-Bus** path); `compose.bridge.yaml` has it commented out for Docker Desktop. The install guides and Settings › Network's guide say so.
    - **`useradd`'s warning:** the entrypoint passes `-K UID_MIN=1 -K UID_MAX=2147483647` (useradd(8)), so TrueNAS's 568 and Unraid's 99 start quietly.
    - Rechecked on TrueNAS with the new image and template: `via: avahi`, and `avahi-browse` resolved `truenas.local` port 3000 over IPv4 and IPv6. Rechecked on the DS1520+ the same way as before, with the Synology template and a test folder of its own: `via: avahi` on DSM's bridge, `avahi-publish` as 1026, and the Mac's `dns-sd -L` resolved `highseatv.local.:3000`. The test project, image and folder were deleted.
    - Known limit: on a bridge, avahi advertises the container's port 3000, so a different host port gives a record with the wrong port.
  - **Found and fixed:** the prototypes' sweeps left their `vite preview` running after a run, since `bunx` starts it in a process group of its own that the stop couldn't reach (`servePrototypes` in `scripts/sweeps/lib.ts` now runs Vite's binary directly).
  - **The owner's answers on part A (2026-10-28):**
    1. The group chosen on a share whose top level mixes groups (1026:65541 on the DS1520+'s `/volume1/data`) stays as built. `PUID` and `PGID` override it.
    2. **Approved:** Settings › Playback's help when nothing is found now matches ADR 0057, in the admin (`playback.tsx`, `playback-messages.ts`) and its prototype. It has the bind mount with its device rules under "Compose lines for Intel and AMD", and `nvidia-ctk runtime configure --runtime=docker --set-as-default` with a restart of Docker under "Commands for NVIDIA, on the host". Its sentence now says highsea's compose files already pass Intel and AMD graphics through. The spec (`playback-settings.md`), the guide and its screenshot follow.
    3. TrueNAS and Unraid are checked in VMs on this Mac, as the plan says.
    4. The guides say 0.2.0-beta.3, the version prepared at 4.3c's gate.
  - **The owner's answers after the TrueNAS check (2026-10-28):**
    1. **Changed by the owner:** where another mDNS stack holds port 5353 (TrueNAS's avahi), highsea also publishes through the host's avahi over D-Bus, rather than only logging that it can't. The log says plainly what happened either way.
    2. The entrypoint silences `useradd`'s warning for a uid outside `UID_MIN` to `UID_MAX`.
    3. Unraid is checked in a VM booted from a spare USB stick that the owner provides, using the trial and the owner's Unraid.net sign-in.
- **2026-10-28, 4.3c, part B built** (waiting for the owner's review at 4.3c's gate):
  - **Setup** (`apps/server/src/admin/setup.tsx`, `setup-messages.ts`) is ported from the approved prototype. It has Owner account, then Media folders only when highsea found none, then Review, whose lines open their editors in place. The progress kept in the browser leaves out the password and the owner's key, as before. A draft from the nine-step setup starts again. The forced changes from the prototype are listed in [setup.md's as-built section](../product/setup.md#as-built-in-43cs-part-b-2026-10-28).
  - **The API:**
    - `GET /api/v1/setup/detect` (public until setup is done) returns `{ serverName, folders, address, graphics }`.
    - `SetupInput` gains `timeZone` and `address`, and `cloudLink` is optional.
    - `MetadataSettings.key` gains `builtIn`.
    - `checkMetadataKey` stays, unused by the screen, so a key can still be checked on its own.
  - **What highsea finds** (`packages/runtime/src/setup.ts`): `detectServerName`, `detectFolders` and `detectAddress`, with `isAddress` checking the address on Finish. Setup keeps the time zone as General's and the address as its own setting, which leads `localAddresses` (ADR 0020's section). `HIGHSEA_PUBLISHED_URL` overrides the address.
  - **highsea's TMDB key:**
    - The Dockerfile installs the `tmdb` build secret as `/usr/share/highsea/tmdb-read-token` (`HIGHSEA_TMDB_READ_TOKEN_FILE`), and `release.yml` passes it and requires it on a real run.
    - `@highsea-tv/metadata` falls back to it when the owner has no key of their own.
    - Settings › General › Metadata shows **highsea’s key**, and its Remove goes back to it.
    - Health warns when there's no key from anywhere.
    - `catalog/keys/README.md` lists the secret.
  - **The router:** the network service asks the router for the HTTPS port with the torrent engine's mapper, for TCP only (its new `protocols` option). It does so only when remote access is by a forwarded port with highsea's HTTPS: at boot, on Finish and on Settings › Network's save. It's let go on a change and at shutdown. Health says whether it worked.
  - **Guides:**
    - `install/docker.mdx`'s Run setup is rewritten, with a new screenshot, `setup-owner.png`, which replaces `setup-name.png`.
    - The Synology, TrueNAS and Unraid guides say setup finds the folders.
    - `prerequisites.mdx` makes TMDB optional.
    - `settings/general/metadata.mdx` explains highsea's key.
    - `movies/index.mdx`, `root-folders.mdx` and `manual-import.mdx` no longer say a key of your own is needed.
  - **ADRs:** 0057's key in detail, and dated sections in 0020 (the address and the router) and 0050 (the secret).
  - **Tests:**
    - `apps/server/test/setup-screen.test.tsx` (14), which replaces the old setup tests in `library-settings.test.tsx`;
    - route tests for detect, the time zone, the address and the missing key;
    - `packages/runtime/test/network.test.ts` (3), for the router with a fake mapper;
    - the detection helpers in `setup.test.ts`;
    - the key file and `HIGHSEA_PUBLISHED_URL` in `runtime.test.ts`.
  - **Found and fixed:** boot makes the transcode cache, `/data/transcodes`, so an empty `/data` didn't look empty to the folder detection. It now ignores that folder, as it does `lost+found`.
  - **The server sweep** (`scripts/sweeps/server.ts`) now visits the owner step, Review, each of Review's seven editors open and the folder picker, instead of the nine old steps.
  - **Checks under Node 26.11.1:**
    - lint (1,344 files) and typecheck are clean;
    - 11,794 tests pass and 8 are skipped, across 208 files, after the contract fixture gained `builtIn`;
    - the guides' tests (738) and the docs build pass;
    - the server sweep is clean on the production build.
    - The smoke test, licences, audit and the prototype sweeps wait for 4.3c's report.
- **2026-10-28, 4.3c, part C built in the repository** (submissions held for the owner; waiting for the owner's review at 4.3c's gate):
  - **`install.sh`** (`apps/docs/public/install.sh`, with `install.sh.sha256`), modelled on Tailscale's: everything in `main()`, POSIX sh, shellcheck clean. It checks Docker, Compose and the daemon, never installs them and links Docker's own instructions. It looks for `/dev/dri`, and for an NVIDIA card with or without NVIDIA's toolkit, naming `runtime: nvidia` when the toolkit isn't Docker's default. It refuses a container called highsea from another folder, and something else on port 3000. It writes `compose.yaml` to `/opt/highsea` (`--dir`), with the data folder (`--data`) made the owner's, so the entrypoint picks them (ADR 0057). Then it pulls, starts, waits for healthy and prints the LAN address. Run again, it keeps the compose file and updates. `--version`, `--no-start`, `--print-compose`.
    - Tested in Docker-in-Docker (Alpine, BusyBox): a first install as root and again as an update; a user with sudo refused for a conflicting container, then installed to `/srv/films` owned by them; with this checkout's image, the entrypoint ran highsea as that user (1001:1001) and it came up healthy. The published 0.1.0 predates ADR 0057's entrypoint and runs as 1000.
    - `apps/docs/test/install.test.ts` (5): the checksum, `sh -n`, and the compose file it writes is `compose.yaml` with the data folder and version filled in.
  - **`get.highsea.tv`:** added to Vercel's `highsea-docs` project (verified). `vercel.json` redirects its `/` to `/install.sh` and every other path to the guide, and serves both files as text. The DNS record in Cloudflare is the owner's to add, since no Cloudflare access is set up here: a DNS-only CNAME from `get` to `80d67be45df9a6f8.vercel-dns-016.com`. Until it's added and this is pushed to `main`, `get.highsea.tv` answers with Cloudflare's current record.
  - **Unraid:** `ca_profile.xml` at the root (CA's one hard requirement). Both templates gain `ExtraSearchTerms` and `Shell`, and the NVIDIA one `Requires`; its comment now cites Curacast and Curacast-NVIDIA, not Immich, which uses branches. Support stays GitHub's issues until there's a forum thread.
  - **TrueNAS** (`templates/truenas/highsea/`, truenas/apps' `ix-dev/community/highsea/`): the app on their library 2.3.17. It starts as root with Plex's six capabilities and drops to `run_as` (568) through the entrypoint; the library sets `PUID`, `PGID` and `TZ` from the form. GPUs come from `resources.gpus` (real `devices:` and groups 44 and 107, no rules needed). `/run/dbus` is behind a checkbox, through the library's `add_dbus()`, declared in `host_mounts`. Bridge by default, as Plex and Jellyfin are there, with the web port on 30636 (free in the catalog), 6881 and 7368; host networking offered. Built from Radarr's `questions.yaml` so the boilerplate matches theirs. Not rendered: their `ci.py` runs their code and image, which needs the owner's permission here.
  - **Umbrel** (`templates/umbrel/highsea/`): `umbrel-app.yml` with `STORAGE_DOWNLOADS` and `GPU` (umbrelOS adds `/dev/dri` itself and removes one mapped by hand), the image pinned by tag and index digest, port 3636, Umbrel's Downloads mounted as `/data`, `PROXY_AUTH_ADD: "false"` since the apps reach `/api` and `/stream` with highsea's own accounts. No `/run/dbus`.
  - **CasaOS and ZimaOS** (`templates/casaos/highsea/`; one store serves both): compose with `x-casaos`, `$PUID`, `$PGID`, `$TZ`, `/DATA` as `/data` (setup finds `Media/Movies` and `Downloads`), the graphics as in `compose.yaml`, port 3636. `docker compose config` passes.
  - **No SPDX header** on the files that go to the stores' repositories: truenas/apps is LGPL-3.0, CasaOS-AppStore Apache-2.0, and TrueNAS's generator rewrites `app.yaml`. `templates/README.md` says so, and lists what each pull request needs first.
  - **Pins:** the listings name 0.1.0, the newest published release, and move to the release that has 4.3c in it.
  - **Guides:** `install/script.mdx` (new, in the sidebar after the prerequisites), linked from the installation page and the Docker guide; the installation page no longer asks for a TMDB account.
  - **ADRs:** 0050's 2026-10-28 section on the stores and `get.highsea.tv`; 0057 points to it.
  - **4.3c's full checks under Node 26.11.1:**
    - lint (1,345 files) and typecheck are clean;
    - 11,808 tests pass and 8 are skipped, across 209 files. One failed under the full run's load: `hls-ffmpeg.test.ts`'s copied-sound test, which this checkpoint doesn't touch. It passed alone three times, and its whole file passes;
    - smoke ok, licences (864 packages) compatible, the audit finds nothing (719 packages);
    - the docs build exports `install.sh` unchanged;
    - the sweeps are clean: pages (1,624), keyboard (171), D-pad, and the server's admin pages on the production build.
- **2026-10-28, 4.3c, the owner's answers to part C's report, and the stores tested** (still waiting for the owner's review at 4.3c's gate):
  - **The owner's answers:** the owner added `get.highsea.tv`'s CNAME in Cloudflare; gave permission to run TrueNAS's `generate_metadata.py` and `ci.py` and to test the Umbrel app in a containerised umbrelOS; and approved submitting to all four stores after the release that has 4.3c in it, with the listings' pins moved to it.
  - **`get.highsea.tv`:** the CNAME resolves to Vercel, which reports the domain configured, and Vercel issued its certificate (Let's Encrypt, until 2027-01-27). Before that it briefly served an expired `*.highsea.tv` certificate. It serves the docs site until `vercel.json` and `install.sh` reach `main`.
  - **TrueNAS, tested on TrueNAS 25.10.7** (the part A VM) with truenas/apps at `ea9e6a1`:
    - `port_validation.py` passes;
    - `generate_metadata.py` filled in the six capabilities, `run_as_context` (root, which the entrypoint drops to `run_as`), `lib_version_hash` and `item.yaml`, and `check_metadata.py` finds them up to date. The generated `app.yaml` and `item.yaml` are now in `templates/truenas/highsea/`;
    - `ci.py` renders, starts and waits for healthy with both `basic-values.yaml` (bridge) and `hostnet-values.yaml`. The permissions container gives the folders to 568, and highsea runs as it.
    - Two adjustments were needed to run their checks here, neither in the app. Their library uses TrueNAS's real middleware whenever the kernel's release says `truenas` (`validations.py`'s `is_truenas_system`), so the middleware socket was mounted into their validation container. Their test values' `/opt/tests` was moved onto the pool, because TrueNAS's root is read only. On this Mac their amd64-only validation image fails for every app (Radarr too): Docker Desktop's emulation has no `openat2`. Their GitHub runners, plain amd64 Ubuntu, need neither change.
    - With avahi off on host networking (the second test), highsea's own mDNS responder meets TrueNAS's avahi on 5353, logs the clash and carries on, as ADR 0020's 2026-10-28 section expects. The default (avahi on) publishes through avahi.
  - **Umbrel, tested on umbrelOS 2.0.0** (`ghcr.io/getumbrel/umbrelos:2.0.0`):
    - Following umbrel-apps' `umbrel-test-app` skill, the package was placed in the store's folder and installed with `umbreld client apps.install.mutate`. It reached `ready`, healthy, running as 1000, and opened at setup through Umbrel's gateway on 3636. The data survived `apps.restart`.
    - umbrelOS 2.0 serves the gateway from `umbreld` itself (`app-gateway.json`, no `app_proxy` container) and maps `${UMBREL_ROOT}/data/storage/downloads` to `${UMBREL_ROOT}/home/Downloads`. No change was needed.
    - Their skill's container flags (`--network host`) are documented for OrbStack. On Docker Desktop they stopped Docker Desktop's own engine until it was restarted. The test ran on a bridge network with a private cgroup namespace.
    - Umbrel's `lint:apps` wasn't run: it needs their `npm install`, which this session's permissions blocked.
  - **CasaOS** still has only `docker compose config`; its store has no test harness to run.
- **2026-10-28, 4.3c, signed off by the owner on 2026-10-28:** parts A, B and C as built and tested above, merged into `main` and pushed on the owner's word, so `get.highsea.tv` serves the installer from this deploy. Left for later: the store submissions, after the release that has 4.3c in it (Umbrel's `lint:apps` and CasaOS's icon, thumbnail and screenshot first; `templates/README.md`); part D, the Synology package; and part E, folded into 4.4 to 4.6.

## A. The compose file and templates work with no edits

### Intel and AMD graphics

The default `compose.yaml` and the templates hand over `/dev/dri` as a **bind mount with device rules**, instead of `devices:`:

```yaml
volumes:
  - /dev/dri:/dev/dri          # the short syntax makes an empty folder on a host without one
device_cgroup_rules:
  - 'c 226:128 rw'             # renderD128 to renderD135: render nodes only, not the display
  - 'c 226:129 rw'
  # … to 226:135
```

- **Why this works on every host.**
  - `devices:` checks the device exists when the container is created, and fails with "error gathering device information" when it doesn't.
  - A bind mount with the short syntax creates the source folder when it's missing ([Docker: bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)). The container starts, highsea finds no render node, and reports the processor.
  - `device_cgroup_rules` lets the container open character devices 226:128 to 226:135, the DRM render nodes, and nothing else ([Compose: services › device_cgroup_rules](https://docs.docker.com/reference/compose-file/services/)).
  - On cgroup v2, runc turns the rules into an eBPF device filter. That's community evidence, not stated in Docker's docs, so A checks it on real hosts.
- **Tighter than today's instructions.** `devices: /dev/dri` also hands over the `card*` display nodes, which highsea never needs, and `privileged` hands over everything ([Docker: security](https://docs.docker.com/engine/security/)). `privileged` is not a default.
- **Unconfirmed, checked in A:**
  - Synology's Container Manager accepts `device_cgroup_rules` in a project. Its Docker is 24.0.2.
  - Rootless Docker and Podman. Rootless can't open devices it doesn't own, so the guide says so.
  - Mesa's Vulkan path, used for AMD tone mapping, works without the `card*` node.
- **None of Jellyfin, Plex, Immich or linuxserver.io ships this pattern** (the research found none). It's new ground, which is why A ends with a check on real hosts and why question 2 offers the plain alternative.
- **Docker on the NAS systems** (from their release notes):
  - Synology Container Manager 24.0.2;
  - TrueNAS 24.10 and 25.04 on 27.5.0, and 25.10 on 28.3.1;
  - Unraid 7.1 on 27.5.1, 7.3 on 29.4.3 and 7.4-rc on 29.8.2.
  Bind mounts and `device_cgroup_rules` exist in all of them.
- **Models without the driver.** Community reports say Synology's 2025 J4125 models (DS225+, DS425+) ship without the i915 driver, so they have no `/dev/dri` (unconfirmed by Synology). With this default they start and use the processor, and System › Health says why.

### NVIDIA graphics

- **In the image:** `ENV NVIDIA_VISIBLE_DEVICES=all` and `NVIDIA_DRIVER_CAPABILITIES=compute,video,utility`. Under Docker's default runtime (runc) they do nothing. Under NVIDIA's runtime they hand every NVIDIA GPU and its video libraries to the container ([NVIDIA Container Toolkit: specialized configurations](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)).
- **Nothing in compose.** `gpus:`, `deploy.resources.reservations.devices` and `runtime: nvidia` all make the container fail on a host without NVIDIA's runtime ([Compose: GPU support](https://docs.docker.com/compose/how-tos/gpu-support/)). CDI is on by default from Docker 28.3, but a missing CDI spec fails just the same ([Docker: CDI](https://docs.docker.com/engine/daemon/cdi/)).
- **The one host step** is NVIDIA's: install the Container Toolkit and make `nvidia` Docker's default runtime (`nvidia-ctk runtime configure --runtime=docker --set-as-default`, [install guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)). After that the same compose file uses the card.
  - Unraid's Nvidia-Driver plugin does this.
  - TrueNAS's "Install NVIDIA Drivers" checkbox does this for its catalog apps.
  - Settings › Playback and Health say which step is missing when an NVIDIA card is on the PCI bus but not in the container. That needs `lspci`-style detection through `/sys/bus/pci`, which the container can read.

### What highsea does at start instead of asking

- **`PUID` and `PGID`.** When they aren't set, the entrypoint takes the owner of `/data` (`stat -c %u:%g`), falling back to 1000:1000 when `/data` is owned by root or empty. That's how files land with the right owner without the user running `id`. Set values still win.
- **The time zone.** When `TZ` isn't set, setup takes it from the browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and stores it as a setting, editable in Settings › General. Unraid already passes its own `TZ` (the template's comment), and that still wins.
- **Hardlinks.** A boot-time check makes a hardlink between `/data`'s download and library folders. Health says plainly when they're on different disks, the most common cause of slow imports ([link(2)](https://man7.org/linux/man-pages/man2/link.2.html), `EXDEV`).

### What changes

- `compose.yaml`, `compose.bridge.yaml`, `templates/truenas/compose.yaml`, `templates/synology/compose.yaml`: the GPU lines on by default, `PUID`, `PGID` and `TZ` removed or commented as optional overrides.
- `templates/unraid/highsea.xml`:
  - the `Device` entry is replaced with a `Path` entry for `/dev/dri` plus `--device-cgroup-rule` in `ExtraParams` (to be checked on Unraid);
  - a second template, `highsea-nvidia.xml`, with `--runtime=nvidia` and the two NVIDIA variables. This is Immich's pattern in Community Applications, one template per accelerator.
- `Dockerfile`: the two NVIDIA variables.
- `docker/entrypoint.sh`: `PUID` and `PGID` from `/data`'s owner.
- `packages/runtime`: the time zone setting, the hardlink check on Health, and NVIDIA "on the bus but not in the container".
- **Guides:**
  - `install/docker.mdx`, `synology.mdx`, `truenas.mdx` and `unraid.mdx` lose their editing steps;
  - `install/hardware-acceleration.mdx` is reduced to NVIDIA's host step and troubleshooting.
- **Tests:**
  - the entrypoint's choice of user, in the image test;
  - the e2e run (`compose.e2e.yaml`) uses the new defaults on a host without `/dev/dri`, as CI's runners are;
  - checks on real hosts (answer 12): the DS1520+ over SSH, with its project, image and folder deleted afterwards; TrueNAS SCALE in a VM on this Mac; Unraid in a VM on its 30-day trial. NVIDIA stays unchecked until a beta tester with a card tries it.

## B. highsea detects what setup used to ask

Setup's nine steps become about three. Each one dropped is filled in by highsea and stays changeable in Settings. This changes a locked layout, so the new setup is prototyped and approved first.

- **Name:** prefilled from the host's name and shown on the owner step, not a step of its own.
- **Owner:** stays. It's the one thing highsea can't know.
- **Metadata (the TMDB key):** gone from setup. highsea ships its own key (the owner's answer 7).
  - The owner registers an application for highsea on TMDB. Its key lives in the approval-gated `release` environment, as the catalog's signing key does, and the release workflow builds it into the published image. It is never in the repository, a fixture or a log.
  - An owner's own key in Settings › Metadata still wins. Setup never asks for a key (the owner's change 1). A build from a checkout reads `HIGHSEA_TMDB_READ_TOKEN` from its environment, as development does from `.env.local`. Without a key from anywhere, Health says so and Settings › Metadata takes one.
  - Jellyfin ships a key in its source. TMDB's terms and FAQ don't address shipping one in open-source software ([terms](https://www.themoviedb.org/api-terms-of-use), [FAQ](https://developer.themoviedb.org/docs/faq)); the owner chose to ship it without asking first. Keeping it out of the source limits who can copy it, though anyone with the image can still read it.
  - TMDB's attribution requirement already appears in the admin and the apps.
- **Folders:** shown only when highsea can't find a download folder and a library folder under `/data` by itself. Today's suggestions become the default.
- **Indexers:** the catalog's public indexers are on by default, as now; the step becomes a line on Review.
- **Subtitles:** languages come from the browser's `Accept-Language`, shown on Review.
- **Remote access:**
  - UPnP and NAT-PMP map the HTTPS port, reusing `packages/torrent/src/portmap.ts`, and Health reports whether it worked.
  - It's on only with the owner's consent on Review (answer 10), since it opens a port on their router.
- **Cloud:** off, with a line on Review, until the relay exists.
- **Review:** collapsed to what highsea decided, each line with a link to change it.

**The address apps use.** Discovery's replies and the QR codes need an address the apps can reach:

- **with host networking,** highsea takes the host's LAN address from its interfaces;
- **in bridge mode** it can't see the host's address, so:
  - apps try the reply's *source* address first;
  - setup offers the address the browser used to reach it (`location.host`) as the advertised one, stored as a setting;
  - `HIGHSEA_PUBLISHED_URL` overrides it, as Jellyfin's `JELLYFIN_PublishedServerUrl` does ([Jellyfin: networking](https://jellyfin.org/docs/general/post-install/networking/)).
- ADR 0020 gets a dated section.

## C. Store listings and a one-line install

Ranked by what users save for what it costs.

1. **Unraid Community Applications.** Hours, since the template exists.
   - Add `ca_profile.xml` and a support thread, and submit through [ca.unraid.net/submit](https://ca.unraid.net/submit). Requirements: an OSI licence at the repo root (AGPL qualifies), valid XML, Validate and Scan, then moderator review ([help](https://ca.unraid.net/submit/help)).
   - Upkeep: answer the support thread and keep it working on new Unraid releases ([docs](https://docs.unraid.net/community-applications/)).
   - Users go from copying XML onto the flash drive to Apps › search › Install.
   - Unraid 8's "compose package contract" is linked from CA's help but returns 404 today. Watch it.
2. **TrueNAS community train.** About 2–4 days, plus review time that couldn't be confirmed.
   - 24.10 removed third-party catalogs, so iX's [truenas/apps](https://github.com/truenas/apps) is the only store. New apps go to the community train by pull request ([CONTRIBUTIONS.md](https://github.com/truenas/apps/blob/master/CONTRIBUTIONS.md)): `app.yaml`, `ix_values.yaml`, `questions.yaml`, a Jinja compose template on their library, and test values.
   - **GPU is built in:** `resources.gpus` maps `/dev/dri` for "use all GPUs", picks NVIDIA cards by UUID with `NVIDIA_DRIVER_CAPABILITIES=all`, and adds groups 44 and 107 (their library 2.3.17).
   - **Their run-as rules:** Plex's app starts as root with `PUID`; Jellyfin and Immich run as 568. highsea's entrypoint needs root to join the render group, so it follows Plex's pattern, or runs as 568 relying on TrueNAS's 107 (unconfirmed to be the host's render group).
   - Their bot bumps the image tag; changing `questions.yaml` needs migration scripts. Users get a form with dataset pickers, a GPU checkbox, update badges and rollback.
3. **Umbrel and CasaOS/ZimaOS.** About a day each.
   - **Umbrel:** a pull request to [umbrel-apps](https://github.com/getumbrel/umbrel-apps), with amd64 and arm64 images pinned by tag and digest. Its `permissions: [GPU]` hands over `/dev/dri`, and mapping it yourself gets the app removed.
   - **CasaOS:** compose with `x-casaos` metadata, by pull request to [CasaOS-AppStore](https://github.com/IceWhaleTech/CasaOS-AppStore).
   - Small audiences, low cost, and both already have Plex and Jellyfin.
4. **`install.sh` for a plain Linux machine.** About a week.
   - It's served from `get.highsea.tv` (or the docs site) and published with its SHA-256 beside it.
   - It checks for Docker and Compose, and **never installs them**; it links Docker's own install instead ([Docker: install on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)).
   - It looks for `/dev/dri` and NVIDIA's runtime, picks `PUID`/`PGID` from the folder chosen for `/data`, writes `compose.yaml` in `/opt/highsea` (or a folder given), starts it, and prints the address to open.
   - It's idempotent: run again, it updates.
   - Immich and Tailscale ship the same kind of script ([Immich](https://docs.immich.app/install/script), [Tailscale](https://tailscale.com/kb/1031/install-linux)).

### Updates

- The stores update the image their own way: Unraid by digest, TrueNAS by their bot, Umbrel by pull request.
- For compose installs, highsea already tells the owner in System › Updates (ADR 0047). It doesn't update itself.
- Watchtower is archived ([linuxiac](https://linuxiac.com/docker-update-tool-watchtower-reaches-end-of-maintenance/)).
- Plex's image updates itself at start, which conflicts with immutable images and signed provenance (ADR 0050).
- So no self-updater (answer 9).

## D. A Synology package that runs the container

DSM 7.2 and later can install a package that is a container. The SPK's `docker-project` worker ships a real `compose.yaml` inside the package. Container Manager (version 1432 or later, DSM 7.2.1) then:

- creates and starts the project at install;
- starts and stops it with the package;
- deletes it at uninstall ([Synology: docker-project worker](https://help.synology.com/developer-guide/resource_acquisition/docker-project.html)).

PeerBanHelper ships this way: a `noarch` package that depends on Container Manager, with a `data-share` worker making a shared folder that the compose file mounts.

- **What the package does:**
  - an install wizard with two questions: the shared folder for films (created if new) and whether to use the graphics chip, on by default when `/dev/dri` exists;
  - `postinst` writes the compose file with the package user's UID;
  - Package Center shows updates.
- **What users still see:**
  - "This package isn't verified by Synology", since DSM 7 removed third-party signing ([breaking changes](https://help.synology.com/developer-guide/breaking_changes.html));
  - granting the package's user access to an existing shared folder, as Synology's own Plex guide describes.
- **GPU:** Container Manager's Docker runs as root, so the bind mount and rules from A should work as in today's template. This is inferred, and checked on the DS1520+.
- **Where it's published** (answer 8: highsea's own package source and each release's `.spk` first, Synology's Package Center once it's proven):
  - a package source highsea runs (Package Center › Settings › Package Sources), at `packages.highsea.tv`, which gives Package Center updates;
  - an `.spk` on each GitHub release;
  - Synology's own Package Center, which needs a developer agreement and their review ([get started](https://help.synology.com/developer-guide/publish_package/get_start.html)). Whether Synology accepts a package that is a container is unconfirmed.
- **Native SPKs** (Plex's and Emby's way) are out of scope. They run as the package user, need the `video-driver` resource (SynoCommunity's, not in Synology's public guide) and a build of Node and ffmpeg for DSM.

## E. The apps find, pair and update without typing (folded into 4.4–4.6)

Each item goes into the client checkpoint it belongs to. They're listed here so they're scoped together.

- **Finding the server on the same network:**
  - **iOS and tvOS:** Bonjour `_highsea._tcp` only. The UDP broadcast needs Apple's multicast entitlement, which is granted on request. iOS asks for local-network permission once. tvOS doesn't enforce local-network privacy, and macOS 15 does.
  - **Android:** `NsdManager`. Android 17's `ACCESS_LOCAL_NETWORK` permission, or the system picker (`FLAG_SHOW_PICKER`) with no permission at all.
  - **The web client** is served by the server and needs nothing.
- **Pairing a TV from the phone** (4.5/4.6):
  - the TV shows its device code and a QR code holding the server's address and the code;
  - the phone, already signed in, approves it, as Jellyfin's Quick Connect does ([Jellyfin: Quick Connect](https://jellyfin.org/docs/general/server/quick-connect/));
  - no typing on the TV.
- **Links that open the app:**
  - `highsea://connect?server=…&code=…`;
  - a static `highsea.tv/open` page on Vercel that opens the app or points to its store, for universal links ([Android App Links](https://developer.android.com/training/app-links)).
- **"Get the apps"** in `/web` and the admin: QR codes to each store and the server's address, from B.
- **Desktop updates:** the Tauri updater, signed ([Tauri: updater](https://v2.tauri.app/plugin/updater/)); listings in winget, the Microsoft Store and highsea's own Homebrew tap.
- **The stores' conditions** (for 4.5 and 4.6):
  - Apple's review needs a public demo server with openly licensed films (guideline 2.1), and no download or torrent wording in the app (5.2.3) ([guidelines](https://developer.apple.com/app-store/review/guidelines/));
  - Google Play's personal accounts need 12 testers for 14 days, so an organisation account ([Play Console](https://support.google.com/googleplay/android-developer/answer/14151465));
  - Fire TV's Vega is React Native for Vega ([Amazon](https://developer.amazon.com/docs/vega/0.24/vega-rn-arch.html));
  - F-Droid accepts it with its anti-feature labels ([F-Droid](https://f-droid.org/docs/Anti-Features/)).
- **The PWA** installs only over HTTPS ([MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)), so on a LAN address it doesn't. That's one of the cloud items above.
- **Remote access without the cloud:**
  - UPnP and NAT-PMP (B);
  - Tailscale as a documented sidecar, since it has no library for Node;
  - Cloudflare Tunnel's terms exclude serving video, so it isn't recommended.

## F. Native server installers (after 1.0)

Docker stays the way to run highsea through 1.0. After that, in this order:

1. **macOS:** a Tauri app holding Node 26, the server and ffmpeg as a sidecar, with a menu bar item and a launchd agent.
   - It's the only way to use VideoToolbox, since containers on a Mac can't reach the GPU.
   - It needs an Apple Developer account ($99 a year) and notarisation.
2. **Windows:** an NSIS installer through Tauri, with a tray item and an optional service (WinSW or NSSM). It's signed with an OV certificate or Azure Artifact Signing.
3. **Linux:** `.deb` and `.rpm` in a signed repository, with a systemd unit. The postinst adds highsea's user to `render` and `video`, as Jellyfin's packages do.
   - Flatpak and Snap are skipped, since their sandboxes fight a server.
   - Node's single executable applications are deferred: native addons such as `better-sqlite3` can't load from inside the bundle.
4. **Proxmox VE Helper-Scripts:** a large audience (30k stars), but its scripts install natively in an LXC rather than through Docker. It needs a native install script (Node 26, ffmpeg, Intel drivers, `unar`) and their DevScripts review first.

## Other platforms (later or never)

- **QNAP:** a containerised QPKG works ([qnap-dev/containerized-qpkg](https://github.com/qnap-dev/containerized-qpkg)), but since QTS 5.0.1 unsigned packages are refused by default, and QNAP's signing route for outsiders is unconfirmed. The plan is to document Container Station with the compose file instead.
- **Runtipi's** official store accepts no new apps.
- **Cosmos, YunoHost and Home Assistant** have small or mismatched audiences.

## ADRs

- **0057, installing without configuration** (new):
  - the bind mount with device rules as the default handover;
  - NVIDIA's variables in the image;
  - what's detected instead of asked (`PUID`/`PGID`, time zone, address);
  - no Docker socket, no self-updater;
  - the stores highsea lists in;
  - the TMDB key built into the image from the release environment.
- **Dated sections:**
  - 0056 (the handover section replaced);
  - 0003 (the image's NVIDIA variables and the entrypoint's user);
  - 0020 (the advertised address);
  - 0050 (the stores and the Synology package source as distribution channels, and the TMDB key in the `release` environment);
  - 0024 when E adds approving a TV's code from the phone.

## Risks

- **The device-rules default is new ground.** No major media server ships it. If a NAS's Docker or UI rejects `device_cgroup_rules`, that template falls back to its own GPU switch (TrueNAS's checkbox, Umbrel's permission, the SPK's wizard). A's real-host check decides it before anything is published.
- **Store upkeep is ongoing.** Each listing is a support thread and a review queue: Unraid's moderators can delist, TrueNAS's form changes need migrations, and Umbrel pins digests. Four stores is a standing commitment.
- **Synology's direction is uncertain:** the x25 models without `/dev/dri`, no third-party signing, and an unconfirmed stance on container packages in Package Center.
- **Detected defaults can be wrong.** `/data`'s owner may not be the right user, and the browser's address may be a reverse proxy's. Each detected value is shown on Review and in Settings, and the explicit variable always wins.
- **Opening a router port is a security decision.** UPnP stays behind consent.
- **TMDB may object to the shipped key, or revoke it.** Every install without its own key would lose metadata at once. Health says so plainly and Settings › Metadata takes the owner's own key; a new key ships in the next release.

## Open questions for the owner

1. **When this is built.**
   - **Recommended:** A, B and C as one checkpoint, 4.3c, right after 4.3b's sign-off and before the desktop app. They're server work, they finish what 4.3b started on the GPU, and the clients then build on B's advertised address. D follows, E folds into 4.4–4.6, and F waits for 1.0.
   - Or: after 1.0, so Phase 4 keeps its order. Every beta tester until then edits compose.
   - Or: only A now (the compose defaults), and B to D after 1.0.
2. **How the default compose file hands over Intel and AMD graphics.**
   - **Recommended:** the bind mount with device rules. It starts on every host, hands over render nodes only, and needs no edit, but it's new ground and must pass A's check first.
   - Or: `devices: /dev/dri`, left commented as now. That's proven, but every user edits.
   - Or: two compose files, with and without graphics. That's proven with no edit, but the user has to choose the right file.
3. **NVIDIA.**
   - **Recommended:** NVIDIA's variables in the image, and the one host step (the toolkit as Docker's default runtime) in the guide, with Health naming it when missing.
   - Or: a separate `compose.nvidia.yaml` and NVIDIA templates. That works without changing Docker's default runtime, but it's a second file to choose.
4. **Letting highsea reconfigure its own container through the Docker socket.**
   - **Recommended:** no. The socket is root on the host ([Docker: security](https://docs.docker.com/engine/security/)), and there's no well-regarded pattern for it beyond Nextcloud AIO.
   - Or: a one-shot installer container that writes `compose.override.yaml`, which Compose merges by itself ([Compose: merge](https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/)), and exits. It's narrower, but it still asks people to mount the socket once.
5. **`PUID` and `PGID`.**
   - **Recommended:** taken from `/data`'s owner when unset, falling back to 1000:1000, with set values winning.
   - Or: keep them required, as linuxserver.io's images do. That's explicit, but it's one more edit.
6. **The setup wizard.**
   - **Recommended:** prototype the three-step setup from B (owner, folders only when needed, a review of what highsea decided) for your approval, then build it in 4.3c.
   - Or: keep the nine steps, prefilling what highsea detects. No layout change, but more clicks.
7. **The TMDB key.**
   - **Recommended:** ask TMDB in writing whether highsea may ship its own key in open-source software. Keep the step until they answer.
   - Or: ship a key now, as Jellyfin does. That's a risk to the key and the project if TMDB objects.
   - Or: keep asking each owner for their own key.
8. **Synology.**
   - **Recommended:** a container SPK (D), published from a package source highsea runs at `packages.highsea.tv` and as an `.spk` on each release, so Package Center shows updates. Apply to Synology's Package Center later, once it's proven.
   - Or: apply to Synology's Package Center first. That reaches the most people, but the acceptance of container packages is unconfirmed and their review is slow.
   - Or: no SPK. Keep the Container Manager guide with the zero-edit compose file from A.
9. **Updates.**
   - **Recommended:** no self-updater. The stores update the image, and compose installs see System › Updates' notice, as today.
   - Or: a button in System › Updates that pulls and recreates through the Docker socket. That's convenient, but it's the socket again (question 4).
10. **Remote access in setup.**
    - **Recommended:** offered on Review with UPnP/NAT-PMP mapping the HTTPS port only after the owner agrees, with Health reporting the result.
    - Or: on by default, as Plex does. That's fewer steps, but it opens a router port without asking.
    - Or: left to Settings › Network, as now.
11. **Native server installers.**
    - **Recommended:** after 1.0, macOS first (it's VideoToolbox's only way in), then Windows, then Linux packages. That means an Apple Developer account and a Windows signing certificate when the time comes.
    - Or: macOS during Phase 4, alongside the desktop client, which shares Tauri.
    - Or: never. Docker only.
12. **Checking on real hosts.**
    - **Recommended:** check A's defaults and D's package on your DS1520+ over SSH, with the project, image and folder deleted afterwards. Check TrueNAS SCALE in a VM on this Mac (free), and Unraid in a VM on its 30-day trial. NVIDIA stays unchecked until someone with a card tries the beta.
    - Or: the DS1520+ only, with TrueNAS and Unraid left to their stores' CI and beta testers.

## The owner's changes

Beyond answer 7, below:

1. **2026-10-28, reviewing the new setup's prototype:** setup has no TMDB key step, even when the image has no key built in. A build from source gets its key from `HIGHSEA_TMDB_READ_TOKEN` in its environment ([B](#b-highsea-detects-what-setup-used-to-ask)). The same review had the owner step's password fields line up.

## The owner's answers

On 2026-10-28 the owner took every recommendation for questions 1 to 12 except question 7.

1. A, B and C are built as checkpoint 4.3c, right after 4.3b's sign-off and before the desktop app. D follows, E goes into 4.4–4.6, and F waits for 1.0.
2. The default compose file hands over Intel and AMD graphics with the bind mount and device rules, after A's checks on real hosts.
3. NVIDIA's variables go in the image. The guide gives NVIDIA's one host step, and Health names it when it's missing.
4. highsea never reconfigures its container through the Docker socket.
5. `PUID` and `PGID` come from `/data`'s owner when unset, falling back to 1000:1000.
6. The three-step setup is prototyped for approval, then built in 4.3c.
7. **Changed by the owner:** highsea ships its own TMDB key now, without asking TMDB first. Asked as a follow-up, the owner chose to build it into the published image from the approval-gated `release` environment, never into the repository. An owner's own key in Settings still wins. On 2026-10-28 the owner registered highsea's application on TMDB and added its API Read Access Token as `HIGHSEA_TMDB_READ_TOKEN`, to the `release` environment and to the gitignored `.env.local`. It's the only TMDB secret shipped: the short API key gives the same access, so one credential is enough.
8. Synology gets a container SPK from highsea's own package source (`packages.highsea.tv`) and each release; Synology's Package Center comes later.
9. No self-updater.
10. Remote access is offered on Review, and UPnP/NAT-PMP maps the HTTPS port only after the owner agrees.
11. Native server installers come after 1.0, macOS first.
12. A and D are checked on the DS1520+ over SSH, TrueNAS SCALE in a VM, and Unraid in a VM on its trial.
