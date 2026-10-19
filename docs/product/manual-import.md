# Manual import

- **Platforms:** Admin, every breakpoint.
- **Prototype:** `#/admin/activity/import` (A17, reference fidelity).
- **Roadmap:** [Phase 2 › A17](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), the movies pipeline's import step ([movies.md](movies.md)).

## Purpose

Bring in files highsea didn't download, or couldn't import on its own: a folder of old rips, a release that matched nothing, a file the owner moved by hand. Check what each file matched and the name it will get, then hardlink or move it into the library.

## Entry points

- Activity › **Manual import** in the page header (owners and admins).

## Layout

- Page header "Manual import", "Bring in files highsea didn't download, or couldn't import on its own.", and **Back to Activity**.
- **Folder:** the path (mono), **Look inside**, and the folders there as buttons, with **Up**. It opens on the downloads folder and looks inside straight away.
- **The files** (a table):
  - a toolbar: **Hardlink** or **Move** (with what each means), and **Import {n} files**;
  - each file: a checkbox (off for skipped or unmatched files), the file name (mono, the full path on hover) with why it's skipped ("A sample (18 MB). Skipped."), "Didn't match a movie. Choose one.", or **Imported**; the movie (a select of the library); the quality; the size; and what it **becomes** in the library, from the naming format ("Royal Wedding (1951)/Royal Wedding (1951) Bluray-1080p.mkv").

## States

- **Before looking:** "Choose a folder, then look inside it."
- **Nothing there:** "Nothing to import here" · There are no video files in {folder}.
- **A missing folder:** the server's message under the path ("/data/nope doesn't exist on the server.").
- **Imported:** the rows say so and can't be picked again; a toast: "2 files imported · Renamed into the library. Subtitles are next."

## Interactions

- Picking a movie for an unmatched file selects it.
- **Import** hardlinks (or moves) the chosen files into their movies, renames them, and records each in History; the movies become available and their subtitle search starts.

## Data

- `fs.list(path)`; `manualImport.scan(path)` → `POST /api/v1/import/scan` (`ImportCandidate[]`: path, size, quality, language, the matched movie, why it would be skipped); `manualImport.run(files, mode)` → `POST /api/v1/import`.
- `settings.get('media')` for the naming format.
- Events: `movies.updated`, `history.updated`.

## Decisions

- **Hardlink by default,** as everywhere: no extra space, and anything still seeding keeps seeding. Move is there for files that aren't in a torrent.
- **Skipped files are shown, not hidden,** with why, so a sample or an extra doesn't look like a missing file.
- **It opens on the downloads folder,** where stray files usually are.

## Open questions

- **Several files for one movie** (a cut and its extras): import them as versions, or ask which is the main one?
- **Language detection** from the audio, for files with no language in the name?
