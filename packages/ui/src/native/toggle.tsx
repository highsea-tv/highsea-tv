// SPDX-License-Identifier: AGPL-3.0-only
// Checkboxes, radios and switches (controls.md › Looks), each in a row with its words at the
// control's height and text. A checkbox's and a radio's mark is the spec's icon inside its inset,
// edged in `control-edge` (3:1) and filled with `accent-fill` when on; the checkbox takes the
// thumb's corner (the control's corner less the inset), the radio is round. On the phone a switch
// is iOS's own UISwitch, which people expect (mobile.md › Platform conventions), tinted with the
// spec's off and on roles; tvOS has no UISwitch, so the TV draws the same two roles. On touch the
// row's target reaches 44 through the hit area.
import type { ReactNode } from 'react'
import { Switch as RNSwitch, View } from 'react-native'
import type { ToggleCommon } from '../shared/controls.ts'
import { ControlPress, ControlText, useControllable } from './control.tsx'
import { Icon } from './icon.tsx'
import type { ControlPoints } from './metrics.ts'
import { Text } from './text.tsx'
import { type Theme, tokens, useControl, useTheme } from './theme.tsx'

export type ToggleProps = ToggleCommon & {
  /** A quieter line under the words. */
  hint?: string
}

function Words({
  m,
  label,
  hint,
  off,
}: {
  m: ControlPoints
  label?: string
  hint?: string
  off?: boolean
}) {
  const theme = useTheme()
  if (!label) return null
  return (
    <View style={{ flex: 1, opacity: off ? tokens.controls.disabledOpacity : 1 }}>
      <ControlText m={m} weight={m.weight} color={theme.colors.text} lines={0}>
        {label}
      </ControlText>
      {hint ? (
        <Text variant="caption" color="text-3">
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

function markBox(theme: Theme, m: ControlPoints, on: boolean, round: boolean) {
  const looks = tokens.controls.looks
  const box = m.icon + m.inset * 2
  return {
    width: box,
    height: box,
    borderRadius: round ? tokens.radius.pill : m.radius - m.inset,
    borderWidth: on && !round ? 0 : 1,
    borderColor: theme.colors[on ? looks.toggleOn.fill : looks.toggleOff.fill],
    backgroundColor: on && !round ? theme.colors[looks.toggleOn.fill] : 'transparent',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  }
}

function ToggleRow({
  role,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  label,
  hideLabel,
  hint,
  radio,
  mark,
}: ToggleProps & {
  role: 'checkbox' | 'radio' | 'switch'
  radio?: boolean
  mark: (on: boolean, m: ControlPoints) => ReactNode
}) {
  const m = useControl()
  const [on, set] = useControllable(checked, defaultChecked ?? false, onCheckedChange)
  const box = m.icon + m.inset * 2
  const words = hideLabel ? undefined : label
  return (
    <ControlPress
      role={role}
      state={{ checked: on }}
      accessibilityLabel={label}
      disabled={disabled}
      radius={m.radius}
      lift="row"
      slop={words ? { height: m.height } : { height: box, width: box }}
      // a radio that's on stays on: choosing another radio in its group turns it off
      onPress={() => set(radio ? true : !on)}
      style={{
        minHeight: words ? m.height : box,
        // with no words it's the end of a row (a list row's switch), centred in it
        alignSelf: words ? 'stretch' : 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.gap,
      }}
    >
      {role === 'switch' ? (
        <>
          <Words m={m} label={words} hint={hint} off={disabled} />
          {mark(on, m)}
        </>
      ) : (
        <>
          <View style={{ opacity: disabled ? tokens.controls.disabledOpacity : 1 }}>
            {mark(on, m)}
          </View>
          <Words m={m} label={words} hint={hint} off={disabled} />
        </>
      )}
    </ControlPress>
  )
}

export function Checkbox(props: ToggleProps) {
  const theme = useTheme()
  return (
    <ToggleRow
      {...props}
      role="checkbox"
      mark={(on, m) => (
        <View style={markBox(theme, m, on, false)}>
          {on ? (
            <Icon
              name="check"
              size={m.icon / theme.u}
              color={tokens.controls.looks.toggleOn.label}
            />
          ) : null}
        </View>
      )}
    />
  )
}

export function Radio(props: ToggleProps) {
  const theme = useTheme()
  return (
    <ToggleRow
      {...props}
      role="radio"
      radio
      mark={(on, m) => (
        <View style={markBox(theme, m, on, true)}>
          {on ? (
            <View
              style={{
                width: m.icon - m.inset * 2,
                height: m.icon - m.inset * 2,
                borderRadius: tokens.radius.pill,
                backgroundColor: theme.colors[tokens.controls.looks.toggleOn.fill],
              }}
            />
          ) : null}
        </View>
      )}
    />
  )
}

/** A switch beside its words, the whole row pressable. */
export function Switch(props: ToggleProps) {
  const theme = useTheme()
  const looks = tokens.controls.looks
  return (
    <ToggleRow
      {...props}
      role="switch"
      mark={(on, m) =>
        theme.platform === 'tv' ? (
          <TvTrack on={on} m={m} />
        ) : (
          <RNSwitch
            value={on}
            // the row takes the press; the switch shows it, and VoiceOver reads the row
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            disabled={props.disabled}
            trackColor={{
              true: theme.colors[looks.toggleOn.fill],
              false: theme.colors[looks.toggleOff.fill],
            }}
            ios_backgroundColor={theme.colors[looks.toggleOff.fill]}
            // React Native's iOS Switch sets alignSelf: 'flex-start' (Switch.js); centre it in the row
            style={{ alignSelf: 'center', pointerEvents: 'none' }}
          />
        )
      }
    />
  )
}

/** The TV's switch: a track in the off or on role with a `text` thumb, the spec's icon inside its inset. */
function TvTrack({ on, m }: { on: boolean; m: ControlPoints }) {
  const theme = useTheme()
  const looks = tokens.controls.looks
  const height = m.icon + m.inset * 2
  return (
    <View
      style={{
        width: height * 2 - m.inset * 2,
        height,
        padding: m.inset,
        borderRadius: tokens.radius.pill,
        alignItems: on ? 'flex-end' : 'flex-start',
        backgroundColor: theme.colors[on ? looks.toggleOn.fill : looks.toggleOff.fill],
      }}
    >
      <View
        style={{
          width: m.icon,
          height: m.icon,
          borderRadius: tokens.radius.pill,
          backgroundColor: theme.colors[on ? looks.toggleOn.label : 'text'],
        }}
      />
    </View>
  )
}

/** A settings row's switch: its words, a hint under them, and the switch at the end. */
export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  disabled,
}: {
  label: string
  hint?: string
  value: boolean
  onValueChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <Switch
      label={label}
      hint={hint}
      checked={value}
      onCheckedChange={onValueChange}
      disabled={disabled}
    />
  )
}
