# Manual import

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `#/admin/activity/import` (A17, reference fidelity).
- **Built:** checkpoint 6a, 2026-10-20: `/activity/import` in `apps/server` (`src/admin/import.tsx`), on the import pipeline in `@highsea/media/movies` ([ADR 0039](../adr/0039-importing.md)). What real data changed is marked *As built*.
- **Roadmap:** [Phase 2 › A17](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), the movies pipeline's import step ([movies.md](movies.md)).

## Purpose

Bring in files highsea didn't download, or couldn't import on its own: a folder of old rips, a release that matched nothing, a file the owner moved by hand. Check what each file matched and the name it will get, then hardlink or move it into the library.

## Entry points

- Activity › **Manual import** in the page header (owners and admins).

## Layout

- Page header "Manual import", "Bring in files highsea didn't download, or couldn't import on its own.", and **Back to Activity**.
- **Folder:** the path (mono), **Look inside**, and the folders there as buttons, with **Up**. It opens on the downloads folder and looks inside straight away.
  - *As built:* the browser may go inside the data root, the root folders and the downloads folder, never elsewhere (paths are resolved through symlinks before the check). It starts in the downloads folder when it exists, else the data root, and **Up** stops at the top of what it may browse.
- **The files** (a table):
  - a toolbar: **Hardlink** or **Move** (with what each means), and **Import {n} files**;
  - each file: a checkbox (off for skipped or unmatched files), the file name (mono, the full path on hover) with why it's skipped ("A sample (18 MB). Skipped."), "Didn't match a movie. Choose one.", or **Imported**; the movie (a select of the library); the quality; the size; and what it **becomes** in the library, from the naming format ("Royal Wedding (1951)/Royal Wedding (1951) Bluray-1080p.mkv").
  - *As built:* **Becomes** is the server's name for the matched movie, from the same naming function as Settings › Media management's preview; a movie chosen by hand gets its name on the next **Look inside**, so the column shows a dash until then. A file ffprobe can't read says so ("ffprobe couldn't read the file. It may be damaged or not a video.") and is skipped.

## States

- **Before looking:** "Choose a folder, then look inside it."
- **Nothing there:** "Nothing to import here" · There are no video files in {folder}.
- **A missing folder:** the server's message under the path ("/data/nope doesn't exist on the server.").
- **Imported:** the rows say so and can't be picked again; a toast: "2 files imported · Renamed into the library." (*As built:* "Subtitles are next" waits for checkpoint 7.)
- **Some failed** (*as built*): each file comes back imported or with the reason it wasn't, in its row; the toast says "{n} files of {count} couldn't be imported. Each one says why."

## Interactions

- Picking a movie for an unmatched file selects it.
- **Import** hardlinks (or moves) the chosen files into their movies, renames them, and records each in History; the movies become available and their subtitle search starts.

## Data

As built in 6a; every route is staff.

| Call | Route | What |
| --- | --- | --- |
| `fs.list({ path? })` | `GET /api/v1/fs` | `FsListing`: the path, its `parent` while still inside what highsea may browse, and the folders and files. No path: the downloads folder |
| `manualImport.scan({ path })` | `POST /api/v1/import/scan` | `ImportCandidate[]`: path, size, quality, language, the matched movie and version, why it would be skipped, and what it `becomes` |
| `manualImport.run({ files, mode })` | `POST /api/v1/import` | `files` are `{ path, movieId, versionId? }`, up to 500; `mode` is `hardlink` (copy when it can't) or `move`. `ImportRunResult`: each file's outcome and message |

- Events: `item.updated` for each movie, `history.updated`.

## Decisions

- **Hardlink by default,** as everywhere: no extra space, and anything still seeding keeps seeding. Move is there for files that aren't in a torrent.
- **Skipped files are shown, not hidden,** with why, so a sample or an extra doesn't look like a missing file.
- **It opens on the downloads folder,** where stray files usually are.
- **Several files for one movie: a version per row** (answered by the owner on 2026-10-20, [checkpoint 6, answer 8](../plans/phase-3-checkpoint-6.md#checkpoint-questions)). Each file goes to one of the movie's versions, defaulting to the first without a file. *As built in 6a:* the scan picks the version and the API takes `versionId`; the screen has no version select yet. When every version already has a file, the first version's is replaced, its old file going to the recycle bin when one is set; when two versions' files would get the same name, the version's label is added (`… Bluray-1080p - Director's Cut.mkv`).

## Open questions

- **Language detection** from the audio, for files with no language in the name?
