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

## 6b: extraction, the library scan and the existing-library import (2026-10-20)
- **Extraction** (`@highsea/media/shared` › `extract.ts`) is step 2 of the pipeline. `unar` runs as a child process the way ffprobe does: `execFile` with an argument array, stdin closed, a 30-minute timeout, `HIGHSEA_UNAR` or `unar` on the PATH. The arguments are unar's own ([unar.m in XADMaster](https://github.com/MacPaw/XADMaster/blob/master/unar.m)): `-q -f -D -o <folder> <archive>`. Without a terminal, unar never asks for a password: it prints "This archive requires a password to unpack" and exits with 2, which highsea reads as a password-protected release. Given a set's first volume (`.rar`, `.part1.rar`, `.7z.001`), XADMaster finds the rest, so later volumes are never passed.
  - The archives go into one folder beside the download, `{download}.unpacked`. It's written as `….partial` and renamed when every archive is out, so a second run reuses it (ADR 0022). The extracted files are hardlinked into the library like any others, and the folder is removed after the import. The archives stay to seed.
  - A password-protected release can never import, so the import answers `replace`, and downloads blocklists it and grabs another, as it does for a stalled release (ADR 0038). A damaged archive or a timeout blocks the import with unar's message.
  - With unar missing, the import is blocked with "unar isn’t installed…", and System › Health shows a warning, found at boot as ffprobe is. The Docker image installs `unar` from Debian main; CI installs `ffmpeg` and `unar`, so their tests run there instead of skipping.
- **The library scan** (`library.scan`, `@highsea/media/movies` › `scan.ts`) is the source of truth for what's on disk. It walks each root folder every 12 hours, as Jellyfin's library scan does ([RefreshMediaLibraryTask.cs](https://github.com/jellyfin/jellyfin/blob/master/Emby.Server.Implementations/ScheduledTasks/Tasks/RefreshMediaLibraryTask.cs), a 12-hour interval trigger), first 10 minutes after boot. It also scans a movie's folder after each import.
  - A video that appears in a movie's folder is probed and recorded against a version without a file, in place, unless it's a sample or an extra. One whose size or modification time changed is probed again. Both are kept in the file's `media_info`, so no schema change was needed.
  - A file that's gone clears its version's file and writes a `deleted` history entry. With **Stop monitoring deleted files** on, the movie stops being monitored, as Radarr's "Unmonitor Deleted Movies" does.
  - A root folder that can't be read (an unmounted disk) is skipped whole, so a missing disk never reads as every file deleted. A file is removed only when `lstat` says it's gone.
- **Watching** (`watching.ts`) only speeds the scan up. `fs.watch` with `recursive` watches each root folder. Node documents it as unreliable on network filesystems ([fs › Caveats](https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats)), and inotify's watch limit fails with `ENOSPC` ([inotify(7)](https://man7.org/linux/man-pages/man7/inotify.7.html)).
  - A change asks for a scan of its title folder after 5 quiet seconds.
  - A watch that can't start, or fails later, is closed and becomes a notice on System › Health; the 12-hourly scan still finds every change.
  - There's no chokidar, as judgement call 10 decided.
- **The existing-library import** (A17's Library import mode, the owner's answer 9; `library-import.ts`):
  - Each folder under a root folder is read with the parser (`Title (Year)`, `{tmdb-…}`, `{imdb-…}`) and matched on TMDB, which needs the key. A TMDB id is looked up directly, an IMDb id through TMDB's [Find by ID](https://developer.themoviedb.org/reference/find-by-id), and anything else by search, ranked on title and year.
  - A job (`library.import`) adds each confirmed movie where it is: the movie's folder is the existing folder, and its main file is recorded in place. Nothing moves, and nothing is renamed unless **Rename to my format** is ticked; then the folder takes the folder format and the file the file format.
  - Progress is one settings row, announced on `import.updated`. The job is safe to repeat: an add finds the movie, a renamed folder is found under its new name, and the file is recorded by path.
  - The routes are `POST /import/library/scan`, `POST /import/library` and `GET /import/library`, all staff-only.

## Consequences
- An interrupted import runs again and finishes once: the history row keyed on the download and the transaction make the record step happen once.
- With the TRaSH layout (one `/data` holding downloads and media), imports are hardlinks and seeding takes no extra space. On separate disks they're copies, and history says so.
- ffprobe is a separate GPL program run over arguments and pipes, which is aggregation, not a combined work ([GPL FAQ › Mere aggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)).
- A migrating owner's Radarr formats mean the same thing here, apart from the empty `{Release Group}`.

## 2026-10-27: the scan adds new folders it can match surely (4.1a's review)

At 4.1a's review the owner asked that adding a root folder should scan it, and chose (2026-10-27) that the scan adds what it can match surely and leaves the rest for Library import, both when a root folder is added and when a new folder appears later. Until then the scan only recorded files in the folders of movies already in the library, and films already on disk came in only through Library import, where the owner confirms each match (answer 9).

- **Adding a root folder** (`POST /api/v1/rootfolders`, and setup's movies folder once the TMDB key is saved) queues `library.scan` for that folder.
- **The scan** (`scan.ts`) gathers the title folders under a root folder that hold a video and belong to no movie, and hands them to the library import's `addNew` (`library-import.ts`). The 12-hourly scan and the watcher's scans of one title folder do the same, so a film copied into the library later is found as well.
- **A sure match** is one whose folder name carries a TMDB or IMDb id, or whose title (or original title) and year are TMDB's exactly. Library import's ranking still accepts a year off by one, as Radarr does; `addNew` doesn't, so a remake or a regional release year is never added unasked. A sure match is added as Library import adds it: in place, nothing renamed, with the first quality profile.
- **The rest wait.** Their folders are kept by root folder in one settings row (`libraryScan.waiting`). The root folder's `waiting` count leaves out any imported since or gone, and Settings › Media management shows it. The 12-hourly scan doesn't search TMDB again for a waiting folder, though a scan of that folder alone (a change the watcher saw) does. Without a TMDB key, nothing is matched and nothing is marked. A second copy of a movie already in the library doesn't wait. A downloads folder inside a root folder is left alone, so a download in progress is never added.
- Safe to repeat (ADR 0022): a folder that's a movie's is never handed over, and adding a movie that's in the library returns it.
