# fanart.tv answers, written by hand

These files are **not recordings**. highsea has no fanart.tv key yet (HT-74), so nothing here came
from fanart.tv. Each file is written in the shape fanart.tv's API v3.2 documents for
`GET /v3.2/movies/{tmdb id}` (https://api.fanart.tv, "Get movie images"): the title's `name`,
`tmdb_id` and `imdb_id`, then one array per image type, each image with `id`, `url`, `lang`,
`likes`, `width`, `height` and `added`, numbers as strings. The ids, names, likes and dates are made
up; the addresses follow the documented pattern
(`https://assets.fanart.tv/fanart/movies/{id}/{type}/{name}-{hash}.{ext}`) and point at nothing real.

The replaying `fetch` (src/replay.ts) serves `movies/{id}` from `movie_{id}.json`, answers 404 (as
v3.2 does when it has nothing) for any other id, 401 for a key starting `invalid`, and a placeholder
image for anything on `assets.fanart.tv`. When the owner has a key, these can be checked against a
real answer and replaced by recordings.
