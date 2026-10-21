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
- **Wanted:** a `TableFrame`. Toolbar: "12 movies missing a language" and **Search all**. Columns: movie (path under it), the missing languages as badges, **Search**. Pages of 50, by title, with **Show more** (checkpoint 7a).
- **Providers:** OpenSubtitles.com, Subdl and SubSource (checkpoint 7a). Columns: provider, account (the username or a masked key, "Needs an account", or "Not needed"), requests left today (a bar and "184/200"; warning tone under 10%; a dash when the provider doesn't say), an Enabled switch, and **Edit** for the owner. Under the table: "Subtitles provided by OpenSubtitles.com", as its terms ask of free keys.
- **Edit dialog** (owner only, checkpoint 7a, built like A9's): the provider's fields (OpenSubtitles.com: username and password; Subdl and SubSource: an API key). A saved secret shows as set and stays blank to keep it. **Test** signs in without saving and says what happened; **Save** keeps the account.
- **Languages:** one card per profile: its languages in order (with forced and SDH rules), the cutoff, the minimum score, **Edit**. Editing turns the card into a form in place: name; the ordered languages, each with a Forced select (Regular only, Regular and forced, Forced only), an SDH select (Without SDH, With or without SDH, SDH only), a drag handle and Remove; **Add a language**; Cutoff; Minimum score; **Save profile**, **Cancel**, **Delete**. **New profile** adds an empty one.
- **Scoring and sync:** a form (max 42rem): Minimum score; Prefer release matches; Sync to the audio; Minimum confidence (disabled while sync is off); Keep upgrading for N days; **Save** and **Discard changes** (enabled once something changed). Until the sync engine ships (checkpoint 7b), one caption under the sync settings: "Sync arrives in the next update."; they're saved but do nothing yet.

## States

- **Loading:** the stats card waits; each tab shows row skeletons.
- **Empty:** Wanted: "Every movie has its subtitles" · Movies show here when a language their profile asks for is missing.
- **Error:** "Couldn't load {the wanted list | the providers | the language profiles | the subtitle settings}" with **Try again**.
- **Live:** imports add tracks as the clock runs; their sync goes Waiting → Syncing → Synced, and the stats and wanted count follow.
- **Rate limited:** a provider out of requests, or waiting after errors, shows an empty bar in warning tone with the reason and when it's back; searches skip it until then. A refused sign-in also shows on System as a warning, and one out of downloads as a notice.
- **Unavailable:** a build without highsea's OpenSubtitles.com key shows that provider with its switch off and disabled, and the reason.
- **No account:** a provider that needs one can't be switched on: "Add your account first."

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
| Search all toast | Searching every provider · 3 movies are queued. What’s found downloads in the background. (7a; "and syncing" returns with 7b) |
| Edit dialog | Edit {Provider} · highsea signs in with your own account. It stays on this server. |
| A saved secret, left blank | Saved. Leave it empty to keep it. |
| Throttled, too many requests | Too many requests. Resumes {when}. |
| Throttled, out of downloads | Out of downloads for today. Resumes {when}. |
| Throttled, account refused | Refused the account. Check it in Edit. |
| Throttled, no answer | Didn’t answer. Tries again {when}. |
| Profile in use, delete refused | {Name} wasn’t deleted · the server's reason |
| Row search failed | Nothing found for {Title} · No provider has subtitles in that language yet. |
| Cutoff hint | Once this language is found, stop looking for better matches. |
| Minimum score hint | 0 to 100. A hash match scores about 99. |
| Prefer release matches | A subtitle made for this exact release beats one matched on title and year. |
| Sync to the audio | Every downloaded subtitle is lined up with the speech, in the background. |
| Minimum confidence | Below this, highsea keeps the original timing and marks the track for review. |
| Keep upgrading for | Look for a better match this many days after import. |
| Sync caption (until 7b) | Sync arrives in the next update. |
| Attribution | Subtitles provided by OpenSubtitles.com |
| Switch without an account | Add your account first. |
| No key in this build | This build of highsea has no OpenSubtitles.com key. The release images include one. |

## Data

As built in checkpoint 7a; the OpenAPI document at `/api/docs` has every shape. All staff, except saving and testing an account, which are the owner's.

| SDK | Route | |
| --- | --- | --- |
| `subtitles.stats()` | `GET /api/v1/subtitles/stats` | `SubtitleStats`; "today" is the server's UTC day |
| `subtitles.wanted({ query: { cursor, limit } })` | `GET /api/v1/subtitles/wanted` | `{ items, next, total }`: available movies missing a track their profile asks for, counting sidecars and embedded streams |
| `subtitles.searchAllMissing()` | `POST /api/v1/subtitles/wanted/search` | Queues a search per file; `{ queued }` |
| `subtitles.forItem({ params: { id } })` | `GET /api/v1/movies/{id}/subtitles` | The movie's sidecars (`external` and `bundled`); embedded streams come with its files |
| `subtitles.search({ params: { id }, body: { language, fileId? } })` | `POST /api/v1/movies/{id}/subtitles/search` | Results, best first, kept 30 minutes; 409 `no-providers`, 503 `providers-failed` |
| `subtitles.download({ params: { id }, body: { resultId } })` | `POST /api/v1/movies/{id}/subtitles` | **Use**: the track, kept from upgrades |
| `subtitles.delete({ params: { id } })` | `DELETE /api/v1/subtitles/{id}` | The sidecar and its record |
| `subtitles.providers()` | `GET /api/v1/subtitles/providers` | `SubtitleProvider`: account, requests left, throttle, fields, attribution |
| `subtitles.toggleProvider(…)` | `PATCH /api/v1/subtitles/providers/{id}` | `{ enabled }` |
| `subtitles.saveProvider(…)` | `PUT /api/v1/subtitles/providers/{id}` | Owner; in the audit log, without the credentials |
| `subtitles.testProvider(…)` | `POST /api/v1/subtitles/providers/{id}/test` | Owner; `{ ok, message, account }`, nothing saved |
| `subtitles.languages()` | `GET /api/v1/subtitles/languages` | ISO 639-1 plus `pt-BR`, `zh-Hans`, `zh-Hant` |
| `subtitles.languageProfiles()`, `createLanguageProfile`, `saveLanguageProfile`, `deleteLanguageProfile` | `/api/v1/languageprofiles` | 409 for a profile in use or the last one |
| `subtitles.settings()`, `saveSettings` | `GET|PATCH /api/v1/settings/subtitles` | `SubtitleSettings` |

- Events: `subtitles.updated`; a track's movie also gets `movies.updated`.

## Decisions

- **Wanted is computed from profiles,** not from a fixed language list, and counts embedded streams, so a movie with built-in English isn't "missing" English.
- **Reorder by a drag handle,** like every reorderable list in the admin (the owner's call at the checkpoint 4 review); the handle's keyboard model keeps it keyboard-complete.
- **Edit in place.** A profile is short enough to edit inside its card; a dialog would hide the other profiles you're comparing against.
- **Low-confidence syncs keep the original timing** and are marked for review, rather than applying a correction the engine isn't sure of.
- **One minimum score in settings, raised per profile.** The global floor stops junk everywhere; a profile can ask for more.
- **Scores are Bazarr's movie weights scaled to 100** ([ADR 0043](../adr/0043-subtitles.md)): a hash match is 99.
- **The rules mean what the selects say:** Regular and forced wants two tracks; Without SDH takes an SDH track only when nothing else exists, and removes its SDH text; With or without SDH takes either.
- **The cutoff** stops the search for the profile's other languages once the cutoff language is present, as Bazarr documents it.

## Answered questions

Answered by the owner on 2026-10-21 ([checkpoint 7's plan](../plans/phase-3-checkpoint-7.md#the-owners-answers)):

- **Provider accounts:** an Edit dialog per provider here, owner only.
- **Provider order:** searched together and ranked by score; no ordering UI.
- **Review queue:** none. A low-confidence sync shows "Not synced" with its confidence on the movie's Subtitles tab and keeps its timing.
- **Assigning profiles in bulk:** the library's bulk bar has a **Subtitle languages** menu.
