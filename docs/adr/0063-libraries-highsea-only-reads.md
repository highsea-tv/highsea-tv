# 0063. Libraries highsea only reads: read-only root folders, one check before every write

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Phase 5 puts highsea on the owner's NAS beside the stack that already manages their library: Radarr, Sonarr and Lidarr file the media, qBittorrent downloads, and that stays so until the owner switches a kind over ([phase-5-real-use.md](../plans/phase-5-real-use.md), question 3). highsea has to find and play 1,398 films it must never change.

Until now every root folder was one highsea managed: `checkPath` refused a folder highsea couldn't write to, and imports, Rename to my format, subtitles beside the film, NFOs, deletes and the recycle bin all wrote under root folders, each in its own code. A rule in each of those places would be easy to miss in the next one, and the owner's library is live.

Root folders also had no kind. The stage-6 prototype (prototype-gaps.md) drew Settings › Media management with Movies, Shows and Music folders, and Phase 5's parts B and D need shows' and music's folders; setup should find them beside the movies' from A1 on.

The alternatives were a global "read-only mode" (too coarse: the owner wants to move one kind at a time) and relying on the mount alone (a read-only mount makes writes fail with `EROFS`, which highsea would report as errors rather than as a decision).

## Decision

- **Root folders gain `kind`** (`movies`, `shows` or `music`) **and `readOnly`** (`packages/db` migration `0017_read_only_libraries`). The contract's `RootFolder` carries both, and `mountedReadOnly` when the mount itself refuses writes; `GET /rootfolders` takes `?kind=`, `POST` takes `kind` and `readOnly`, `PATCH` switches `readOnly`, and `POST /rootfolders/{id}/scan` scans one folder now. Shows' and music's folders are kept, and listed, until the server has shows and music; everything for movies asks for `kind: 'movies'`.
- **A folder highsea can't write to is added only read-only.** `writeAccess(path)` in `packages/media/src/shared/root-folders.ts` checks with `access(2)`'s `W_OK` ([Node: fs.access](https://nodejs.org/api/fs.html#fsaccesspath-mode-callback)); `EROFS`, "Read-only file system" ([access(2)](https://man7.org/linux/man-pages/man2/access.2.html)), means it's mounted read-only, and such a folder is added read-only by itself and can't be switched to managed. Any other refusal is `not-writable` unless the owner asked for read-only.
- **One check before every write: `rootFolders.assertWritable(path, what)`.** It refuses with `conflict` and reason `read-only`, saying "highsea only reads X, so it doesn't {what} there." The import pipeline (`movies/import.ts`) blocks an import from downloads into such a folder with that reason before naming anything; Library import's Rename to my format, the adopt's rename, and subtitles' writes and deletes (`subtitles/movies/tracks.ts`) all go through it.
- **Subtitles for a film highsea only reads are kept in the data folder**, under `<config>/subtitles/<sha256 of the film's folder>/`, with the name they'd have beside the film, and served from their stored path as any other track. The owner's own sidecars, beside the film or in a `Subs` folder, are recorded as before and never deleted.
- **The scan and watching work as before** on read-only folders: they only read. A film is adopted where it is, with no rename.
- **Health says which folders highsea only reads**, as a notice, not a problem (`folder-reads-only:`), and the free-space and hardlink checks leave them out.
- **The Synology package's wizard asks who manages the films** (`templates/synology/spk/`): another app's choice mounts the shared folder's `media` folder again over `/data/media` with `:ro` ("You can use the `readonly` or `ro` option to prevent the container from writing to the mount", [Docker: Bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)), so the kernel is the first guard and `assertWritable` the second. ADR 0057's dated section of 2026-11-15 has the details.
- **The admin**: Settings › Media management lists folders by kind with **Only read it** when adding and **Only read this folder** on each, a mounted one says so; Library import has no Rename to my format under such a folder.

## Consequences

- A mistake in a new write path is caught by one function, and its tests (`packages/media/test/movies/read-only.test.ts`) assert every path refused; a write path added later must call it.
- Moving a kind to highsea is switching its folder to managed, once the mount is read-write; nothing else changes.
- Subtitles kept in the data folder are part of highsea's data, so they're in its backups but not beside the film for other players; switching the folder to managed doesn't move them (left for when the owner switches a kind, Phase 5's later parts).
- NFOs and artwork aren't written to read-only folders; highsea doesn't write them for films yet, so nothing is lost now.
- Shows' and music's root folders exist before their libraries do; their scan answers `409 not-yet` until parts B and D.

## 2026-11-16: highsea's own folder in a shared folder another app uses (A1's NAS test)

The NAS test install on the owner's DS1520+ read the films without changing them (the listing of `/volume1/data/media/movies` matched before and after, 12,352 entries), but highsea made `trickplay/`, `transcodes/` and `hardware/` at the top of the owner's `data` shared folder, 211 files: the data folder was both the media root and where highsea keeps what it makes, and setup would have suggested the other stack's `downloads` folder for highsea's own downloads. The package was stopped and uninstalled, and the files, owned by the `highsea` user alone, were deleted with the owner's approval.

- **`HIGHSEA_WORK_DIR`** (`packages/runtime/src/config.ts`, `workDir(config)`) names highsea's own folder: images, scrub previews, the transcode cache and the hardware check's clip go there, and setup suggests `<work>/downloads` for downloads and doesn't count the folder as part of the library. Unset, it's the data folder, so every install so far is unchanged.
- **The Synology package sets it to `/data/highsea`** when the wizard is told another app manages the films (`HIGHSEA_WORK` in the compose project's `.env`). highsea creates the folder itself on first use: DSM grants the shared folder's permission at `WHEN_ENABLE`, after postinst, and starts the project at `WHEN_STARTUP`, before the start script ([data-share](https://help.synology.com/developer-guide/resource_acquisition/data_share.html), `FROM_ENABLE_TO_POSTUNINST`; [docker-project](https://help.synology.com/developer-guide/resource_acquisition/docker-project.html); [timing](https://help.synology.com/developer-guide/resource_acquisition/timing.html)), so no package script runs as `highsea` with access to the share before the container does.
- **The share's permission outlives the package.** Uninstalling left the `highsea` user's read-write entry on the shared folder (the data-share page says the folder is kept and says nothing of the permission); the test's entry was removed by hand. The guide says the `highsea` folder is kept on uninstall.
- **Confirmed on the NAS** with a second test install the same day: highsea created `/volume1/data/highsea` itself, setup suggested `/data/highsea/downloads`, the scan added the same 1,280 films with 12 waiting for a check, every file highsea made (174) was inside its folder, and the films' listing matched before and after. The test install, its folder and the permission entry were removed afterwards.
- **A backup's restore on the NAS** (a third test install, the owner's go-ahead of 2026-11-16): a backup made after the scan, a tag added, then the backup restored; highsea restarted, the tag was gone and the 1,280 films and 12 waiting were there. Both backups, the manual one and the one made before restoring, were written to the package's own folder, not the shared folder, and the films' listing matched before and after.

## 2026-11-17: the Synology package no longer mounts the media folder read-only (HT-31)

The owner decided that the package maps one shared folder and assumes nothing inside it (ADR 0057's section of this date). The package's **Another app does** step and its `:ro` mount of the share's `media` folder are gone, so on Synology a folder another app files is read-only in highsea alone, and `assertWritable` is the guard. Docker installs can still mount a folder `:ro`, and highsea still adds such a folder read-only by itself.

So setup asks instead, as the owner asked on 2026-11-17 before merging. Each library folder setup adds (movies, shows, music) is either managed or one highsea only reads, and the default is read-only when the folder already holds something:

- **What setup finds.** `detectFolders` (`packages/runtime/src/setup.ts`) suggests read-only for each folder `holdsFiles` finds anything in, leaving out hidden entries, ext4's `lost+found`, and DSM's own `@eaDir` and `#recycle`. Synology documents neither in its knowledge base; its community forum describes `@eaDir` as metadata and thumbnails DSM's indexing writes beside files, so leaving these out is a precaution, the same names the package's wizard already skips. An empty folder, or the layout highsea makes in an empty `/data`, is managed.
- **Review.** The **Folders** line marks each such folder **Only read**, with Settings' badge, and its editor has Settings' **Only read** switch under each library folder, with the same words. Finishing without a look keeps the suggestion. When highsea found no folders and asks for them, the switches start on, since a folder the owner points at most likely holds a library already. No new parts: the switch and badge are the library's, as Settings › Media management draws them, and the layout is the signed-off one with the switch under each field.
- **The server.** `SetupInput.folders.readOnly` carries the choice per kind. A kind left out is read-only when its folder held something before setup made any folder (`libraryReadOnly`), so a client that doesn't send it, or the API used directly, gets the same safe default. A folder mounted read-only stays read-only whatever was chosen, as before.

Consequences: an owner whose folders hold films highsea should manage, such as a library moved from another server, turns the switch off on Review or in Settings; until then imports go nowhere for that kind, and Health says which folders highsea only reads, as a notice.

## 2026-11-19: nothing is searched for in a folder highsea only reads (HT-113)

Writes weren't the only thing to switch off. A film in such a folder is now never searched, grabbed or upgraded on its own, is left off Wanted, and a Search on it is refused with `read-only`, as HT-109 does for a show; ADR 0045's section of this day has the details. The calendar still shows its dates.

