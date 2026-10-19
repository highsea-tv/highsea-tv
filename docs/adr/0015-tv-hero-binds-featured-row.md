# 0015. The TV hero binds only the featured row

- **Status:** Accepted (amends the TV home layout in [0013](0013-brand-direction-abyss-neutral.md))
- **Date:** 2026-10-19

## Context
The locked TV home layout, **Hero + rows** ([direction.md](../brand/direction.md#layouts)), has "a full-bleed hero for the focused title that crossfades as focus moves". The checkpoint 3 prototype took that literally: every row bound the hero, and the rows were confined to the bottom 47% of the screen under it.

At the checkpoint 3 review the owner found that this doesn't hold up past the first row:
- Titles in the owner's rows repainted a hero that is about featured titles, and posters had no names, so the hero was the only place a title showed.
- The row area was too short to scroll through comfortably, and focused posters were clipped at its edges.
- The server identity stayed pinned and covered posters as the page scrolled.

## Decision
- **The hero belongs to the featured row.** Only the hero's own titles, shown as the first row, bind it (with the 220 ms dwell and the cross-fade as before).
- **The page lifts past the hero.** On any row below the featured one, the whole page moves up so that row sits at the top of the safe area. The hero, the server identity and the announcement pill scroll away with it. Up to the featured row brings the hero back.
- **Every TV poster shows its title and year** under the art (wide tiles: the time left).
- **Nothing is pinned over content on TV,** apart from navigation that lives in a margin (the library's alphabet rail) and overlays that hold focus (the global navigation, panels).

## Consequences
- `direction.md` (Layouts › TV home) and `platforms/tv.md` (Layout, Scrolling, Hero behavior) are updated to match.
- The rest of the layout stays locked: the hero's size and copy, the poster size and gap, the 30% horizontal keep, focus appearance, and the motion.
