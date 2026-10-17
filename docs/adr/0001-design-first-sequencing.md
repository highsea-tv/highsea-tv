# 0001. Design-first sequencing

- **Status:** Accepted
- **Date:** 2026-10-16

## Context
highsea.tv spans a server admin app and several clients (web, desktop, mobile, TV). A unified, polished design language is a core differentiator. Designing it after product UI is built leads to inconsistency and expensive retrofits.

## Decision
Work proceeds in gated phases:
1. Brand and design system/language, finalized with explicit sign-off (design system v1.0).
2. Clickable design prototypes for the server app and all clients, also signed off.
3. Server implementation.
4. Client apps.

All documentation, explorations and prototypes live in this repository (`docs/`, `design/`).

## Consequences
- The first deliverables are design assets and tokens, not features.
- Prototypes are built on the real tokens and `ui-web` components, so the design system is exercised before product work starts.
