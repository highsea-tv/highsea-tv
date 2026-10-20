// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/quality: the quality vocabulary, profiles, custom formats, sizes and the decision engine
// (ADR 0031). Pure: no database, no clock, no I/O. Browser-safe, so the prototype imports it too;
// a page that doesn't need the TRaSH presets imports `@highsea/quality/browser`, which leaves them out.
export * from './browser.ts'
export * from './presets.ts'
