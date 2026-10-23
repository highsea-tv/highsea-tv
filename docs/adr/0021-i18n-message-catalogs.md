# 0021. Strings live in typed message catalogs

- **Status:** Accepted
- **Date:** 2026-10-19

## Context
The gap analysis asks for localizable UI strings from day one. The strings have to work in the Next admin, in the server (notifications, emails, errors shown to people) and later in React Native. Libraries that need a compiler plugin (Lingui's macros) or that are tied to Next (next-intl) don't fit all three.

## Decision
- `@highsea/i18n` holds messages as TypeScript objects, one module per area (`defineMessages({ id: 'English source' })`), written in ICU message format and formatted with `intl-messageformat`.
- English is the source and the fallback. Other locales are JSON files keyed by the same ids, added later; a test fails when a locale has an id the source doesn't.
- `t(id, values)` is typed: an unknown id or a missing value doesn't compile.
- React gets `I18nProvider` and `useT()`; the server uses `createT(locale)`.
- Dates, numbers and sizes go through `Intl`, with the viewer's locale and time zone.

## Consequences
- Screens ported from the prototype move their copy into catalogs as they're ported. The prototype's copy is the English source.
- No extraction step: the catalogs are the source of truth.
