// SPDX-License-Identifier: AGPL-3.0-only
// Shared surface recipes for floating layers: docs/design-language/elevation.md

/** Level 4 (menus, popovers, selects): `s3`, a `line-strong` edge, the level-4 shadow. */
export const floatingSurface =
  'z-50 rounded-md border border-line-strong bg-s3 text-text shadow-4 outline-none data-[state=open]:animate-pop-in data-[state=closed]:animate-fade-out'

/** A row in a menu-like list. Secondary text stays on `s3`; the highlight is `s4` with `text`. */
export const menuItem =
  'relative flex min-h-8 cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13.5px] text-text-2 outline-none transition-tint data-[disabled]:pointer-events-none data-[highlighted]:bg-s4 data-[highlighted]:text-text data-[disabled]:opacity-45 [&_svg]:shrink-0'
