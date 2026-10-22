# Plan: smart collections

- **Status:** Requested by the owner on 2026-10-21, after checkpoint 8c's review: "the owner and admins should be able to create smart collections using combinations of filters. For example, a collection of films released between the years 2010 and 2020 with ratings of 4.5+ in English only." Scoped, planned and prototyped the same day; nothing is built. When it's built depends on [question 1](#open-questions-for-the-owner).
- **Gate:** the owner answers the open questions and approves the prototype before anything is built, as for any new screen. The prototype is in `design/prototypes` ([what it covers](#the-prototype)); its spec is [collections.md](../product/collections.md).
- **Parent plans:** [phase-3-server.md](phase-3-server.md) and its standing rules, and [phase-3-checkpoint-8.md](phase-3-checkpoint-8.md), whose curation this extends. The roadmap lists smart collections under "[Later] Discovery inside the server"; the owner's request brings them forward ([question 1](#open-questions-for-the-owner)).

## Why

A smart collection is a saved set of rules that keeps itself up to date: every film that matches is in it, and a film that stops matching leaves. Plex has had them since 2021. Jellyfin and Emby still don't have them built in.

- **Plex** saves a library filter and sort as a smart collection: "Any future items that meet the filter criteria will automatically be included and things which no longer meet the criteria will no longer be shown in the collection." Its advanced filters match all or any of a set of conditions, in groups. A smart collection "always" sorts by its filter's sort and can't be reordered by hand, and its poster is "up to 4 images from items in that collection" until one is chosen ([Plex Support: Collections](https://support.plex.tv/articles/201273953-collections/)).
- **Kometa** writes the same filters for Plex from YAML: a base of `any` or `all`, nested as deep as needed. Each condition is an attribute, a modifier and a value:
  - **Modifiers:** `.not`, `.is`, `.begins`, `.gte`, `.lte`, `.before`, `.after`, and dates "in the last X days".
  - **Relative years:** `current_year-2`.
  - **Sorting:** a sort, with an optional limit ([Kometa: Plex Smart Filter](https://kometa.wiki/en/latest/files/builders/plex/smart-filter/)).
- **Emby:** smart playlists and views are its longest-standing feature request. The forum thread is about eight years old, and staff called it "still on our radar" in 2022 ([Emby forum: smart playlists/views](https://emby.media/community/topic/36916-smart-playlistsviews/page/5)). A third-party plugin covers part of it.
- **Jellyfin:** a community plugin is the only route ([jellyfin-smartlists-plugin](https://newreleases.io/project/github/jyourstone/jellyfin-smartlists-plugin/release/v12.0.0.18-rc)). It added collections in a release candidate, and its maintainer asked for evidence that anyone wanted them ([Jellyfin forum: smart playlists](https://forum.jellyfin.org/t-smart-playlists--11816?page=3)).

highsea takes Plex's model, where a collection is a saved filter that clients show like any other collection. It closes the gaps Plex leaves:

- **Hand-made exceptions:** always include this film, never include that one. In Plex, a smart collection can't be adjusted by hand.
- **One editor for both kinds:** smart and hand-picked collections are built in the same place. A collection with no rules is a hand-picked list.
- **A live count and posters while building,** so the owner sees what the rules pick before saving.
- **Language from the files themselves,** so "English only" can mean the audio, not just the film's original language.
- **Collections feed the rest of curation:** a featured section on Home can show a collection.

## What a smart collection is

- **Name, summary and artwork.** By default the artwork is a mosaic of the first four posters, as Plex does. The owner can upload a poster and a backdrop instead (ADR 0028's files the owner uploads).
- **Rules:**
  - **Match all** or **Match any** of a list of conditions.
  - Conditions can be grouped, one level deep: "all of these, and any of those" ([question 3](#open-questions-for-the-owner)).
  - A collection with no rules holds only what's picked by hand.
- **Always include and Never include:** films added or left out by hand, whatever the rules say ([question 4](#open-questions-for-the-owner)).
- **Sort and limit:**
  - **Sort** by rating, release date, year, date added, title, runtime or popularity, either way, or at random. Random changes once a day, so a row doesn't reshuffle on every visit.
  - **Limit:** none by default, or "the first N".
  - A hand-picked collection keeps the order it was dragged into.
- **Who sees it:** the audience model of announcements and featured sections (everyone, roles, people, apps), Everyone by default ([question 7](#open-questions-for-the-owner)).
- **Where it shows:**
  - in the apps' Library › Collections, beside TMDB's collections, marked with the smart icon;
  - on its own collection page in each app;
  - as a source for a featured section on Home (**A collection** replaces the free-text "saved filter" rule);
  - in the admin, on its own Collections page.

### The conditions

The fields are the ones highsea knows for every film once it's in the library. Each is listed with its comparisons. "In the last N days" and "this year minus N" are relative, so a collection like "Released in the last two years" stays current.

| Group | Field | Comparisons |
| --- | --- | --- |
| Release | Year | is, between, before, after, in the last N years |
| | Release date | before, after, in the last N days |
| | Decade | is, is not |
| Ratings | Rating (out of 5, as the admin shows it) | at least, at most, between |
| | Votes | at least (so a 5-star film with three votes doesn't count) |
| | Certification | is, is not, at most (by the country's order) |
| Language | Original language | is, is not, is one of |
| | Audio language (from the files) | includes, only, doesn't include |
| | Subtitle language (from the files and sidecars) | includes, doesn't include |
| Content | Genre | includes any of, includes all of, includes none of |
| | Runtime | at least, at most, between |
| | Keyword (TMDB's) | includes any of, includes none of ([question 6](#open-questions-for-the-owner)) |
| | Studio, Country | is one of, is not one of |
| | Actor, Director, Writer, Composer, Producer, Cinematographer, Editor | includes, doesn't include (a person search); one condition per role, so "Hans Zimmer as composer" is its own rule |
| | Anyone in the cast and crew | includes, doesn't include (a person in any role) |
| | In a collection | is in, is not in (a TMDB collection, or another of the server's; never itself) |
| Library | Date added | in the last N days, before, after |
| | Tag | has any of, has all of, has none of |
| | Root folder, Quality profile | is, is not |
| File | Resolution | is, at least |
| | HDR | any HDR, Dolby Vision, HDR10, none |
| | Video codec, Edition | is, is not |
| | Size | at least, at most |

**Watched, unwatched and last played** are reserved for Phase 4. They need watch state, which comes with playback; the editor lists them as "Comes with playback" so the owner knows they're planned.

**The owner's example:**
1. Year, between, 2010 and 2020.
2. Rating, at least, 4.5.
3. Original language, is, English; or Audio language, only, English ([question 2](#open-questions-for-the-owner)).

The rules are matched with **Match all**. The prototype's seed includes this collection.

### What the apps show

- **What a person can play:** a collection shows only the films a person can play, meaning films with a file in Phase 3 and, later, what parental controls allow ([question 5](#open-questions-for-the-owner)).
- **A collection that matches nothing** is hidden from the apps, as an empty featured section is.
- **In the admin,** the editor shows both counts: "38 films match; 31 have a file and show in the apps."

## How it would be built

Built only after the owner's answers. The sketch gives an idea of the size.

- **Package:** smart collections become a new subpath of curation, `@highsea/curation/collections`. Like featured sections, it reaches the library through the runtime, so curation still never imports media (ADR 0036). An ADR records the rule format and how it's evaluated.
- **Rules:**
  - stored as a JSON tree with a zod schema in the contract, so a client or a script can build one;
  - checked when saved: unknown fields, impossible ranges, or a collection that includes itself are refused with the field named.
- **Evaluated live,** not stored as membership:
  - Each rule tree is compiled to one SQL query against indexed columns, so a collection is always current and nothing has to be rebuilt after an import.
  - The library-scale test (100k films) gains collection queries, and each must use an index, as the library's filters already do.
- **Columns the rules need,** in one migration. Today these sit only in TMDB's JSON or the probe's JSON:
  - original language, runtime, certification, popularity;
  - genres, keywords, studios and countries, each as its own table;
  - each file's resolution, HDR, video codec and audio and subtitle languages.

  The metadata refresh and the import fill them, and a one-time job fills them for films already in the library.
- **Events:**
  - `collections.updated` for staff when a collection is saved;
  - `home.updated` to the people whose home changes when the library changes what a collection holds. The fingerprint is per person, as curation already does.
- **API:**
  - the collections' CRUD for staff, plus a dry run (`POST /collections/preview`) that the editor calls as rules change;
  - `GET /collections/fields` for the editor's choices: genres, languages, studios, tags and so on, from what's in the library;
  - for the apps, `GET /library/collections?client=` and `GET /library/collections/{id}?client=`, audience applied.
- **Admin:**
  - a **Collections** page in the sidebar's library group, holding the list and the editor;
  - **Save as smart collection** on the Movies library, starting from its current filters;
  - **A collection** as a featured section's source.

## The prototype

The prototype is added to `design/prototypes`, built like Phase 2's screens on the mock server. Reviewing it is the gate.

- **Admin:**
  - **Collections:**
    - the list, with each collection's poster mosaic, name, kind (Smart or Picked), what it holds now, its audience, Edit and Delete;
    - an empty state.
  - **The collection editor:**
    - name, summary and artwork;
    - the rule builder: Match all or any, conditions with field, comparison and value, groups, Add a condition, Add a group;
    - Always include and Never include;
    - sort and limit, and who sees it;
    - a live result beside it: the count, both numbers and the posters, updating as rules change.
  - **The Movies library:** **Save as smart collection**.
  - **Curation's section composer:** **A collection** as a rule.
- **Apps:**
  - **Library › Collections** on web, mobile and TV, with smart collections beside TMDB's;
  - **the collection page,** with its smart mark and the summary of its rules in words ("Released 2010–2020, rated 4.5 or more, in English").
- **Data:** the seed gains the owner's example, a hand-picked collection ("Staff picks"), one with exceptions, and one that matches nothing. The mock's filter evaluates real rules over the seed's films, so the count and posters are true to the rules.

## Open questions for the owner

Each has a recommendation; the first option is it.

1. **When.**
   - **Recommended:** as checkpoint **8d**, after 8c and before checkpoint 9 (release). That covers the server, the API and the admin, with the apps' screens in the prototype now and built with the apps in Phase 4, as featured sections were. The parent plan's decision 1 keeps every [M1] item; this adds one, from [Later].
   - Or: a follow-up after Phase 3's sign-off, like dashboard customization.
   - Or: with the apps in Phase 4.
2. **"In English only".**
   - **Recommended:** offer both. **Original language** is the film's own language from TMDB. **Audio language, only** means every audio track in the file is that language, so a dubbed copy or a multi-language release doesn't count. The example uses original language, and the owner can switch it.
   - Or: language means only the original language.
   - Or: language means only the audio in the file.
3. **How rules combine.**
   - **Recommended:** Match all or any, with groups one level deep. That covers "2010–2020, 4.5+, and either English or French" and stays readable on a phone.
   - Or: Match all or any, with no groups.
   - Or: unlimited nesting, as Kometa allows.
4. **Hand-picked collections and exceptions.**
   - **Recommended:** one kind of collection. Rules are optional, and Always include and Never include are on every collection. A collection with no rules is hand-picked and keeps the order it's dragged into.
   - Or: smart collections only, with no exceptions, as Plex does.
   - Or: separate smart and hand-picked kinds.
5. **Films without a file.**
   - **Recommended:** the apps show only what a person can play. The admin shows every match and both counts, so the owner sees what's still wanted.
   - Or: the apps show wanted films too, marked "Coming soon".
6. **TMDB keywords** ("heist", "christmas", "time travel"), which highsea doesn't fetch today.
   - **Recommended:** fetch them with each movie's details, through one more `append_to_response` entry, so keywords are a field. Collections like "Christmas films" depend on them. The next metadata refresh fills them.
   - Or: leave keywords out; genres and tags only.
7. **Who sees a collection.**
   - **Recommended:** the audience model of curation (everyone, roles, people, apps), Everyone by default.
   - Or: everyone always, so collections have no audience.
8. **Collections made by the people who use the apps** (personal smart collections).
   - **Recommended:** not now. The owner and admins make collections, as the request says. Personal collections can come with the apps in Phase 4, from the same rules.
   - Or: plan them now too.
9. **Where collections live in the admin.**
   - **Recommended:** a **Collections** page in the sidebar's library group, below Movies, because collections are part of browsing the library.
   - Or: a third tab in Curation, beside Announcements and Featured sections.
   - Or: a tab on Movies.
