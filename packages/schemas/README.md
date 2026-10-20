# @highsea/schemas

Shared, pure data formats, one subpath export each ([ADR 0036](../../docs/adr/0036-domain-packages-with-subpath-exports.md)). There's no root export: import the format you need, and nothing else comes with it.

| Export | Source | What |
| --- | --- | --- |
| `@highsea/schemas/indexers` | `src/indexers/` | The indexer definition format ([ADR 0033](../../docs/adr/0033-indexer-definitions.md)) |

A new format gets its own folder under `src/` and `test/`, and its own line in `exports`.

## `@highsea/schemas/indexers`

The indexer definition format, as data the engine interprets. Pure: the catalog pipeline, the server and the prototype share it.

- `definitionSchema` (zod) and `definitionJsonSchema()`: the shape of one definition, in five kinds: `torznab`, `newznab`, `json`, `html` and `rss`.
- `validateDefinition(data)`: the shape plus the checks a shape can't express. Every template parses and names only inputs it may read, every pattern compiles, and fields fit their kind. It returns every problem, not just the first.
- `parseTemplate` and `renderTemplate`: the closed template language. It reads `.Config`, `.Query` and `.Result`, supports `if`/`else`/`end` and a fixed list of filters, and has no loops or calls.
- `ENGINE_VERSION` and `engineSupports(required)`: a definition runs on an engine with the same major version that's at least as new.
- `STANDARD_CATEGORIES`: the Newznab categories definitions map their own onto.

Definitions live in [`catalog/indexers`](../../catalog/indexers). highsea writes them from each site's own documentation; none are copied from Prowlarr or Jackett.
