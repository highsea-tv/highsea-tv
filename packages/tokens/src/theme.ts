// SPDX-License-Identifier: AGPL-3.0-only
import { z } from 'zod'
import {
  composite,
  formatCss,
  formatHex,
  lightness,
  mix,
  parseColor,
  type Rgba,
  withAlpha,
  withLightness,
} from './color.ts'
import { apcaLc, wcagRatio } from './contrast.ts'
import {
  type ACCENT_ROLES,
  type BaseRole,
  type ColorRole,
  LOCKED_ROLES,
  STATUSES,
  THEMEABLE_ROLES,
  type ThemeableRole,
} from './roles.ts'
import {
  type BuiltInThemeId,
  builtInThemes,
  type ContrastCheckId,
  type ThemeSpec,
} from './themes.ts'

/** A theme with its derived roles filled in. This is what every output is generated from. */
export type ResolvedTheme = Omit<ThemeSpec, 'colors'> & { colors: Record<ColorRole, string> }

export function resolveTheme(spec: ThemeSpec): ResolvedTheme {
  const c = (r: BaseRole) => parseColor(spec.colors[r])
  const colors = { ...spec.colors } as Record<ColorRole, string>
  colors['accent-soft'] = formatCss(withAlpha(c('accent'), 0.13))
  for (const s of STATUSES) {
    const share = s === 'danger' ? spec.badgeMix.danger : spec.badgeMix.status
    colors[`badge-${s}`] = formatHex(mix(c(s), c('text'), share))
    colors[`badge-${s}-bg`] = formatCss(withAlpha(c(s), 0.14))
  }
  return { ...spec, colors }
}

// ---- contrast audit: docs/design-language/color.md#contrast-policy

type Check = {
  id: ContrastCheckId
  label: string
  fg: ColorRole
  /** Surfaces the pairing is measured on; the weakest decides. */
  on: BaseRole[]
  /** A fill painted over the surface first (buttons, badge tints). */
  fill?: ColorRole
  min: number
  minRatio?: number
}

const TEXT_SURFACES: BaseRole[] = ['bg', 's1', 's2', 's3']

export const CONTRAST_POLICY: readonly Check[] = [
  { id: 'text', label: 'Primary text', fg: 'text', on: TEXT_SURFACES, min: 75, minRatio: 4.5 },
  { id: 'text-2', label: 'Secondary text', fg: 'text-2', on: TEXT_SURFACES, min: 70 },
  { id: 'text-3', label: 'Tertiary text', fg: 'text-3', on: TEXT_SURFACES, min: 50 },
  { id: 'accent-text', label: 'Accent text', fg: 'accent-text', on: ['bg', 's1'], min: 60 },
  {
    id: 'button-primary',
    label: 'Primary button',
    fg: 'on-accent',
    fill: 'accent-fill',
    on: ['s1'],
    min: 75,
  },
  {
    id: 'button-danger',
    label: 'Destructive button',
    fg: 'on-danger',
    fill: 'danger-fill',
    on: ['s1'],
    min: 75,
  },
  ...STATUSES.map(
    (s): Check => ({
      id: 'badge',
      label: `${s[0]?.toUpperCase()}${s.slice(1)} badge`,
      fg: `badge-${s}`,
      fill: `badge-${s}-bg`,
      on: ['s1'],
      min: 60,
    }),
  ),
]

export type ContrastResult = {
  id: ContrastCheckId
  label: string
  fg: ColorRole
  /** The surface where the pairing measured weakest. */
  on: BaseRole
  /** The fill painted over that surface, when the check has one. */
  fill?: ColorRole
  lc: number
  ratio: number
  min: number
  minRatio?: number
  pass: boolean
}

export type ThemeAudit = { pass: boolean; results: ContrastResult[] }

export function auditTheme(theme: ResolvedTheme): ThemeAudit {
  const col = (r: ColorRole) => parseColor(theme.colors[r])
  const bg = col('bg')
  const surface = (r: BaseRole): Rgba => (r === 'bg' ? bg : composite(bg, col(r)))
  const results = CONTRAST_POLICY.map((check): ContrastResult => {
    let worst: Omit<ContrastResult, 'pass'> | undefined
    for (const on of check.on) {
      const backdrop = check.fill ? composite(surface(on), col(check.fill)) : surface(on)
      const fg = composite(backdrop, col(check.fg))
      const lc = apcaLc(fg, backdrop)
      if (!worst || lc < worst.lc) {
        worst = {
          id: check.id,
          label: check.label,
          fg: check.fg,
          on,
          ...(check.fill ? { fill: check.fill } : {}),
          lc,
          ratio: wcagRatio(fg, backdrop),
          min: Math.max(check.min, theme.minimums?.[check.id] ?? 0),
          ...(check.minRatio ? { minRatio: check.minRatio } : {}),
        }
      }
    }
    const w = worst as Omit<ContrastResult, 'pass'>
    // Lc is reported as a whole number, so a pairing passes when it rounds to the minimum.
    const pass = w.lc >= w.min - 0.5 && (!w.minRatio || w.ratio >= w.minRatio)
    return { ...w, pass }
  })
  return { pass: results.every((r) => r.pass), results }
}

// ---- custom themes

const colorString = z
  .string()
  .trim()
  .max(64)
  .refine(
    (s) => {
      try {
        parseColor(s)
        return true
      } catch {
        return false
      }
    },
    { message: 'Use #rrggbb, #rrggbbaa or rgb(r g b / a)' },
  )

const roleColors = z.record(z.string(), colorString).superRefine((rec, ctx) => {
  for (const key of Object.keys(rec)) {
    if ((LOCKED_ROLES as readonly string[]).includes(key))
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is a status color and can't be themed`,
      })
    else if (!(THEMEABLE_ROLES as readonly string[]).includes(key))
      ctx.addIssue({ code: 'custom', path: [key], message: `Unknown color role: ${key}` })
  }
})

export const themeInputSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/)
    .optional(),
  name: z.string().trim().min(1).max(60).optional(),
  base: z.enum(['default', 'oled', 'high-contrast']).optional(),
  /** Sets the accent and generates the rest of its family. */
  accent: colorString.optional(),
  /** Explicit role values; these win over generated ones. */
  colors: roleColors.optional(),
})

/** A custom theme: a partial override of a built-in theme. */
export type ThemeInput = {
  id?: string
  name?: string
  base?: BuiltInThemeId
  accent?: string
  colors?: Partial<Record<ThemeableRole, string>>
}

const lc = (fg: Rgba, bg: Rgba) => apcaLc(composite(bg, fg), bg)

/** Moves lightness by `step` until `ok` holds, within 0–1. Returns null if it never does. */
function seek(c: Rgba, step: number, ok: (c: Rgba) => boolean): Rgba | null {
  const l0 = lightness(c)
  for (let l = l0; l >= 0 && l <= 1; l += step) {
    const candidate = withLightness(c, l)
    if (ok(candidate)) return candidate
  }
  return null
}

/**
 * Generates the accent family from one color, aiming one Lc above each minimum so rounding never
 * tips a pairing below it.
 */
export function deriveAccent(
  accent: string,
  base: ThemeSpec = builtInThemes.default,
): Record<(typeof ACCENT_ROLES)[number], string> {
  const a = withAlpha(parseColor(accent), 1)
  const l = lightness(a)
  const bg = parseColor(base.colors.bg)
  const s1 = composite(bg, parseColor(base.colors.s1))
  const accentText =
    seek(a, 0.005, (c) => Math.min(lc(c, bg), lc(c, s1)) >= 61) ?? parseColor(base.colors.text)

  // A light accent takes a dark label on a slightly lighter fill; a dark one takes white.
  const white = parseColor('#ffffff')
  const dark = { fill: withLightness(a, Math.min(0.96, l + 0.067)), label: bg }
  const light = { fill: a, label: white }
  const [first, second] = l >= 0.65 ? [dark, light] : [light, dark]
  const solve = (o: typeof dark) => {
    const fill = seek(o.fill, o.label === bg ? 0.005 : -0.005, (f) => lc(o.label, f) >= 76)
    return fill && { fill, label: o.label }
  }
  const pair = solve(first) ?? solve(second) ?? { fill: white, label: bg }

  return {
    accent: formatHex(a),
    'accent-2': formatHex(withLightness(a, Math.max(0.3, l - 0.24))),
    'accent-text': formatHex(accentText),
    'accent-fill': formatHex(pair.fill),
    'on-accent': formatHex(pair.label),
    focus: formatHex(a),
  }
}

export type ThemeBuild = { spec: ThemeSpec; theme: ResolvedTheme; audit: ThemeAudit }

/** Builds a theme from a partial override and audits it. Throws if the input is invalid. */
export function createTheme(input: ThemeInput): ThemeBuild {
  const parsed = themeInputSchema.parse(input) as ThemeInput
  const base = builtInThemes[parsed.base ?? 'default']
  const spec: ThemeSpec = {
    ...base,
    id: parsed.id ?? 'custom',
    name: parsed.name ?? 'Custom',
    colors: {
      ...base.colors,
      ...(parsed.accent ? deriveAccent(parsed.accent, base) : {}),
      ...parsed.colors,
    },
  }
  const theme = resolveTheme(spec)
  return { spec, theme, audit: auditTheme(theme) }
}

/**
 * The nearest value for `role` (by lightness, toward `text` or toward `bg`) that makes the whole
 * theme pass. Returns null when no lightness works.
 */
export function nearestPassing(input: ThemeInput, role: ThemeableRole): string | null {
  const { spec } = createTheme(input)
  const start = parseColor(spec.colors[role])
  const l0 = lightness(start)
  const passes = (c: Rgba) =>
    createTheme({ ...input, colors: { ...input.colors, [role]: formatCss(c) } }).audit.pass
  for (let k = 0; k <= 200; k++) {
    for (const dir of [1, -1]) {
      const l = l0 + dir * k * 0.005
      if (l < 0 || l > 1) continue
      const candidate = { ...withLightness(start, l), a: start.a }
      if (passes(candidate)) return formatCss(candidate)
    }
  }
  return null
}

// ---- share codes: `hs1.` + base64url(JSON)

const CODE_PREFIX = 'hs1.'

const toBase64Url = (s: string) => {
  let bin = ''
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromBase64Url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))
}

export function encodeTheme(input: ThemeInput): string {
  return CODE_PREFIX + toBase64Url(JSON.stringify(themeInputSchema.parse(input)))
}

export class ThemeCodeError extends Error {
  override name = 'ThemeCodeError'
}

export function decodeTheme(code: string): ThemeInput {
  const s = code.trim()
  if (!s.startsWith(CODE_PREFIX) || s.length > 4096)
    throw new ThemeCodeError('Not a highsea theme code')
  let json: unknown
  try {
    json = JSON.parse(fromBase64Url(s.slice(CODE_PREFIX.length)))
  } catch {
    throw new ThemeCodeError('This theme code is damaged')
  }
  const result = themeInputSchema.safeParse(json)
  if (!result.success)
    throw new ThemeCodeError(result.error.issues[0]?.message ?? 'Invalid theme code')
  return result.data as ThemeInput
}
