# @highsea-tv/fixtures

Sample titles and generated placeholder art, shared by [Storybook](../../apps/storybook/README.md) and the [Phase 2 prototypes](../../design/prototypes/README.md). Nothing here loads from the network, and the repo carries no third-party images.

| Export | Contents |
| --- | --- |
| `titles` | Blender Studio's ten best-known open movies (CC BY): the set Storybook and the e2e tests use |
| `library` | All forty titles: `titles`, then more open films and US public-domain features, for screens that need density |
| `byId(id)` | One title from `library` |
| `art(title)` | Its poster (2:3), still (16:9) and backdrop (16:9) as SVG data URIs |
| `posterArt`, `stillArt`, `backdropArt` | The art for any string, for things that aren't titles |
| `portraitArt(name)` | A person's photo (2:3): a head-and-shoulders silhouette on the name's palette |

Each title gets a stable, muted scene (a sky gradient, a low sun and layered hills) from a hash of its name, so placeholders never out-shout real posters ([principles › artwork is the color](../../docs/design-language/principles.md#1-artwork-is-the-color)).

Synopses are written for highsea, in the [brand voice](../../docs/brand/brief.md#6-voice-and-tone).
