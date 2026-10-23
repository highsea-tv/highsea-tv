# 0017. The web home uses a full-bleed hero

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
The web and desktop home was new design work in Phase 2. [desktop-web.md](../design-language/platforms/desktop-web.md) sets its structure, Hero + rows like the TV, but the plan asked for two options to be built and compared before one was chosen ([phase-2-prototypes.md](../plans/phase-2-prototypes.md), checkpoint 3):

- **A · Full-bleed hero:** the TV's hero carried to the desktop. It spans the window, about 58% of the viewport tall, under the translucent top bar, with a pager for the featured titles; the owner's banners and the rows follow.
- **B · Contained hero:** a solid top bar, a framed 21:9 card with **Also featured** beside it, and the rows.

## Decision
The owner chose **A, the full-bleed hero**, when signing off Phase 2.

## Consequences
- The web home has the same shape as the TV home, as the platform doc says, and the owner's featured section is the first thing on every client.
- Option B, its switch and its routes (`#/web/home/a`, `#/web/home/b`) are gone from the prototype; `#/web` is the home. [client-home.md](../product/client-home.md) describes only A.
- Announcement banners on the web sit under the hero.
- Still open, as before: whether the web hero ever rotates on its own while the window is idle (it doesn't now).
