// SPDX-License-Identifier: AGPL-3.0-only
// @highsea/personalization: how highsea looks, sounds and arranges itself for each person (ADR 0027,
// 0028). Preferences in layers, dashboard layouts with role defaults, the home screen's rows, and
// the owner's appearance: themes, sound packs and the server's mark. The widget registry and the
// preference keys are browser-safe and have their own entry points (`/widgets`, `/keys`).
import { createAppearance } from './appearance.ts'
import type { PersonalizationDeps } from './context.ts'
import { createHome, type HomeRow } from './home.ts'
import { createLayouts } from './layouts.ts'
import { createPreferences } from './preferences.ts'

export function createPersonalization(
  deps: PersonalizationDeps,
  opts: { homeRows?: (userId: string) => HomeRow[] } = {},
) {
  const appearance = createAppearance(deps)
  return {
    appearance,
    dashboard: createLayouts(deps),
    preferences: createPreferences(deps, appearance),
    home: createHome(deps, opts.homeRows),
  }
}

export type Personalization = ReturnType<typeof createPersonalization>

export * from './appearance.ts'
export type { PersonalizationDeps } from './context.ts'
export * from './home.ts'
export * from './keys.ts'
export * from './layouts.ts'
export * from './marks.ts'
export * from './preferences.ts'
export * from './widgets.ts'
