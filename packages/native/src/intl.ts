// SPDX-License-Identifier: AGPL-3.0-only
// Intl as the catalogs need it, imported first by each app's root layout. What that takes differs
// by platform, so it's a platform pair (apps/client/README.md › Platform files): FormatJS's
// polyfills under Hermes (./polyfills.ts) and nothing in a browser (./polyfills.web.ts). This file,
// the export's target, stays whole, since Metro takes a target exactly as written
// (https://metrobundler.dev/docs/package-exports/#replacing-platform-specific-extensions).
import './polyfills'
