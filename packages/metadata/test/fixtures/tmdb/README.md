# TMDB recordings

One JSON file per request to TMDB, in the format `bun run record:tmdb` writes ([ADR 0029](../../../../../docs/adr/0029-external-services.md)):

- `request`: the method, the URL with its query sorted and the credential stripped, and whether the credential was one TMDB accepts (`valid`) or refuses (`invalid`);
- `response`: the status, the content type and the body.

The replaying `fetch` (`@highsea/metadata/replay`) serves them, answers image requests with a tiny placeholder, and fails on any request it has no recording for.

## These are hand-built

**These files weren't recorded from TMDB's API.** There was no TMDB key on the machine that built checkpoint 4, so they were written by hand in exactly the recorded format, following TMDB's documented response schemas ([API reference](https://developer.themoviedb.org/reference)). They stay hand-built until the owner runs, in `packages/metadata`:

```sh
TMDB_READ_TOKEN=… bun run record:tmdb    # or TMDB_API_KEY=…
```

That asks TMDB again for every request here and rewrites each file with TMDB's real answer.

What they hold is real, read from TMDB's public web pages (no key needed) on 2026-10-20: ids, titles, dates, overviews, taglines, runtimes, genres, ratings and vote counts, budgets and revenue, poster and backdrop file names, cast (with TMDB's credit ids) and crew, release dates and certifications by country, videos (with TMDB's video ids and YouTube keys), recommendations, collections, people with their filmographies, search results and Discover's four lists. IMDb and Wikidata ids are Wikidata's, matched by its TMDB id properties (P4947, P4985). Where the web pages don't show what the API returns, the files say less or approximate:

- **Crew credit ids** are made up (24 hex characters, like TMDB's); cast and filmography credit ids are TMDB's own.
- **`popularity`** is a stable stand-in; **`gender`** of cast and crew is 0 (not set).
- **Production companies** are Wikidata's, matched to TMDB company ids by TMDB's company search.
- **Long lists are cut short:** *Spider-Man: Brand New Day* keeps 60 cast, 40 crew and 12 videos; *The Cat in the Hat* 12 videos; recommendations keep 8; search results and Discover's lists keep the first page as the web shows it (20 or fewer).
- ***Caminandes: Llamigos*** (406956) has its recommendations emptied, so the "similar" fallback (owner's decision 6) has a case; its `similar` list is chosen by hand from the Blender films here.
- **The change lists** (`/3/movie/changes`, `/3/person/changes`) for 2026-10-16 to 2026-10-17 are made up for the changes job's test.
- **Import lists' recordings (checkpoint 8a)** are put together from the movies above: *Top rated* holds the silent films here, ranked by their recorded ratings; the public list **8512345** (*Blender open films*) is made up, with the Blender films and one TV show, so the TV-skipping has a case; and the two IMDb lookups (`/3/find/tt1727587`, Sintel, and `tt0000000`, nothing) follow TMDB's documented [Find by ID](https://developer.themoviedb.org/reference/find-by-id) answer.
- **Keywords and production countries (checkpoint 8d):** the movie requests gained `keywords` in `append_to_response` for smart collections' keyword rules, so the movie files were renamed for their new URL and given the two fields by hand. `keywords` is empty everywhere, since TMDB's keyword ids aren't shown on its web pages; `production_countries` follows the production companies above (Germany for the silent German films, France for *A Trip to the Moon*, the United States for *Nanook of the North* and the two Sony titles, the Netherlands for the Blender Institute's films) and is empty for the three *Caminandes* shorts. `bun run record:tmdb` replaces both with TMDB's answer.
- **Certifications (checkpoint 8d):** `/3/certification/movie/list` keeps three countries, the United States, the United Kingdom and Germany, in TMDB's documented shape ([Movie certifications](https://developer.themoviedb.org/reference/certification-movie-list)). The ratings and their order are each board's published scale (MPA, BBFC, FSK); the `meaning` texts are short paraphrases. `bun run record:tmdb` replaces them with TMDB's full list.
- **The 404** (`/3/movie/999999999`) and the bad-key **401** use TMDB's documented error bodies ([Errors](https://developer.themoviedb.org/docs/errors)).

## The catalogue

| Kind | What |
| --- | --- |
| Movies, in full | Sintel (45745), Big Buck Bunny (10378), Tears of Steel (133701), Elephants Dream (9761), Cosmos Laundromat (358332), the three Caminandes shorts (253777, 253774, 406956), Metropolis (19), Nosferatu (653), The Cabinet of Dr. Caligari (234), M (832), Nanook of the North (669), Dr. Mabuse, the Gambler (5998), A Trip to the Moon (775), Spider-Man: Brand New Day (969681), The Cat in the Hat (1117898, not released yet) |
| Collections | Caminandes Collection (339473), Dr. Mabuse Collection (11140), Spider-Man (MCU) Collection (531241) |
| People | Fritz Lang (68), Max Schreck (9839), Robert Flaherty (10092), Colin Levy (133631) |
| Search | `sintel`, `metropolis`, `nanook`, `caminandes`, `nosferatu` |
| Lists | Trending (week), Popular, Now playing, Upcoming and Top rated, page 1, region US; the public list 8512345 |
| Find | `tt1727587` (Sintel), `tt0000000` (no match) |
| Certifications | Movies, for US, GB and DE |

A test fails if any file here holds something shaped like a key or a token, or isn't named for its request.
