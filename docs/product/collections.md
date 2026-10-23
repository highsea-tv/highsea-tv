# Collections: smart and hand-picked

- **Platforms:** Admin (`apps/server`), every breakpoint, for owners and admins. What it makes shows in every client's library.
- **Prototype:** `#/admin/collections` (the list), `#/admin/collections/{id|new}` (the editor) (A19); `#/web/library/collections`, `#/mobile/library/collections`, `#/tv/library/collections` and each app's `/collections/{id}` (C9).
- **Plan:** [smart-collections.md](../plans/smart-collections.md), with the owner's answers. The section composer's side is [curation.md](curation.md#the-composers); TMDB's collections are [client-search.md](client-search.md#collections).

## Purpose

Films grouped by the owner: by rules that keep themselves current ("released 2010–2020, rated 4.5 or more, in English"; "scored by Jan Morgenstern") or picked by hand ("Staff picks"). Emby and Jellyfin only have hand-made collections; a smart collection follows the library as films arrive, leave or change. Each one shows in every app's Library › Collections and can feed a featured section on Home.

## Entry points

- Sidebar › **Collections**, in the library group below Movies.
- The Movies library's **Save as smart collection**, which opens a new collection with the library's current filter, search and sort as its first rules.
- Curation's section composer: **A collection** as a section's rule, with "Make one in Collections."
- The palette ("collections", "smart collections").

## One kind of collection

A collection has a name, a summary, artwork, and its films. The films come from **rules**, from **picks**, or both:

- **Use rules:** the films that match, then **Always include** adds films whatever the rules say, and **Never include** leaves films out. A film in both lists is left out: Never include wins.
- **Pick them:** no rules; the films picked, in the order they're dragged into. Switching back to rules restores the rules that were there.
- A collection with rules is **Smart**; one without is **Picked**. Both are listed together.

## Layout

### The list

- Page header: "Collections", "Films grouped by rules that keep themselves up to date, or picked by hand. They show in every app’s library.", and **New collection**.
- One card each, in the order they were made:
  - the artwork (the uploaded poster, or a mosaic of the first four posters, as Plex draws a smart collection's);
  - the name (a link to the editor), **Smart** or **Picked**, and **Hidden in the apps** when films match but none has a file;
  - the rules in words ("Released 2010–2020, rated 4.5 or more, in English");
  - what it holds and who sees it: "4 films, 3 in the apps · Everyone", "6 films, all in the apps", "Nothing matches yet";
  - **Edit**, and **Delete** with a confirmation: "It leaves every app’s library. The films in it stay in the library."
- **Empty:** "No collections yet", "Describe the films you want, say from the 2010s, rated 4.5 or more, in English, and the collection keeps up as the library changes. Or pick films by hand.", and **Make one**.

### The editor

Two columns from expanded (the form, and the result beside it and sticky); stacked below expanded, the result second.

- **Name** (required) and **Summary** (optional, shown on the collection's page in the apps).
- **Artwork:** **Upload a poster**, or **Use the mosaic** (the default).
- **Films:** **Use rules** or **Pick them** (segmented).
- **The rules:**
  - **Match all of these conditions** or **Match any of these conditions**.
  - Each condition is a row: the field, the comparison, the value, and **Remove condition N**. The value control follows the field:
    - numbers, with a unit where it helps ("stars", "min", "GB"); **between** has a from and a to;
    - relative dates: "in the last N years" or "N days";
    - dates;
    - one choice (a select) or several (a menu of checkboxes: genres, languages, keywords, studios, countries, tags);
    - people: a search over the library's cast and crew, with the chosen ones as chips;
    - text (Title contains).
  - **Add a group** adds a group with its own Match all or any, one level deep: "all of these, and any of those". **Remove group N**, and **Add a condition to group N**.
  - **Add a condition** adds a Year condition.
  - With no conditions: "No conditions yet, so every film is in it. Add one to narrow it down."
  - Errors show under the row once Save has been tried: "Choose at least one.", "Fill this in.", "Enter a number."; above the rules, "Finish the conditions marked below."
- **Picked films** (Pick them): search the library, add, reorder by the drag handle (or the keyboard, as every sortable list), remove. "Pick at least one film." when there are none.
- **Exceptions** (Use rules): **Always include** and **Never include**, each a search with the chosen films listed.
- **Order:** **Sort by** Rating, Release date, Year, Date added, Title, Runtime, Popularity, At random (once a day), or Picked order; **Direction** (Highest first, Lowest first, and so on, in the field's words); **How many** (empty for all).
- **Who sees it:** the audience of announcements and featured sections: Everyone, Roles, People or Apps.
- **Save collection** (**Save changes** for a saved one), **Cancel**, and **Delete** for a saved one.
- **Right now** (the region "What it holds now"), updating as the rules change:
  - "4 films match; 3 have a file and show in the apps." Or "No films match yet. The apps don’t show it until one does.";
  - the rules in words;
  - the posters in the collection's order; a film without a file is dimmed.

### The fields

One condition is one field, one comparison and one value. The editor lists the fields in groups. "In the last N" is relative, so "Released in the last two years" stays current.

| Group | Field | Comparisons |
| --- | --- | --- |
| Release | Year | is, between, before, after, in the last N years |
| | Release date | before, after, in the last N days |
| | Decade | is, is not |
| Ratings | Rating (out of 5) | at least, at most, between |
| | Votes | at least |
| | Certification | is, is not, at most |
| Language | Original language | is, is not, is one of |
| | Audio language | includes, only, doesn't include |
| | Subtitle language | includes, doesn't include |
| Content | Title | contains |
| | Genre | includes any of, includes all of, includes none of |
| | Runtime | at least, at most, between |
| | Keyword | includes any of, includes none of |
| | Studio, Country | is one of, is not one of |
| People | Actor, Director, Writer, Composer, Producer, Cinematographer, Editor | includes, doesn't include |
| | Anyone in the cast and crew | includes, doesn't include |
| | In a collection | is in, is not in (TMDB's, or another of the server's; never itself) |
| Library | Status | is, is not (In the library, Wanted, Downloading) |
| | Date added | in the last N days, before, after |
| | Tag | has any of, has all of, has none of |
| | Root folder, Quality profile | is, is not |
| File | Resolution | is, at least |
| | HDR | is (Any HDR, Dolby Vision, HDR10, None) |
| | Video codec, Edition | is, is not |
| | Size | at least, at most |
| Playback | Watched, Last played | disabled: "Comes with playback" (Phase 4) |

**People, one field per role.** Each role is its own field, so "Composer includes Hans Zimmer" matches only films he scored, not ones he appears in. The roles come from TMDB's credits: Actor is the cast; Director, Writer (Screenplay, Writer, Story), Producer, Cinematographer (Director of Photography), Editor, and Composer, which is crew with the job "Original Music Composer" in the Sound department. **Anyone in the cast and crew** matches a person in any role. "Includes" with several people matches a film with any of them.

**Choices come from the library.** Genres, languages, keywords, studios, countries, tags, root folders, profiles and the people search list only what the library has, so every choice can match something.

### The rules in words

The apps and the admin's list say what a collection is, in a sentence: "Released 2010–2020, rated 4.5 or more, in English"; "Scored by Jan Morgenstern"; "About zombie or (about vampire, released before 1970)". Match all joins with commas, Match any with "or"; a group sits in brackets. A picked collection has no words.

## In the apps

- **Library › Collections:** Movies and Collections are the library's two views (links on web and mobile, a pair of choices on TV). The grid holds the server's collections first, then TMDB's that have films here. A smart one (with rules) carries a **Smart** mark (the filter icon) on its art; a hand-picked one carries none, and its label reads "name, smart collection, 6 movies · 2010–2020".
- **What a person sees:** only collections whose audience includes them, and in each only films they can play (with a file in Phase 3; parental controls come later). A collection with nothing to play is hidden, as an empty featured section is.
- **The collection page:** "Smart collection" above the name ("Collection" for a hand-picked one or TMDB's), the count and years, the rules in words, the summary, then the films in the collection's order. Back on mobile falls back to Library › Collections.
- **TV:** the nav goes down to Movies and Collections; from there Down reaches the grid and Right (on Movies) the sort. Focus starts on the first collection.

## States

- **Loading:** skeleton posters (web, mobile), a spinner (TV); the editor's result keeps the last result while a new one is worked out ("Checking what it holds…" the first time).
- **Error:** "Couldn’t load the collections" with **Try again**. A collection that's gone or hidden from this person: "That collection isn’t on this server.", "It may have been removed.", with **Collections** (web, mobile) or **Search** (TV).
- **Saving:** the form says what's missing first ("Give the collection a name. The apps show it."); the server refuses the rest with the reason: "Give the collection a name.", "Add a rule, or pick at least one film.", "A collection can’t be one of its own rules.", "Groups go one level deep." In the toast "Couldn’t save the collection".
- **Deleting** a collection a featured section uses is refused: "The featured section “The silent era” draws on it. Choose another source for the section first."

## Events

- `collections.updated`, to staff, when one is saved or deleted; the list, the editor's choices and the section composer refresh.
- The apps' Library › Collections and collection pages refresh on `collections.updated` and `movies.updated`.

## Accessibility

- The rule builder is an ordered list ("Rules"); every control is labelled with its condition's number ("Condition 2: field", "Condition 2: comparison", "Remove condition 2"), and a group's with its group's.
- The result panel is a labelled region ("What it holds now") and announces its count politely.
- The art is decorative; each tile's link label carries the name, the smart mark and the caption.
- TV: every tile and choice is reachable by D-pad, with focus guides between the nav, the choices, the sort and the grid.

## Copy

Plain and calm, no exclamation marks: "Comes with playback", "Nothing matches yet", "Hidden in the apps", "Yours first, then TMDB’s. Make one in Collections."
