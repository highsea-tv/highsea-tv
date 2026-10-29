<!-- SPDX-License-Identifier: AGPL-3.0-only -->
# Templates and store listings

How highsea is installed outside a plain `compose.yaml` (install-simplicity.md, ADR 0057). Each one
hands over the graphics, keeps downloads and the library in one folder so imports hardlink, and
asks nothing highsea can find out by itself.

| Folder | What | Where it goes |
| --- | --- | --- |
| `unraid/` | `highsea.xml` and `highsea-nvidia.xml`, with `ca_profile.xml` at the repository's root | Unraid's Community Applications reads them from this repository, once it's submitted at [ca.unraid.net/submit](https://ca.unraid.net/submit) |
| `truenas/compose.yaml` | A compose file for Apps › Install via YAML | Copied by hand, as the TrueNAS guide says |
| `truenas/highsea/` | The app for TrueNAS's community train, in [truenas/apps](https://github.com/truenas/apps)' format (`ix-dev/community/highsea/`) | A pull request to truenas/apps |
| `synology/compose.yaml` | A compose file for Container Manager | Copied by hand, as the Synology guide says |
| `synology/spk/` | The Synology package (DSM 7.2.1 and later): INFO's source is `scripts/spk.ts`, which packs this folder, pins the image to the release and checksums the payload | `bun scripts/spk.ts build <version>` makes `dist/highsea-<version>-0001.spk` and `dist/highsea-spk.json`; the release workflow attaches both to each stable release, and `packages.highsea.tv` (`apps/packages`) lists the Latest one in Package Center |
| `umbrel/highsea/` | The app for [umbrel-apps](https://github.com/getumbrel/umbrel-apps) (`highsea/`) | A pull request to umbrel-apps |
| `casaos/highsea/` | The app for the [CasaOS and ZimaOS store](https://github.com/IceWhaleTech/CasaOS-AppStore) (`Apps/highsea/`) | A pull request to CasaOS-AppStore |

The installer for a plain Linux machine is `apps/docs/public/install.sh`, served at
`https://get.highsea.tv` beside its SHA-256 (`apps/docs/test/install.test.ts` keeps the two in step).

## The stores' folders

The files in `truenas/highsea/`, `umbrel/highsea/` and `casaos/highsea/` are copied into the
stores' own repositories as they are, so they follow those repositories' formats and carry no SPDX
header: truenas/apps is under the LGPL-3.0 and CasaOS-AppStore under the Apache-2.0, and TrueNAS's
`generate_metadata.py` rewrites `app.yaml` and writes `item.yaml`. Before each pull request:

- **TrueNAS:** copy `truenas/highsea/` to `ix-dev/community/highsea/`, run
  `.github/scripts/generate_metadata.py --app highsea --train community --no-bump` (it fills
  `capabilities`, `run_as_context`, `lib_version_hash` and writes `item.yaml`; the copies here are
  its output for 0.1.0), then `.github/scripts/ci.py --app highsea --train community --test-file`
  with `basic-values.yaml` and `hostnet-values.yaml`, on amd64 Linux that isn't TrueNAS (their
  library uses the real middleware on a TrueNAS kernel). Open the issue their pull request template
  asks for first. Their reviewers host the icon and screenshots on `media.sys.truenas.net`.
- **Umbrel:** run their `npm run lint:apps -- highsea --check-images`, and set `submission` to the
  pull request's address. Umbrel makes the icon and gallery.
- **CasaOS:** add `icon.svg`, `thumbnail.png` (784×442) and `screenshot-1.png` (1280×720) beside
  the compose file.

Each pins the release it was written for, by tag and, where the store asks, by digest. A release
moves them on.

## The Synology package

`synology/spk/` is the package's tree, laid out as Synology's developer guide has it
([introduction](https://help.synology.com/developer-guide/synology_package/introduction.html)):

- `package/compose/` becomes the package's target folder. Container Manager's `docker-project`
  worker (`conf/resource`) creates the project from `compose.yaml` before `postinst` runs, so
  `scripts/preinst` writes the project's `.env` into the unpacked package: the shared folder, the
  graphics and their group, and the NAS's name. `no-graphics/` is what's mounted on `/dev/dri` on a
  model without graphics, since DSM's Docker won't start a container whose bind source is missing.
- `conf/privilege` runs the scripts as the package's own user, and the container runs as it too
  (Container Manager adds `user:` for a package's project). `conf/resource` also asks the
  `data-share` worker for the shared folder from the wizard, with read and write for that user.
- `WIZARD_UIFILES/` holds the install wizard (the shared folder) and the uninstall wizard (whether
  to delete highsea's settings), in the JSON format of the DSM 6.0 developer guide, which DSM 7
  still reads.
- `PACKAGE_ICON.PNG` is 64×64; the 256×256 icon is the brand's, added by the build.

`scripts/spk.test.ts` checks the archive with the system's `tar`, the scripts with `sh -n`, and
`preinst` with DSM's variables. A real install is tried on a NAS by hand, never in CI.

Owners get the package from highsea's package source, `packages.highsea.tv`, which they add in
Package Center › Settings › Package Sources. It's `apps/packages`, a Vercel Function that answers
Package Center as SynoCommunity's spkrepo does, from the `highsea-spk.json` attached to GitHub's
Latest release (ADR 0050's 2026-10-29 section). A release reaches it with nothing to deploy.
