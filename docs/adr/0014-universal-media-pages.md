# 0014. One media page per title, whatever its library state

- **Status:** Accepted; amended 2026-10-20 (addresses use the provider's id)
- **Date:** 2026-10-19

## Context

Checkpoint 2 had two ways to look at a movie: a details dialog in Discover for titles not yet added, and the movie page (A6) for the library. They showed different things in different places, and neither had room for cast, crew, trailers, collections or recommendations. Later media types need more again: seasons and episodes for shows, a discography for an artist, a tracklist for an album.

## Decision

- **One page per title.** Clicking a movie in Discover, the library, the dashboard, a person's filmography, a collection or ⌘K opens the same page. Its library state (not added, wanted, downloading, available) changes what the page offers, not which page it is.
- **One address per title, by media id.** The page lives at `/{type}/{id}`, where `{id}` is the title's database id (`/movies/107`). The server gives a title its media row, and so its id, the first time it sees it: in search results, trending, a filmography, a collection or a recommendation. Adding the title to the library marks that row as wanted; it never changes the id. So the address resolves before, during and after adding, every way to a title links to the same address, and two titles with the same name never compete for a slug.
- **Metadata and library are separate layers.** The metadata layer (cast, crew, trailers, collection, recommendations, facts) is there in every state. The library layer (files, history, interactive search, subtitles, monitoring) appears once the title is added.
- **One anatomy, sections per type.** Every media page has the same header, summary card and tabs. Each type adds its own sections: seasons and episodes for shows, albums and tracks for music, editions for books. The shared pieces live in `design/prototypes/src/admin/media/` now and in `ui-web` once a second type uses them.
- **People get pages too.** A cast or crew member opens `/people/{id}`, with their filmography marked by library state, so the graph can be walked without leaving highsea.

## Consequences

- Discover's details dialog goes away; Discover becomes a way into the pages.
- `media_items` (ADR 0012) holds titles that aren't in the library, as metadata-cache rows with a library state, so a media id exists before adding. The API serves a title's metadata by media id whatever its state (`GET /api/v1/movies/{id}/metadata`), with whether it's in the library; `/people/{id}` and `/collections/{id}` work the same way.
- Slugs never appear in addresses. A human-readable slug can be added later as decoration (`/movies/28-metropolis`), resolved by the id alone.
- New media types add their own sections to the shared page instead of a new page design.
- Trailers play from `youtube-nocookie.com`, and only after a click, so opening a page sends nothing to Google.

## Amendment (2026-10-20): addresses use the provider's id

The owner decided this while scoping Phase 3 checkpoint 4. It replaces the "one address per title, by media id" bullet above and the consequence about media rows. Everything else stands.

- **A title's id is its id at the metadata provider,** within its type, as [Seerr](https://github.com/seerr-team/seerr) does. TMDB's *Spider-Man: Brand New Day* is `themoviedb.org/movie/969681`, so its page is `/movies/969681` in the admin, the clients and the API, before and after it's added.
- **Why:** Discover and search show titles the server has never stored, and each must open its page with the right information straight away. With the provider's id, any title the provider knows has an address with nothing created first. The id is also the one people and other tools already use.
- **The type is part of the id.** Providers number types separately (TMDB movie 1399 isn't TMDB show 1399), so addresses are `/{type}/{providerId}` and every key includes the type.
- **Each type uses its provider's id:** TMDB for movies, shows, collections and people now. Music and books take their providers' ids (for example MusicBrainz ids) when those types are planned, under the same rule.
- **The library is a layer keyed by that id.** The metadata cache holds whatever the server has fetched; adding a title creates its library rows. Internal row ids (versions, files, history) never appear in an address or as a title's id.
- **If the provider removes or merges an id,** a title in the library keeps its rows and address and offers a way to pick its new match.

Consequences that change:
- `media_items` no longer holds titles outside the library. Those live only in the metadata cache.
- The API serves metadata by provider id for any title the provider knows (`GET /api/v1/movies/{tmdbId}/metadata`), and `/people/{id}` and `/collections/{id}` use TMDB ids.
- Slugs still never appear in addresses. A readable slug can still be added later as decoration (`/movies/969681-spider-man-brand-new-day`, as TMDB does), resolved by the id alone.
