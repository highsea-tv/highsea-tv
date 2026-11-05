// SPDX-License-Identifier: AGPL-3.0-only
// What the root layout hands ThemeProvider for a frame's `?ff=` (./form-factor.web.ts).
import { type FormFactorSetting, formFactorSettingNamed } from '@highsea-tv/tokens'

/**
 * The form factor a frame asks for (`?ff=touch`, `pointer` or `tv`, or a whole one such as
 * `compact-touch`; controls.md › The form factor). Without one, or with a name that isn't one,
 * nothing, so ThemeProvider decides by the device (the TV's remote, touch, or a browser's pointer)
 * and a desktop browser isn't forced onto touch.
 */
export const settingOf = (frame: string | undefined): FormFactorSetting | undefined =>
  frame === undefined ? undefined : formFactorSettingNamed(frame)
