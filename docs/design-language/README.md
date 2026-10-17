# highsea.tv Design Language

- **Status:** v1.0, signed off 2026-10-16 ([roadmap](../roadmap.md)).
- **Builds on:** the locked brand direction, [Abyss Neutral (Bone)](../brand/direction.md) ([ADR 0013](../adr/0013-brand-direction-abyss-neutral.md)).

These documents turn the brand direction into rules that designers and engineers can apply on every surface. `@highsea/tokens`, `@highsea/ui-web`, `@highsea/ui-native` and every app implement what is written here. If code and docs disagree, one of them is a bug.

## How to read these docs

- Every rule here is settled. Most come from the locked direction or the signed-off reference board (`design/explorations/a2-abyss-neutral.html`). The rest fill gaps the board didn't cover, and were signed off with these docs.
- Rules marked "designed in Phase 2" are settled as constraints. Their detailed layout and interaction come from the Phase 2 prototypes.
- Values live in one place. Color, type, motion and sound values are listed in [direction.md](../brand/direction.md) and implemented in [`@highsea/tokens`](../../packages/tokens/README.md). These docs explain how to *use* them and only repeat a value when the rule needs it.

## Contents

| Document | Covers |
| --- | --- |
| [Principles](principles.md) | The ideas every decision is checked against |
| [Color](color.md) | Semantic roles, status meanings, contrast policy, data viz, theming |
| [Typography](typography.md) | Families, weights, scales per platform, figures, truncation |
| [Spacing and layout](spacing-layout.md) | Spacing scale, radii, breakpoints, grids per platform |
| [Elevation and blur](elevation.md) | Surface ladder, shadows, blur, scrims over artwork |
| [Iconography](iconography.md) | Lucide base set, sizes, custom glyphs |
| [Motion](motion.md) | Springs, durations, choreography, reduced motion |
| [Sound](sound.md) | Event taxonomy, recipe format, loudness, defaults |
| [Accessibility](accessibility.md) | The standard every surface meets |
| **Platform guides** | |
| [TV (10-foot)](platforms/tv.md) | Safe area, type in screen units, the spatial focus model, remote keys |
| [Mobile](platforms/mobile.md) | Tabs + carousel home, touch targets, safe areas |
| [Desktop and web clients](platforms/desktop-web.md) | Pointer and keyboard adaptation (designed in Phase 2) |
| [Admin](platforms/admin.md) | Sidebar + widgets, density, tables, status |

## Changing these docs

- **Locked items** (anything in `direction.md`) change only through owner sign-off and a superseding ADR.
- **Everything else** changes by editing these docs, as long as the change doesn't contradict a locked item.
- New rules may be added tagged *(proposed)* while they await owner sign-off. Accepting one removes the tag; rejecting it deletes or rewrites the rule.
