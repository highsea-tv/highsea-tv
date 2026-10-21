# 0039. Importing

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
A finished download becomes a named file in the movie's folder, with its streams known, and the library says it's available ([phase-3-checkpoint-6.md › Importing](../plans/phase-3-checkpoint-6.md#importing)). The import runs as a job, and jobs run at least once (ADR 0022), so every step has to be safe to repeat. Owners migrating from Radarr expect its naming tokens to mean the same thing, and the TRaSH Guides' single `/data` root to give hardlinks.

## Decision
- **The pipeline** (`importDownload` in `@highsea/media/movies`), each step checking whether it already happened:
  1. **Find the files:** video files by extension. Skipped with a reason: samples (by name, then by runtime against the movie's, as Radarr's DetectSample does), `._` files, and extras by name, following Jellyfin's NamingOptions rules.
  2. **Refuse** a download holding an executable or another dangerous file, with the same copy the engine uses (ADR 0038).
  3. **Probe** with ffprobe as a child process (`-show_format -show_streams -of json`, a 60-second timeout, `HIGHSEA_FFPROBE` or `ffprobe` on the PATH). HDR comes from `color_transfer` (`smpte2084`, `arib-std-b67`), and Dolby Vision from the stream's DOVI configuration record. HDR10+ needs frame side data and waits for 6b.
  4. **Decide:** the quality comes from the release name (checkpoint 4's parser) and the probe's resolution. The profile's import specifications (quality, upgrade allowed, cutoff, upgrade) must accept it.
  5. **Name** it from Settings › Media management's templates.
  6. **Transfer:** a hardlink by default. When `link` fails with `EXDEV`, or the filesystem refuses it, the file is copied with `COPYFILE_FICLONE`, which makes a reflink where the filesystem has one ([Node: fs.copyFile](https://nodejs.org/docs/latest-v24.x/api/fs.html#fscopyfilesrc-dest-mode-callback)). History says which happened: "Copied: the downloads folder is on another disk." An unrelated file already at the destination is refused, never overwritten.
  7. **Replace** the version's older file: into the recycle bin when one is set, else deleted.
  8. **Record** it in one transaction: the `media_files` row with the probe, the version's `fileId`, the movie's status, and a history row keyed on the download, so a second run finds it and answers `already`.
  9. **NFO, artwork and permissions** when they're on; then the topics.
- **Naming** uses Radarr's tokens ([Radarr settings › Movie naming](https://wiki.servarr.com/radarr/settings#movie-naming-1)), including the conditional forms and its colon replacements:
  - the defaults are Radarr's: `{Movie Title} ({Release Year})` for the folder and `{Movie Title} ({Release Year}) {Quality Full}` for the file;
  - rename is on by default, unlike Radarr, because highsea owns the library from the first import;
  - `{Release Group}` is empty without a group, where Radarr writes "Radarr";
  - a second version gets ` - {label}` when the name would collide;
  - Settings' preview and A17's "becomes" column call the same function as the import.
- **Every path is checked** before anything is read or written. Each one is made absolute, resolved through symlinks (`fs.realpathSync`), and must land inside a root folder or the downloads folder. A path that doesn't exist yet is checked through its nearest existing parent, so a symlinked folder can't lead out.
- **NFO** follows Kodi's movie format ([Kodi: NFO files/Movies](https://kodi.wiki/view/NFO_files/Movies)), with `poster.jpg` and `fanart.jpg` from the image cache. It's off by default.
- **Permissions** follow Radarr's "Set Permissions": the chmod applies to new folders, and to new files without the execute bits.
- **The recycle bin** is emptied after a number of days (7 by default, Radarr's). A recycled file's time is updated only when it has no other hardlinks, so a copy that's still seeding keeps its own.
- **Manual import (A17)** scans a folder inside the allowed roots, matches each file to a movie, and imports the files the owner picks into the versions they choose. A file the owner picked is imported even when it's short; only a file with no video stream stops it.
- **6b:** extraction with `unar`, from Debian main (LGPL-2.1). unRAR and anything built from it are out: its licence forbids recreating the RAR algorithm, and Debian ships it in non-free. The library scan as the source of truth and the existing-library import come in 6b too.

## Consequences
- An interrupted import runs again and finishes once: the history row keyed on the download and the transaction make the record step happen once.
- With the TRaSH layout (one `/data` holding downloads and media), imports are hardlinks and seeding takes no extra space. On separate disks they're copies, and history says so.
- ffprobe is a separate GPL program run over arguments and pipes, which is aggregation, not a combined work ([GPL FAQ › Mere aggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)).
- A migrating owner's Radarr formats mean the same thing here, apart from the empty `{Release Group}`.
