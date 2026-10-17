// SPDX-License-Identifier: AGPL-3.0-only

/** Roles a theme sets directly. See docs/design-language/color.md#semantic-roles. */
export const BASE_ROLES = [
  'bg',
  's1',
  's2',
  's3',
  's4',
  'line',
  'line-strong',
  'text',
  'text-2',
  'text-3',
  'accent',
  'accent-2',
  'accent-text',
  'accent-fill',
  'on-accent',
  'focus',
  'success',
  'warning',
  'danger',
  'info',
  'danger-fill',
  'on-danger',
] as const
export type BaseRole = (typeof BASE_ROLES)[number]

export const STATUSES = ['success', 'warning', 'danger', 'info'] as const
export type Status = (typeof STATUSES)[number]

/** Roles computed from the base roles, so every platform gets identical values. */
export const DERIVED_ROLES = [
  'accent-soft',
  ...STATUSES.flatMap((s) => [`badge-${s}`, `badge-${s}-bg`] as const),
] as const
export type DerivedRole = (typeof DERIVED_ROLES)[number]

export type ColorRole = BaseRole | DerivedRole
export const COLOR_ROLES: readonly ColorRole[] = [...BASE_ROLES, ...DERIVED_ROLES]

/**
 * Status meanings must stay stable across servers, so these roles can't be themed
 * (docs/design-language/color.md#custom-themes-and-server-branding).
 */
export const LOCKED_ROLES = [...STATUSES, 'danger-fill', 'on-danger'] as const satisfies BaseRole[]
export type LockedRole = (typeof LOCKED_ROLES)[number]
export type ThemeableRole = Exclude<BaseRole, LockedRole>
export const THEMEABLE_ROLES = BASE_ROLES.filter(
  (r): r is ThemeableRole => !(LOCKED_ROLES as readonly string[]).includes(r),
)

/** The accent family regenerated when a theme sets only `accent`. */
export const ACCENT_ROLES = [
  'accent',
  'accent-2',
  'accent-text',
  'accent-fill',
  'on-accent',
  'focus',
] as const satisfies ThemeableRole[]
