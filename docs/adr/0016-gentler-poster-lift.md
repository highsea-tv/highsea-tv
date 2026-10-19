# 0016. A gentler poster lift

- **Status:** Accepted (amends TV focus in [0013](0013-brand-direction-abyss-neutral.md))
- **Date:** 2026-10-19

## Context
Posters lift on hover and keyboard focus: to 1.04 on web and 1.09 on TV ([direction.md](../brand/direction.md#focus)). Once the client prototypes put each title and its details under the art, the owner found the lifted card butted right up against that text, at the checkpoint 3 review.

## Decision
- Posters, stills and portraits lift to **1.02 on web** and **1.05 on TV**, with `spring.base` as before.
- Buttons keep their scale (1.07 on TV), and the focus ring and shadow are unchanged.

## Consequences
- The `tv-scale-poster` token and the web `--scale-poster` default change; every screen that uses `Poster` follows.
- `direction.md`, `tv.md`, `motion.md` and `desktop-web.md` are updated to match.
