'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A button or an icon button on the control spec (controls.md): its size from the `--control-*`
// variables, its corner `radius-sm`, its looks from the tokens' `buttonLooks`, and the touch hit
// area around it. The props are the shared `ButtonCommon` (src/shared/controls.ts) plus the DOM's.
import type { ButtonVariant } from '@highsea-tv/tokens'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import type { ButtonCommon } from '../../shared/controls.ts'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import {
  type ControlSize,
  controlDisabled,
  controlHit,
  controlPress,
  controlShape,
  controlSizes,
} from '../lib/control.ts'

export type { ButtonVariant }
export type ButtonSize = ControlSize

// A label wraps only when the button would be wider than its container (a phone at 200% text, WCAG
// 1.4.4 and 1.4.10); otherwise it's one line at the control's height, as before.
const base = `inline-flex max-w-full shrink-0 cursor-pointer select-none items-center justify-center text-balance text-center [overflow-wrap:anywhere] border border-transparent font-medium transition-press focus-visible:scale-(--scale-button) [&_svg]:shrink-0 ${controlShape} ${controlHit} ${controlPress} ${controlDisabled}`

/** The tokens' `buttonLooks` as classes (controls.md › Looks). */
const buttonVariants: Record<ButtonVariant, string> = {
  // one per view (color.md): the accent fill with a 600 label, no subpixel thinning
  primary:
    'bg-accent-fill font-semibold text-on-accent [-webkit-font-smoothing:auto] hover:brightness-108',
  secondary: 'border-line-strong bg-s2 text-text hover:bg-s3',
  ghost: 'bg-transparent text-text-2 hover:bg-s2 hover:text-text',
  danger:
    'bg-danger-fill font-semibold text-on-danger [-webkit-font-smoothing:auto] hover:brightness-110',
  // danger's words without its fill (the owner, 2026-10-29): a destructive action that shouldn't
  // weigh as much as the view's own, such as Forget this server
  'danger-ghost': 'bg-transparent text-danger hover:bg-s2',
  // over artwork (a film's page, the TV's hero): `text` at a low alpha, so the picture shows through
  overlay: 'bg-control-overlay text-text hover:bg-control-overlay-hover',
}

export const buttonSizes: Record<ButtonSize, { box: string; icon: string; glyph: string }> = {
  md: {
    box: `${controlSizes.md.minH} ${controlSizes.md.pad} ${controlSizes.md.gap} ${controlSizes.md.text} py-1`,
    icon: controlSizes.md.square,
    glyph: controlSizes.md.icon,
  },
  sm: {
    box: `${controlSizes.sm.minH} ${controlSizes.sm.pad} ${controlSizes.sm.gap} ${controlSizes.sm.text} py-0.5`,
    icon: controlSizes.sm.square,
    glyph: controlSizes.sm.icon,
  },
}

export type ButtonProps = Omit<ComponentProps<'button'>, keyof ButtonCommon> &
  ButtonCommon<IconName> & {
    /** Renders the child element (a link) with button styling. */
    asChild?: boolean
  }

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  iconOnly = false,
  loading = false,
  block = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const s = buttonSizes[size]
  const lead = loading ? (
    <Icon name="loading" className={cn(s.glyph, 'motion-safe:animate-spin')} />
  ) : icon ? (
    <Icon name={icon} className={s.glyph} />
  ) : null
  const classes = cn(
    base,
    buttonVariants[variant],
    s.box,
    iconOnly && s.icon,
    block && 'w-full',
    className,
  )
  // the icons go inside the child (a link), around its own content
  if (asChild)
    return (
      <Slot.Root data-control="button" className={classes} {...props}>
        {lead}
        <Slot.Slottable>{children}</Slot.Slottable>
        {iconEnd && <Icon name={iconEnd} className={s.glyph} />}
      </Slot.Root>
    )
  return (
    <button
      type={type ?? 'button'}
      data-control="button"
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {lead}
      {children}
      {iconEnd && <Icon name={iconEnd} className={s.glyph} />}
    </button>
  )
}
