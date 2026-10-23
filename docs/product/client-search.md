# Client search

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/search`, `#/mobile/search`, `#/tv/search` (C6, reference fidelity); a collection at `#/{platform}/collections/{id}`.
- **Roadmap:** [Phase 2 › C6](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off).

## Purpose

Find something on the server by what you remember: part of a title, a genre, a collection, or someone in it. Results appear as you type. It searches what the server has; asking for something new comes with requests, later.

## Entry points

- Web: **Search** in the top bar (an icon on a phone-width window). Mobile: the **Search** tab. TV: **Search** in the global navigation.

## Layout

Results come in a **section per kind**, the best-matching kind first: **Movies**, **Collections** and **People** today, with shows, episodes and music joining as sections once the server has them. Each section is headed by its kind (and, on web and mobile, its count).

- **Web:** one wide field ("Titles, genres and people"), focused on arrival; with nothing typed, **Try** and a few quick picks (Comedy, Horror, Animation, Science fiction, Fritz Lang). Movies and Collections as posters with a title and caption (the year; for a collection, "3 movies · 2013–2016"); People as chips (photo, name, "3 movies here").
- **Mobile:** the large title "Search", the field (16pt, so iOS doesn't zoom), the quick picks as chips; Movies three a row; Collections as a sideways row of posters; People as a row of portraits.
- **TV:** the field and an on-screen keyboard (seven columns: a–z, - and ' in alphabetical rows; **&123** swaps in a second layout with the digits as a keypad on the left and common symbols beside them; under it &123, Space, Delete, Clear) on the left; on the right the quick picks, then the sections: Movies and Collections five a row (title and caption under each), People as buttons with a photo.

### Collections

A collection opens a page of its own: "Collection", its name, "3 movies here · 2013–2016" and its overview over the first part's backdrop (blurred on the TV), then its titles on this server, oldest first (a grid on web and mobile, a row on the TV). Only the parts on this server count; a collection with none here isn't shown.

## States

- **Empty query:** the quick picks.
- **Typing:** results follow about 150 ms after the last letter; "Searching…" until the first answer.
- **No results:** "Nothing on Harbor matches "{query}". Try part of a title, a genre or a name."
- **Error:** "Search didn't work." and the server's message.
- **Coming back:** Back from a result returns to the same query and results (and, on the TV, the remote on the result that was opened). Opening Search afresh starts empty.

## Interactions

- **A person:** picking them searches their name, so the results are their films.
- **TV:** the keyboard is a spatial grid; **Right** from its last column enters the results, **Left** from their first column comes back; **Up** from the keyboard opens the global navigation.
- **TV focus:** typing never moves focus off the keyboard, however the results change. Focus moves on its own only when the button pressed goes away: a quick pick or a person hands focus to the first result (or back to the keys when there are none).
- **Sound:** TV only: `navigate`, `select`.

## Data

Through `@highsea-tv/sdk` (the contract is `@highsea-tv/api-contract`'s `library` group), as built in Phase 3, checkpoint 4. Everyone signed in.

- `library.search({ query: { query } })` → `GET /api/v1/search?query=`: `SearchResults`, `sections` in ranked order, each `{ kind, items }`, up to 20 items a section:
  - `movies`: library `ClientItem`s by title, genre or person (cast or crew), title matches first. Each says whether it's `playable`; none is until files arrive (checkpoint 6);
  - `collections`: `ClientCollection`s (`id`, `name`, `overview`, `art`, `count` here, `years`) by name or a part's title, counting only the parts here;
  - `people`: `SearchPerson`s (`id`, `name`, `photo`, `titles` here) whose names match;
  - `discover`: for people who may ask for titles (the owner and admins always, a user with **Ask for titles**), TMDB's matches that aren't here, as `DiscoverMovie`s marked for a request, after the rest; left out when TMDB can't be reached or no key is set. The request flow comes with its own checkpoint, so until then the server leaves this section out for everyone ([ADR 0032](../adr/0032-administrative-and-normal-access.md)). Apps skip kinds they don't know.
- **Clients are for watching.** Search behaves the same for everyone, staff included, and never offers an administrative action such as adding a title.
- **Ranking:** a kind with a name that starts with the query (at a word) comes first, then one with a name containing it, then the rest; ties keep the order above. Empty kinds are left out.
- **A collection's page** reads `metadata.collection({ params: { id } })` → `GET /api/v1/collections/{id}`, the media pages' route ([media-pages.md › Data](media-pages.md#data)): the collection and all its parts, oldest first, each with `inLibrary`. The page shows the parts here.
- The query lives in the page's history entry (the prototype keeps it in `history.state`), not in storage.
- Events: `movies.updated`.

## Decisions

- **Sections by kind, ranked by match:** "lang" leads with Fritz Lang, "caminandes" with the films and then their collection. A fixed order would bury the kind the person meant.
- **New kinds are new sections:** the response is a list of typed sections, and a client skips a kind it doesn't know, so older apps keep working when the server adds shows or music.
- **People are found through their films,** so only people with something playable here appear, and picking one shows exactly that.
- **The query belongs to the visit:** Back restores it, a fresh visit doesn't. Recent searches, if they come, are a separate list.
- **No search-as-you-type sounds on TV** beyond the keys' own.
- **Reference fidelity:** voice search and recent searches are left for later.

## Open questions

- **Recent searches:** keep the last few per device?
- **Voice on TV:** the platforms' dictation (tvOS, Android TV) fills the field; worth designing for now?
- **Collections elsewhere:** link a movie's detail to its collection ("Part of the Caminandes Collection"), and browse collections in the library?
