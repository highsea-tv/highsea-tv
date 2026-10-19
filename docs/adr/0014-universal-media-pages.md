# 0014. One media page per title, whatever its library state

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

Checkpoint 2 had two ways to look at a movie: a details dialog in Discover for titles not yet added, and the movie page (A6) for the library. They showed different things in different places, and neither had room for cast, crew, trailers, collections or recommendations. Later media types need more again: seasons and episodes for shows, a discography for an artist, a tracklist for an album.

## Decision

- **One page per title.** Clicking a movie in Discover, the library, the dashboard, a person's filmography, a collection or ⌘K opens the same page. Its library state (not added, wanted, downloading, available) changes what the page offers, not which page it is.
- **One address per title.** The page lives at `/{type}/{id}`. A title not in the library is addressed by its metadata id (`/movies/tmdb-1003000`); once added, that address redirects to the library id (`/movies/nanook-of-the-north`), so links taken before adding keep working.
- **Metadata and library are separate layers.** The metadata layer (cast, crew, trailers, collection, recommendations, facts) is there in every state. The library layer (files, history, interactive search, subtitles, monitoring) appears once the title is added.
- **One anatomy, sections per type.** Every media page has the same header, summary card and tabs. Each type adds its own sections: seasons and episodes for shows, albums and tracks for music, editions for books. The shared pieces live in `design/prototypes/src/admin/media/` now and in `ui-web` once a second type uses them.
- **People get pages too.** A cast or crew member opens `/people/{id}`, with their filmography marked by library state, so the graph can be walked without leaving highsea.

## Consequences

- Discover's details dialog goes away; Discover becomes a way into the pages.
- The API needs metadata routes that work without a library item (`GET /api/v1/metadata/movies/{tmdbId}`, `/people/{id}`, `/collections/{id}`), each saying whether the title is in the library.
- New media types add their own sections to the shared page instead of a new page design.
- Trailers play from `youtube-nocookie.com`, and only after a click, so opening a page sends nothing to Google.
