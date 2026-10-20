# 0036. Domain packages with a subpath export per kind

- **Status:** Accepted
- **Date:** 2026-10-20

## Context
Checkpoints 4 and 5 added `@highsea/media-movies` and `@highsea/indexer-schema`. Movies are the first of several media types: shows and music follow, and perhaps books and games after them. The roadmap also reserves video (yt-dlp channels), and more shared formats will follow (catalog presets, sound packs, device profiles). One package per kind would multiply manifests, tsconfigs and dependency lists that are nearly identical. The owner asked at checkpoint 5's review for one package per domain, with an export per kind.

## Decision
- **`@highsea/schemas`** holds shared, pure data formats. Each format is a subpath export with its own folder: `@highsea/schemas/indexers` is `src/indexers/` (was `@highsea/indexer-schema`).
- **`@highsea/media`** holds the media libraries. Each media type is a subpath export with its own folder: `@highsea/media/movies` is `src/movies/` (was `@highsea/media-movies`). Shows, music and later types arrive as `@highsea/media/shows`, `@highsea/media/music` and so on.
- **No root export** in either package. Node refuses a specifier its package's `exports` doesn't list ([Node.js › Packages › Subpath exports](https://nodejs.org/api/packages.html#subpath-exports)), so `import '@highsea/schemas'` fails and nothing loads a kind it didn't ask for. TypeScript follows the same `exports` map under `moduleResolution: "Bundler"` ([TypeScript › Modules reference › package.json "exports"](https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-exports)).
- **Tests mirror the source:** `test/indexers/`, `test/movies/`, `test/shared/`.
- **What every media type shares is `@highsea/media/shared`** (`src/shared/`), and a type's folder holds only what that type alone needs. The owner asked for this split at checkpoint 5's review, before a second type exists, so shows and music start from the shared layer instead of copying the movies'. Shared today:
  - the services, created once by the runtime with `createMedia({ db, clock, logger })` and handed to each type's factory (`createMovies(deps, media)`): the seeded quality profiles, custom formats, quality sizes and language profiles, and root folders, which count the titles filed under them by type;
  - the pure pieces each type builds on: names (folding, sort titles, safe folder names), keyset paging over `media_items`, the API's common shapes (ratings, ISO times, credits, videos, watch progress), search ranking, each person's watch positions, and chunked SQL helpers.
- **Movies keep** TMDB's movie facts, availability, the movie library and its jobs, the parser's page and the client API's movie reads. A piece moves to `shared` when a second type would use it unchanged; anything that reads a type's own tables (`movie_metadata`) stays in that type's folder.
- A package's dependencies are the union of its kinds'. A kind with heavy or unusual dependencies (native, network) stays in its own package, as `@highsea/indexers` and `@highsea/catalog` do.

## Consequences
- Adding a media type or a format is a folder and a line in `exports`, not a new package. A new media type takes `media` like the movies do, so profiles, formats and root folders stay one set across types.
- Root folders answer `in-use` with `details.counts` by type (`{ movie: 2 }`), not a movie count.
- Imports name the kind (`@highsea/media/movies`), so the layout reads the same in code and in docs.
- The earlier names stay in the history of ADR 0033 and the checkpoint 4 and 5 plans, each marked with the new name.
