# One compose file

A follow-up to [install-simplicity.md](install-simplicity.md), asked for by the owner on 2026-11-06: the repository's root holds six compose files, which goes against making highsea's install as small as it can be. Scoped on 2026-11-06, during part D3 of the one client platform, and approved with the owner's answers of 2026-11-06 (every recommendation). It's built after D3's sign-off and before part E.

## Read first

1. `CLAUDE.md` and [install-simplicity.md](install-simplicity.md): its parts A to C made the compose file need no edits, and wrote `install.sh` at `get.highsea.tv`.
2. [ADR 0057](../adr/0057-installing-without-configuration.md) (installing without configuration), [ADR 0042](../adr/0042-vpn-connections.md) (the VPN modes), [ADR 0020](../adr/0020-discovery-port.md) (discovery, host networking and mDNS).
3. The six files at the root: `compose.yaml`, `compose.bridge.yaml`, `compose.connects.yaml`, `compose.gluetun.yaml`, `compose.dev.yaml` and `compose.e2e.yaml`.
4. Where people meet them: `apps/docs/public/install.sh`, `apps/docs/content/install/docker.mdx`, `apps/docs/content/settings/vpn/connects.mdx` and `container.mdx`, and Settings › VPN (`packages/admin/src/vpn.tsx`, `packages/vpn/src/compose.ts`, `docs/product/vpn.md`).

## Goal

The root holds one compose file, `compose.yaml`: the one `get.highsea.tv`'s installer writes and the Docker guide shows. Every other setup is written for the owner at the point they need it, by the installer or by Settings, and never chosen as a different file at install time. The files for building and testing highsea live beside what uses them, not at the root. Each piece of compose text is defined in one place.

## Out of scope

- **The NAS and store templates** in `templates/` (Unraid's XML; TrueNAS's, Synology's, Umbrel's and CasaOS's files). Each store needs its own format, so they stay; their tests keep them in step with `compose.yaml`.
- **Changing what highsea's container needs.** Host networking, `/data`, the graphics lines and `/run/dbus` stay as ADR 0057 has them.
- **Docker Desktop's host networking.** Docker documents it from Desktop 4.34, but as an opt-in setting that needs a Docker account, works at layer 4 only, and reaches the container from the computer itself rather than from the network ([Host network driver › Docker Desktop](https://docs.docker.com/engine/network/drivers/host/#docker-desktop)). Published ports stay the way on a Mac or Windows.

## Where things stand

The six files, what each is for, and where its text is repeated today:

| File | For | Repeated in |
| --- | --- | --- |
| `compose.yaml` | The install on Linux, with host networking | `install.sh`'s `compose_file` (held to it by `apps/docs/test/install.test.ts`), and `docker.mdx`'s Linux tab, shorter and checked by nothing |
| `compose.bridge.yaml` | Docker Desktop, and boxes without host networking | `docker.mdx`'s macOS and Windows tab. Synology has its own template and package |
| `compose.connects.yaml` | highsea's own WireGuard tunnel (NET_ADMIN, its own network, published ports) | `connects.mdx`'s block, and in part Settings › VPN's capability lines (`CAPABILITY_LINES` in `packages/admin/src/vpn.tsx`), which add only `cap_add` |
| `compose.gluetun.yaml` | highsea behind a gluetun container | Settings › VPN › Compose for your provider (`composeFor` in `packages/vpn/src/compose.ts`), which writes the block for the owner's provider, and `container.mdx` |
| `compose.dev.yaml` | The image built from this checkout | Used by people building highsea: docs/architecture.md's commands and the `checks` skill |
| `compose.e2e.yaml` | The end-to-end run in CI | Used by `scripts/e2e/run.ts` and `.github/workflows/e2e.yml` |

So four files are for owners, and three of those copy text the guides, the installer or the admin already give. Two are for building highsea. The guides' code blocks are where owners actually copy from. The repository's files are mostly listed as the guides' sources.

Choosing highsea connects means changing the compose file: adding `NET_ADMIN`, and moving off host networking so the tunnel's interface and rule stay out of the host's network (ADR 0042). Settings › VPN gives the capability line, but not the network change. highsea can already tell whether it's on host networking: setup reads the interfaces Docker makes on the host (`packages/runtime/src/setup.ts`).

## The parts

Two gated parts, each reviewed:

- **A, the files.** The three owner variants removed, the two build files moved, the guides and the installer drawing on one `compose.yaml`. Nothing an owner sees in highsea changes.
- **B, Settings › VPN writes highsea connects' lines.** The highsea connects mode gets a Compose block like the container mode's, prototyped first (it changes a locked screen), with highsea saying when it's on host networking. `compose.connects.yaml`'s last copy goes here.

## Progress

- **Part A, built on 2026-11-06 and signed off by the owner on 2026-11-06** (HT-7, pull request #10):
  - **The root holds one compose file.** `compose.bridge.yaml`, `compose.gluetun.yaml` and `compose.connects.yaml` are removed. `compose.yaml`'s header names no other file: it points to the Docker guide for a Mac or Windows and to Settings › VPN for a VPN. Its services are unchanged, and the installer's copy still matches them (`install.test.ts`).
  - **The build files moved:** `docker/compose.dev.yaml` (build context `..`, folders `../.dev/docker/…`, and the project named `highsea-dev`, since Compose would otherwise name it after its folder) and `scripts/e2e/compose.yaml` (the fixtures' context `../..`). `run.ts`, `fixtures.ts`, `e2e.yml` (its explicit path dropped, since `scripts/e2e/**` covers it), docs/architecture.md, the `checks` skill and the README follow. `docker compose config` resolves both to the root's Dockerfile, and `docker compose -f docker/compose.dev.yaml build` built the image.
  - **The Docker guide's Linux tab includes `compose.yaml`** with `<include meta='title="compose.yaml"'>../../../../compose.yaml</include>`. fumadocs-mdx 15.4.6 resolves the path from the guide's folder (`dist/remark-include-*.js`), and the built page's block matches the file line for line. The include, not the fallback copy: Vercel builds `apps/docs` with the repository's other files present by default ([Monorepos](https://vercel.com/docs/monorepos)), which the site's workspace packages already rely on. The pull request's `highsea-docs` preview built, and its Linux block is identical to `compose.yaml` (53 lines), so the include holds on Vercel. The e2e job ran with the `full-ci` label and passed with the moved file, as did `check`, `leak`, `playback` and both images.
  - **The guides:** the Docker guide's data-folder line now says `./data` (the included file's), with `/srv/data` as the example; highsea connects says "add these lines to highsea's service, and take out `network_mode: host`" in place of naming the file; A VPN container points only to Compose for your provider; Recommended setup, Network and remote access, Connections and Prerequisites name the guide or the Settings screen in place of the removed files. `templates/synology/compose.yaml`'s comment and `docs/product/vpn.md`'s two mentions follow.
  - **Tests:** `content.test.ts` fails when a guide names a compose file the repository doesn't have, by bare name, by path from the root, or relative to the guide as the include is (checked by breaking the include's path and naming `compose.bridge.yaml`).
  - **ADRs:** dated sections in 0057 and 0020; the index follows. 0042's is part B's.
- **Part B's prototype, built on 2026-11-06 and approved by the owner on 2026-11-07** (HT-9, pull request #12, approved by merging it into `next`), at `#/admin/settings/vpn`:
  - **Compose for highsea connects** under the provider's fields, the same folded panel and CopyBlock as Compose for your provider (the two now share one `ComposePanel` in `packages/admin/src/vpn.tsx`): `cap_add: [NET_ADMIN]`, the published ports in place of `network_mode: host` (the Docker guide's macOS and Windows tab's four), and the TUN device commented for kernels before 5.6, with Copy. It replaces `CAPABILITY_LINES`, and the status no longer repeats the lines: it points to the block, which opens by itself.
  - **One writer:** `composeFor({ mode: 'builtin' })` in `packages/vpn/src/compose.ts`, beside gluetun's, unit-tested (its ports held to the guide's tab). The admin imports the browser-safe `@highsea-tv/vpn/compose` itself, since the text depends on nothing the server knows; the container mode still asks the server.
  - **The host-networking state:** `hostNetwork` on `VpnStatus` in the contract, **optional, as a draft**: the screen reads it now, and part B makes the server report it (and the field required). In highsea connects the status says "highsea is on host networking", with why and what to change, and Reconnect is off. In the prototype the empty server is on host networking (compose.yaml as installed) and lacks NET_ADMIN; the populated one is neither, so the data switch shows both.
  - **The spec:** docs/product/vpn.md marked each change *Proposed*, with its copy; they're marked approved on 2026-11-07.
- **Part B, built on 2026-11-07 and waiting for the owner's review** (HT-10):
  - **What highsea knows:** `detectContainerNetwork` in `@highsea-tv/runtime` (`container-network.ts`) says `host`, `bridge` or outside a container (null), from Docker's host-side interfaces (`docker0`, `br-…`, `veth…`), which a container sees only with host networking ([Bridge network driver](https://docs.docker.com/engine/network/drivers/bridge/), [Host network driver](https://docs.docker.com/engine/network/drivers/host/); [Node › os.networkInterfaces](https://nodejs.org/docs/latest-v24.x/api/os.html#osnetworkinterfaces)). Setup's `detectAddress` reads it, and so does the VPN, through a `hostNetwork` seam on `createVpn` that the runtime fills once at boot (`BootOptions.containerNetwork` for tests). Tested with injected interfaces: host networking, a bridge, and outside a container.
  - **The server reports it:** `VpnStatus.hostNetwork` is **required** (judgement call): every server knows its answer, false outside a container, where there's no compose file to change, and on a bridge; an optional field would let a client read a missing answer as "not on host networking". `openapi.json` follows. highsea connects fails with vpn.md's host-networking copy before any `ip` or `wg` command runs, and Reconnect gets no further.
  - **Forced by real data:** the status's "highsea is on host networking" title applies in highsea connects only. An interface on the host usually needs host networking, so an interface or container failure there now reads "Couldn't connect" with its own reason. Nothing else visible changed from the prototype.
  - **The guides:** `connects.mdx` describes Compose for highsea connects, Copy and the two states rather than copying the lines, with a new screenshot of the open block and `connects`, `connects-pia` and `forwarded-port` retaken (the `connects` shot now waits for the provider's fields). `troubleshooting.mdx` gains "highsea is on host networking" and points the capability's fix at the same block. `container.mdx` already pointed at Compose for your provider, and `docker.mdx`'s macOS and Windows block is a whole service, which `composeFor`'s ports are held to by a test, so neither changed.
  - **ADRs:** a dated section of 2026-11-07 in 0042; the index follows.

## A. The files (A)

- **Removed:** `compose.bridge.yaml`, `compose.gluetun.yaml` and `compose.connects.yaml` (answer 1). Part B gives highsea connects' lines from Settings; until B lands, `connects.mdx` holds them.
- **Moved:** `compose.dev.yaml` to `docker/compose.dev.yaml`, beside `docker/entrypoint.sh`, with its build context `..` ([Compose file › build › context](https://docs.docker.com/reference/compose-file/build/#context)); `compose.e2e.yaml` to `scripts/e2e/compose.yaml`, beside `run.ts` and the fixtures service. `.dockerignore` stays at the root, since the context is the root. docs/architecture.md's commands, the `checks` skill, `e2e.yml`'s paths and `run.ts` follow.
- **`compose.yaml`'s header** stops naming the other files. It says what it is and points to the Docker guide for a Mac or Windows and to Settings › VPN for a VPN.
- **The guides draw on the one file.** `docker.mdx`'s Linux tab includes `compose.yaml` itself, through Fumadocs MDX's `<include>`, which draws a file as a code block ([Include](https://www.fumadocs.dev/docs/mdx/include)), so the guide can't drift. The macOS and Windows tab keeps its published-ports block as the one place that setup is written. The guides' source lists and the README follow.
- **Tests:** `install.test.ts` already holds the installer to `compose.yaml`. A new check in `apps/docs/test/content.test.ts` fails when a guide names a compose file the repository doesn't have.

## B. Settings › VPN writes highsea connects' lines (B)

- **The prototype first:** highsea connects gains **Compose for highsea connects**, as the container mode has Compose for your provider: the lines highsea's service needs (`cap_add: [NET_ADMIN]`, the published ports in place of `network_mode: host`, and the TUN device, commented, for kernels before 5.6), with Copy. When highsea finds it's on host networking, the mode's status says so and opens those lines. Approved before it's built, with its spec in `docs/product/vpn.md`.
- **One writer:** `composeFor` in `packages/vpn/src/compose.ts` gains the highsea connects block, so the admin's `CAPABILITY_LINES`, the guide's block and the repository's file are replaced by one function. `connects.mdx` describes the screen rather than copying the lines, with its screenshots retaken.
- **What highsea knows:** the host-networking check moves from setup into a shared helper, so the VPN status and setup read the same answer.

## ADRs

- **No new ADR.** This carries out ADR 0057 for the remaining files.
- **Dated sections:** 0057 (one compose file at the root, and the variants written where they're needed); 0042 (highsea connects' compose lines from Settings, and the host-networking warning, part B); 0020 (the Docker Desktop setup in the guide rather than a file).

## Risks

- **Links in the wild.** The guides are the only public place that names these files, and they change in the same commit. Anyone who copied a raw GitHub link to `compose.bridge.yaml` gets a 404. The release notes say where each setup went.
- **`<include>` outside the docs' folder.** Vercel builds `apps/docs` as the project's root. Including `../../compose.yaml` needs Vercel's "include files outside the root directory" setting, which is on by default for monorepos ([Monorepos](https://vercel.com/docs/monorepos)). The plan checks it in a preview before merging. If it doesn't hold, a build step copies the file in, and the guide includes the copy.
- **Moving the e2e file** changes the paths CI watches. `actionlint` runs, and the e2e job runs on the branch before it's merged.

## Open questions for the owner

1. **The three variants for owners.**
   **Recommended:** remove all three. The Docker guide keeps the Mac and Windows setup, Settings › VPN's container mode already writes the gluetun block, and part B has it write highsea connects' lines. The root keeps one file.
   Or: keep `compose.connects.yaml` and `compose.gluetun.yaml` in an `examples/` folder, out of the root. Less work, and nothing changes in the admin, but they stay as second copies of what Settings writes.
   Or: keep all three at the root, and only move the two build files. The smallest change, but four install files stay.
2. **The Docker guide's Linux block.**
   **Recommended:** include `compose.yaml` with Fumadocs' `<include>`, comments and all, so the guide shows the file exactly.
   Or: keep the guide's short block, with a test that the services' keys match `compose.yaml`'s. The guide stays shorter, with a second copy held in step.
3. **Where the build files go.**
   **Recommended:** `docker/compose.dev.yaml` and `scripts/e2e/compose.yaml`, beside what uses them.
   Or: one `dev/` folder for both. One place to look, but away from the scripts that run them.
4. **When.**
   **Recommended:** after D3's sign-off and before part E of the one client platform: part A first, then B's prototype, then B. It's small, and it lands in the next release with its notes.
   Or: after part E, with the other work after part D. Nothing waits on it.

## The owner's changes

## The owner's answers

On 2026-11-06 the owner took every recommendation for questions 1 to 4:

1. The three owner variants are removed from the root: the Docker guide keeps the Mac and Windows setup, and Settings › VPN writes both VPN modes' lines (part B).
2. The Docker guide's Linux tab includes `compose.yaml` itself, through Fumadocs' `<include>`.
3. The build files move beside what uses them: `docker/compose.dev.yaml` and `scripts/e2e/compose.yaml`.
4. It's built after D3's sign-off and before part E: part A, then B's prototype, then B.
