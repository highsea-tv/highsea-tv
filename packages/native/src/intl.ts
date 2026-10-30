// SPDX-License-Identifier: AGPL-3.0-only
// What Hermes leaves out of Intl, put back before anything formats a message. Hermes implements
// Collator, NumberFormat, DateTimeFormat and getCanonicalLocales, not PluralRules or Locale
// (https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md), and every `{count, plural, …}`
// in the catalogs needs PluralRules, so without it the first plural throws and the app closes.
// Its NumberFormat is replaced too: on iOS it formats `style: 'unit'` with NSMeasurementFormatter
// and no unitOptions (lib/Platform/Intl/PlatformIntlApple.mm), and Foundation's default converts
// to the locale's preferred unit, so @highsea-tv/core/format's "20m ago" read "1,200 sec ago".
// FormatJS's polyfills, forced as its docs say for Hermes, Locale first since PluralRules needs it
// and NumberFormat needs both (https://formatjs.github.io/docs/polyfills/intl-pluralrules,
// https://formatjs.github.io/docs/polyfills/intl-numberformat). English only, as the catalogs are.
import '@formatjs/intl-locale/polyfill-force.js'
import '@formatjs/intl-pluralrules/polyfill-force.js'
import '@formatjs/intl-pluralrules/locale-data/en.js'
import '@formatjs/intl-numberformat/polyfill-force.js'
import '@formatjs/intl-numberformat/locale-data/en.js'
