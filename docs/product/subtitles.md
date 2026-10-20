# Subtitles

- **Platforms:** Admin (`apps/server`), every breakpoint.
- **Prototype:** `#/admin/subtitles` (A10). A movie's subtitles are its page's Subtitles tab ([movies.md](movies.md#movie-detail-a6)).
- **Roadmap:** [Phase 2 › A10](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off), [Subtitles, first class](../roadmap.md#subtitles-first-class-highseasubtitles).

## Purpose

Subtitles are first class: highsea finds them for every movie it imports, scores them, and syncs them to the audio in the background. This page shows how that's going, lists what's still missing, and holds the settings that drive it: providers, language profiles, scoring and sync.

## Entry points

- Sidebar: **Subtitles** (staff).
- The dashboard's Subtitles widget.
- A movie's Subtitles tab, for one movie.

## Layout

- `PageHeader`: "Subtitles", one line of description.
- **Stats** card: synced today, waiting to sync, average correction (ms), average confidence. Four across from medium, two on compact.
- Tabs (line): **Wanted** (count), **Providers**, **Languages**, **Scoring and sync**.
- **Wanted:** a `TableFrame`. Toolbar: "12 movies missing a language" and **Search all**. Columns: movie (path under it), the missing languages as badges, **Search**.
- **Providers:** provider, account (the username, "Needs an account", or "Not needed"), requests left today (a bar and "184/200"; warning tone under 10%), an Enabled switch.
- **Languages:** one card per profile: its languages in order (with forced and SDH rules), the cutoff, the minimum score, **Edit**. Editing turns the card into a form in place: name; the ordered languages, each with a Forced select (Regular only, Regular and forced, Forced only), an SDH select (Without SDH, With or without SDH, SDH only), a drag handle and Remove; **Add a language**; Cutoff; Minimum score; **Save profile**, **Cancel**, **Delete**. **New profile** adds an empty one.
- **Scoring and sync:** a form (max 42rem): Minimum score; Prefer release matches; Sync to the audio; Minimum confidence (disabled while sync is off); Keep upgrading for N days; **Save** and **Discard changes** (enabled once something changed).

## States

- **Loading:** the stats card waits; each tab shows row skeletons.
- **Empty:** Wanted: "Every movie has its subtitles" · Movies show here when a language their profile asks for is missing.
- **Error:** "Couldn't load {the wanted list | the providers | the language profiles | the subtitle settings}" with **Try again**.
- **Live:** imports add tracks as the clock runs; their sync goes Waiting → Syncing → Synced, and the stats and wanted count follow.
- **Rate limited:** a provider out of requests shows an empty bar in warning tone; searches skip it until its limit resets.
- **No reduced states.** Only the owner and admins open the admin ([ADR 0032](../adr/0032-administrative-and-normal-access.md)); users get the refusal page.

## Interactions

- **Search all** searches every provider for every missing language and downloads the best match above the minimum score; the toast says what was found is downloading and syncing.
- **Search** (row) does the same for one movie.
- **Profiles:** order is preference. Each language has a drag handle, as the dashboard's widgets do: drag it, or press Space on it, move it with Up and Down, and Space again to drop it (Escape cancels); Remove also clears the cutoff if it pointed at that language. Save validates a name and at least one language.
- **Settings** save together, so a half-edited form never applies.
- **Keyboard:** every control is native or Radix; no drag.
- **Sound:** none.

## Copy

| Where | Text |
| --- | --- |
| Page description | highsea finds subtitles for every movie it imports, then syncs them to the audio. |
| Search all toast | Searched every provider · What was found is downloading and syncing. |
| Row search failed | Nothing found for {Title} · No provider has subtitles in that language yet. |
| Cutoff hint | Once this language is found, stop looking for better matches. |
| Minimum score hint | 0 to 100. A hash match scores about 95. |
| Prefer release matches | A subtitle made for this exact release beats one matched on title and year. |
| Sync to the audio | Every downloaded subtitle is lined up with the speech, in the background. |
| Minimum confidence | Below this, highsea keeps the original timing and marks the track for review. |
| Keep upgrading for | Look for a better match this many days after import. |

## Data

- `subtitles.stats()` → `GET /api/v1/subtitles/stats`: `SubtitleStats`.
- `subtitles.wanted()` → `GET /api/v1/subtitles/wanted`: available movies missing a language their profile lists, counting external tracks and embedded streams.
- `subtitles.searchAllMissing()` → `POST /api/v1/subtitles/wanted/search` (a background job in the product).
- `subtitles.search(id, language)`, `subtitles.download(id, result)` for one movie.
- `subtitles.providers()`, `subtitles.toggleProvider(id, enabled)` → `/api/v1/subtitles/providers`: `SubtitleProvider` with `rateLimitRemaining` and `rateLimitMax`.
- `subtitles.languageProfiles()`, `subtitles.saveLanguageProfile(profile)`, `subtitles.deleteLanguageProfile(id)` → `/api/v1/languageprofiles`: `LanguageProfile` with ordered `LanguageRule`s, `cutoff`, `minScore`.
- `subtitles.settings()`, `subtitles.saveSettings(patch)` → `GET|PATCH /api/v1/settings/subtitles`: `SubtitleSettings` (`minScore`, `autoSync`, `minConfidence`, `upgradeDays`, `preferReleaseMatch`).
- `subtitles.languages()` for names.
- Events: `subtitles.updated`.

## Decisions

- **Wanted is computed from profiles,** not from a fixed language list, and counts embedded streams, so a movie with built-in English isn't "missing" English.
- **Reorder by a drag handle,** like every reorderable list in the admin (the owner's call at the checkpoint 4 review); the handle's keyboard model keeps it keyboard-complete.
- **Edit in place.** A profile is short enough to edit inside its card; a dialog would hide the other profiles you're comparing against.
- **Low-confidence syncs keep the original timing** and are marked for review, rather than applying a correction the engine isn't sure of.
- **One minimum score in settings, raised per profile.** The global floor stops junk everywhere; a profile can ask for more.

## Open questions

- **Provider accounts.** Where do OpenSubtitles credentials get entered: a settings dialog per provider here, or in the setup wizard's subtitle step?
- **Provider order.** Should providers be ordered (ask OpenSubtitles first), or always searched together and ranked by score?
- **Review queue.** Low-confidence syncs are "marked for review"; is that a filter on Wanted, or its own tab?
- **Assigning profiles in bulk.** The library's bulk edit could set the language profile too.
