# 0013. Brand direction: Abyss Neutral (Bone)

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
Phase 1 step 2 ([ADR 0001](0001-design-first-sequencing.md)) explored brand directions as static boards in `design/explorations/`:
- A · Abyss
- B · Signal
- C · Nocturne
- D · Jolly Roger, a piracy-themed direction requested to test the "high seas" pun

Each board covered identity, color, type, TV, phone and admin layouts, motion and sound.

The owner favored A's structure but found its blue-tinted surfaces, glows and sonar sounds too "neon" and "sci-fi". A refinement was made: neutral graphite, no glows, and three desaturated accent candidates (Sea glass, Slate, Bone). Its sounds were rebuilt as dry felt-and-wood taps.

## Decision
The official brand and design direction is **Abyss Neutral with the Bone accent**. Its specification is in [`docs/brand/direction.md`](../brand/direction.md), and the reference board is `design/explorations/a2-abyss-neutral.html`.

- Theme: nautical, not piratical.
- Layouts:
  - TV home: Hero + rows.
  - Phone home: Tabs + carousel.
  - Admin dashboard: Sidebar + widgets.
- Sound: the felt-and-wood family. It is on by default in TV clients and off in admin.

## Consequences
- Phase 1 continues with the design-language docs, `@highsea/tokens`, `@highsea/brand`, `@highsea/ui-web` and Storybook. All of them derive from `docs/brand/direction.md`.
- Changing anything in the direction spec (palette, type, mark, layouts, motion or sound character) requires owner sign-off and a superseding ADR.
- Because the chrome is neutral and identity rests on the mark, motion and sound, those three need extra care in the design-language docs.
- The other explorations are kept as an unmaintained historical record.
