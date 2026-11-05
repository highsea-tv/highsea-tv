// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./polyfills.ts: nothing to put back. Browsers implement Intl in full, Locale,
// PluralRules and NumberFormat's units among it
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl), which
// apps/web has relied on all along, so the web bundle carries none of FormatJS's polyfills.
export {}
