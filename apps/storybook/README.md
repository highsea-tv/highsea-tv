# @highsea/storybook

highsea's living style guide: the design system's foundations, every [`@highsea/ui-web`](../../packages/ui-web/README.md) component, and the compositions they build. Everything here renders the real tokens and components; nothing is redrawn for the guide. The rules behind it are in [`docs/design-language/`](../../docs/design-language/README.md).

## Run it

```sh
bun run storybook                                  # from the repo root: http://localhost:6006
bun run --filter @highsea/storybook build          # a static build in apps/storybook/storybook-static
```

## Toolbar

| Control | What it does |
| --- | --- |
| Theme | Switches between the built-in themes (Abyss Neutral, OLED black, High contrast) by setting `data-theme` on the root |
| Platform | *Web and desktop* or *TV*: TV sets `data-platform="tv"`, so hover and focus use the TV scales and outline ring |
| Sound | Turns UI sound on for every story. Off by default, as in the admin app |

The Accessibility panel runs axe on each story; a violation fails the story's test (`a11y.test: 'error'`).

## What's inside

| Section | Pages |
| --- | --- |
| Foundations | Brand (mark, lockup, clear space), Color (every role, the contrast audit), Icons (the custom glyphs and the full set), Layout and elevation, Motion (spring curves and choreography), Sound (the sound board: every event, its waveform and its loudness check), Themes (a theme editor with contrast fixes and share codes), Typography |
| Components | Button, Forms, Overlays, Data display, Feedback |
| Media | Posters (art, wide tiles, ratings), Hero and rows (backdrop hero, rotation, carousel rows) |
| Shell | Admin: the sidebar (full and rail), command palette, widget dashboard and a full admin layout |
| TV | Home: a 1920×1080 TV home on screen units with D-pad focus. Click into it, then use the arrow keys, Enter and Escape |

The titles and their generated placeholder artwork come from [`@highsea/fixtures`](../../packages/fixtures/README.md), shared with the Phase 2 prototypes, so the guide ships no third-party images.

## Tests

`bun test` (from here or the root) runs:

- `test/stories.test.tsx`: every story, composed with the real preview, renders in happy-dom and passes axe (WCAG 2.2 AA tags). Contrast is checked per theme by the token tests and in the browser by the addon, since happy-dom has no layout.
- `test/theme.test.ts`: Storybook's own chrome is themed before any CSS loads, so `.storybook/theme.ts` and the head files hardcode the default theme's values. This checks them against `@highsea/tokens`.

## Adding a story

Put `*.stories.tsx` files under `src/`. Use token utilities and roles only (`bg-s1`, `text-text-2`), never raw values, and name things the way the docs do. Pages for the foundations use `Page` and `Section` from `src/foundations/page.tsx`.
