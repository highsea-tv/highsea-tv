// SPDX-License-Identifier: AGPL-3.0-only
// One choice from a few (controls.md › One look per kind): the segmented control, and Tabs, which
// draw the same track in a toolbar or a line under a page's title. The track is `s2` at the
// control's height with the spec's inset; the chosen segment is `control-selected` (3:1 on the
// track) in the same corner less the inset, its label `text` at 600. On the phone each segment's
// target reaches 44 through the hit area; on the TV each is a focus stop.
import { Platform, View, type ViewStyle } from 'react-native'
import type { SegmentedCommon } from '../shared/controls.ts'
import { ControlPress, ControlText, lookAt, useControllable } from './control.tsx'
import { Icon, type IconName } from './icon.tsx'
import { OWN_SIZE } from './own-size.ts'
import { Text } from './text.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'

/** A count after a tab's label: mono 11 in `text-3`, `text` on the chosen tab (web/components/tabs.tsx). */
const COUNT_SIZE = 11

function Count({ on, n }: { on: boolean; n: number }) {
  return (
    <Text mono size={COUNT_SIZE} color={on ? 'text' : 'text-3'} numberOfLines={1}>
      {String(n)}
    </Text>
  )
}

/**
 * Too many to fit, the row scrolls sideways on the web with its scrollbar hidden, as the web
 * renderer's track and tab list do (web/components/tabs.tsx, segmented.tsx): never wider than its
 * column, so a narrow window doesn't widen the page. react-native-web takes `overflowX` and
 * `scrollbarWidth` as web styles (https://necolas.github.io/react-native-web/docs/styling/).
 */
const SIDEWAYS = (
  Platform.OS === 'web'
    ? { maxWidth: '100%', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }
    : null
) as ViewStyle | null

export type SegmentedControlProps<V extends string = string> = SegmentedCommon<V, IconName>

function Segments<V extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  'aria-label': label,
  size,
  block,
  tabs,
}: SegmentedControlProps<V> & { tabs: boolean }) {
  const theme = useTheme()
  const m = useControl(size)
  const [chosen, choose] = useControllable<V | undefined>(
    value,
    defaultValue ?? options[0]?.value,
    onValueChange as ((v: V | undefined) => void) | undefined,
  )
  const looks = tokens.controls.looks
  const inner = m.height - m.inset * 2
  return (
    <View
      accessibilityRole={tabs ? 'tablist' : 'radiogroup'}
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        ...(block ? { alignSelf: 'stretch' as const } : OWN_SIZE),
        minHeight: m.height,
        padding: m.inset,
        gap: m.inset,
        borderRadius: m.radius,
        backgroundColor: theme.colors[looks.track.fill],
        ...SIDEWAYS,
      }}
    >
      {options.map((o) => {
        const on = o.value === chosen
        const look = on ? looks.selected : looks.track
        return (
          <ControlPress
            key={o.value}
            role={tabs ? 'tab' : 'radio'}
            state={{ selected: on, checked: tabs ? undefined : on }}
            accessibilityLabel={o.label}
            disabled={o.disabled}
            radius={m.radius - m.inset}
            slop={{ height: inner }}
            onPress={() => choose(o.value)}
            style={{
              flex: block ? 1 : undefined,
              minHeight: inner,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: m.gap,
              paddingHorizontal: m.pad - m.inset,
              backgroundColor: on ? theme.colors[looks.selected.fill] : 'transparent',
              opacity: o.disabled ? tokens.controls.disabledOpacity : 1,
            }}
          >
            {(_focused, state) => {
              // a pointer over an unchosen segment turns its label to `text` (the track's hover)
              const label = lookAt(look, o.disabled ? { ...state, hovered: false } : state).label
              return (
                <>
                  {o.icon ? <Icon name={o.icon} size={m.icon / theme.u} color={label} /> : null}
                  <ControlText m={m} weight={look.weight} color={theme.colors[label]} lines={1}>
                    {o.label}
                  </ControlText>
                  {o.count == null ? null : <Count on={on} n={o.count} />}
                </>
              )
            }}
          </ControlPress>
        )
      })}
    </View>
  )
}

export function SegmentedControl<V extends string = string>(props: SegmentedControlProps<V>) {
  return <Segments {...props} tabs={false} />
}

/**
 * Tabs: the segmented look in a toolbar (the default), or `line`, the page's sections under its
 * title, with the chosen one's label in `text` over a 2pt accent line.
 */
export function Tabs<V extends string = string>({
  variant = 'segmented',
  ...props
}: SegmentedControlProps<V> & { variant?: 'segmented' | 'line' }) {
  if (variant === 'segmented') return <Segments {...props} tabs />
  return <LineTabs {...props} />
}

function LineTabs<V extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  'aria-label': label,
  size,
  block,
}: SegmentedControlProps<V>) {
  const theme = useTheme()
  const m = useControl(size)
  const [chosen, choose] = useControllable<V | undefined>(
    value,
    defaultValue ?? options[0]?.value,
    onValueChange as ((v: V | undefined) => void) | undefined,
  )
  const looks = tokens.controls.looks
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        gap: m.pad,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.line,
        ...SIDEWAYS,
      }}
    >
      {options.map((o) => {
        const on = o.value === chosen
        return (
          <ControlPress
            key={o.value}
            role="tab"
            state={{ selected: on }}
            accessibilityLabel={o.label}
            disabled={o.disabled}
            radius={m.radius}
            slop={{ height: m.height }}
            onPress={() => choose(o.value)}
            style={{
              flex: block ? 1 : undefined,
              minHeight: m.height,
              alignItems: 'center',
              justifyContent: 'center',
              borderBottomWidth: 2,
              borderBottomColor: on ? theme.colors.accent : 'transparent',
              marginBottom: -1,
              opacity: o.disabled ? tokens.controls.disabledOpacity : 1,
            }}
          >
            {(_focused, state) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: m.gap }}>
                <ControlText
                  m={m}
                  weight={on ? looks.selected.weight : looks.track.weight}
                  color={
                    theme.colors[
                      on
                        ? looks.selected.label
                        : lookAt(looks.track, o.disabled ? { ...state, hovered: false } : state)
                            .label
                    ]
                  }
                  lines={1}
                >
                  {o.label}
                </ControlText>
                {o.count == null ? null : <Count on={on} n={o.count} />}
              </View>
            )}
          </ControlPress>
        )
      })}
    </View>
  )
}
