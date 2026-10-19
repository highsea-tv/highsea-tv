# Client search

- **Platforms:** Web and desktop, mobile, TV.
- **Prototype:** `#/web/search`, `#/mobile/search`, `#/tv/search` (C6, reference fidelity).
- **Roadmap:** [Phase 2 › C6](../roadmap.md#phase-2-design-prototypes-gate-user-sign-off).

## Purpose

Find something on the server by what you remember: part of a title, a genre, or someone in it. Results appear as you type. It searches what the server has; asking for something new comes with requests, later.

## Entry points

- Web: **Search** in the top bar (an icon on a phone-width window). Mobile: the **Search** tab. TV: **Search** in the global navigation.

## Layout

- **Web:** one wide field ("Titles, genres and people"), focused on arrival; with nothing typed, **Try** and a few quick picks (Comedy, Horror, Animation, Science fiction, Fritz Lang); then **People** (a chip each: photo, name, "3 movies here") and **Movies** with the count, as posters with the title and year.
- **Mobile:** the large title "Search", the field (16pt, so iOS doesn't zoom), the quick picks as chips; People as a row of portraits; Movies three a row with title and year.
- **TV:** the field and an on-screen keyboard (seven columns: a–z, - and ' in alphabetical rows; **&123** swaps in a second layout with the digits as a keypad on the left and common symbols beside them; under it &123, Space, Delete, Clear) on the left; on the right the quick picks, then "With Fritz Lang, …" and the results five a row (title and year under each).

## States

- **Empty query:** the quick picks.
- **Typing:** results follow about 150 ms after the last letter; "Searching…" until the first answer.
- **No results:** "Nothing on Harbor matches "{query}". Try part of a title, a genre or a name."
- **Error:** "Search didn't work." and the server's message.

## Interactions

- **A person** (web, mobile): picking them searches their name, so the results are their films.
- **TV:** the keyboard is a spatial grid; **Right** from its last column enters the results, **Left** from their first column comes back; **Up** from the keyboard opens the global navigation.
- **Sound:** TV only: `navigate`, `select`.

## Data

- `library.search(query)` → `GET /api/v1/search?q=`: `SearchResults` (`titles`: playable `ClientItem`s, title matches first; `people`: names that match, with how many of their films are here).
- Events: `movies.updated`.

## Decisions

- **People are found through their films,** so only people with something playable here appear, and picking one shows exactly that.
- **No search-as-you-type sounds on TV** beyond the keys' own.
- **Reference fidelity:** voice search and recent searches are left for later.

## Open questions

- **Recent searches:** keep the last few per device?
- **Voice on TV:** the platforms' dictation (tvOS, Android TV) fills the field; worth designing for now?
