// SPDX-License-Identifier: AGPL-3.0-only
// Buttons and icon buttons (controls.md), as the web draws them: primary (one per view), secondary,
// ghost, danger, danger-ghost and overlay (over artwork: a film's page, the TV's hero), each look's
// roles from the control spec. The size is the form factor's rule: 36 and 30 with 14 text with a
// pointer; the same with 16 text on touch, inside a 44 hit area that doesn't move the layout; on
// the TV the same spec in its units, with the focus ring and lift (tv.md › Buttons). A label wraps rather than clipping at 200% text.
// With a pointer, a look with hover roles takes them while the pointer is over it (lookAt), and
// primary and danger, whose fills have no hover role, brighten as the web renderer's do
// (`hover:brightness-108` and `hover:brightness-110` in ui-web's button.tsx), through React
// Native's `filter` (https://reactnative.dev/docs/view-style-props#filter: brightness works on
// every platform), which react-native-web writes as CSS's. Only a pointer hovers: react-native-web's
// Pressable reports hover for a mouse or a pen, not for touch
// (https://necolas.github.io/react-native-web/docs/pressable/).
import type { ControlLook } from '@highsea-tv/tokens'
import { line } from '@highsea-tv/tokens'
import type { Ref } from 'react'
import {
  type AccessibilityProps,
  type AccessibilityState,
  ActivityIndicator,
  View,
} from 'react-native'
import type { ButtonCommon, ButtonVariant } from '../shared/controls.ts'
import { ControlPress, ControlText, lookAt } from './control.tsx'
import { Icon, type IconName } from './icon.tsx'
import { Image } from './image.tsx'
import { brighten, HOVER_BRIGHTNESS } from './lift.ts'
import { centredPadding } from './metrics.ts'
import { OWN_SIZE } from './own-size.ts'
import { tokens, useControl, useTheme } from './theme.tsx'
import type { ViewHandle } from './tv/focusable.tsx'
import type { TileSource } from './tv/tiles.tsx'

/** The outline's width: a thin line (elevation.md › Lines). */
const EDGE = line.thin

export type { ButtonVariant } from '../shared/controls.ts'

/** The looks whose fill has no hover role, and the brightness a pointer's hover gives them. */
const BRIGHTENED: Partial<Record<ButtonVariant, number>> = {
  primary: HOVER_BRIGHTNESS.soft,
  danger: HOVER_BRIGHTNESS.strong,
}

export type ButtonProps = ButtonCommon<IconName> &
  Pick<AccessibilityProps, 'accessibilityLabel' | 'accessibilityHint'> & {
    /** The label. An icon-only button names itself with `accessibilityLabel`. */
    children?: string
    onPress?: () => void
    onLongPress?: () => void
    onFocus?: () => void
    onBlur?: () => void
    /** A pointer came over the button or left it. */
    onHoverChange?: (hovered: boolean) => void
    /**
     * Its state for assistive technology (https://reactnative.dev/docs/accessibility#accessibilitystate):
     * `checked` makes it a toggle button, read as pressed or not (`aria-pressed` on the web);
     * `selected`, the one chosen of several; `expanded`, whether what it shows or hides is shown
     * (a biography's More and Less; `aria-expanded` on the web, WAI-ARIA's disclosure pattern:
     * https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/).
     */
    accessibilityState?: Pick<AccessibilityState, 'checked' | 'selected' | 'expanded'>
    /** It opens a menu or a dialog (`aria-haspopup`), with `accessibilityState.expanded` while open. */
    hasPopup?: 'menu' | 'dialog'
    /**
     * Where it leads: on the web an `<a href>` drawn as the button, with the link role (the web
     * renderer's Button `asChild` round an `<a>`); elsewhere `onPress` is the way.
     */
    href?: string
    /** How a browser follows `href`: saved (`download`), or in a new tab (`external`). */
    follow?: 'download' | 'external'
    /** The page or step it stands for is the one shown (`aria-current`): Manual import's modes. */
    current?: 'page'
    /** tvOS's preferred focus when the screen appears (react-native-tvos). */
    hasTVPreferredFocus?: boolean
    /** A round picture before the label: a person in the TV's Search. */
    image?: TileSource
    ref?: Ref<ViewHandle>
  }

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  iconOnly,
  loading,
  disabled,
  block,
  image,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  hasPopup,
  current,
  href,
  follow,
  onPress,
  onLongPress,
  onFocus,
  onBlur,
  onHoverChange,
  hasTVPreferredFocus,
  ref,
}: ButtonProps) {
  const theme = useTheme()
  const m = useControl(size)
  const rest: ControlLook = tokens.controls.buttonLooks[variant]
  const square = iconOnly || !children
  const off = disabled || loading
  // icons are in the Icon's own units (points on the phone, u on the TV)
  const iconSize = m.icon / theme.u
  return (
    <ControlPress
      ref={ref}
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={onFocus}
      onBlur={onBlur}
      onHoverChange={onHoverChange}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={off}
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityHint={accessibilityHint}
      role={typeof accessibilityState?.checked === 'boolean' ? 'togglebutton' : undefined}
      state={{ ...accessibilityState, busy: !!loading }}
      hasPopup={hasPopup}
      current={current}
      href={href}
      follow={follow}
      radius={m.radius}
      slop={square ? { height: m.height, width: m.height } : { height: m.height }}
      style={(state) => {
        const look = lookAt(rest, off ? { ...state, hovered: false } : state)
        const bright = state.hovered && !off ? BRIGHTENED[variant] : undefined
        return {
          minHeight: m.height,
          minWidth: square ? m.height : undefined,
          ...(block ? { alignSelf: 'stretch' as const } : OWN_SIZE),
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: m.gap,
          paddingHorizontal: square ? 0 : m.pad,
          paddingLeft: image !== undefined && !square ? m.inset * 2 : undefined,
          // the edge is inside the box (border-box), so the label is centred within it: a bordered
          // button is the spec's height, as one without an edge is
          paddingVertical: square ? 0 : Math.max(0, centredPadding(m) - (look.edge ? EDGE : 0)),
          backgroundColor: look.fill ? theme.colors[look.fill] : 'transparent',
          borderWidth: look.edge ? EDGE : 0,
          borderColor: look.edge ? theme.colors[look.edge] : undefined,
          opacity: disabled ? tokens.controls.disabledOpacity : 1,
          filter: bright ? brighten(bright) : undefined,
        }
      }}
    >
      {(_focused, state) => {
        const look = lookAt(rest, off ? { ...state, hovered: false } : state)
        const fg = theme.colors[look.label]
        return (
          <>
            {loading ? (
              <ActivityIndicator aria-hidden size="small" color={fg} />
            ) : icon ? (
              <Icon name={icon} size={iconSize} color={look.label} />
            ) : null}
            {image !== undefined ? (
              <Image
                source={image}
                style={{
                  width: m.height - m.inset * 2,
                  height: m.height - m.inset * 2,
                  borderRadius: tokens.radius.pill,
                  backgroundColor: theme.colors['control-overlay'],
                }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            {children && !iconOnly ? (
              <View style={{ flexShrink: 1 }}>
                <ControlText
                  m={m}
                  weight={look.weight}
                  color={fg}
                  filled={look.label === 'on-accent' || look.label === 'on-danger'}
                  style={{ textAlign: 'center' }}
                >
                  {children}
                </ControlText>
              </View>
            ) : null}
            {iconEnd && !square ? <Icon name={iconEnd} size={iconSize} color={look.label} /> : null}
          </>
        )
      }}
    </ControlPress>
  )
}
