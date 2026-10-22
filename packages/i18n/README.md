# @highsea-tv/i18n

Typed message catalogs ([ADR 0021](../../docs/adr/0021-i18n-message-catalogs.md)). Declare English source messages with `defineMessages` (ICU format), format them with `createT(messages, locale, translations)` or `useT(messages)` from `@highsea-tv/i18n/react`. An unknown id, or a message's missing value, doesn't compile.
