// SPDX-License-Identifier: AGPL-3.0-only
// Selects (controls.md): the field look, showing what's chosen and a chevron, that opens a sheet
// of the choices, iOS's way of choosing from a list (mobile.md › Platform conventions). A Select
// chooses one (radios) and closes as it's chosen; a MultiSelect chooses several (checkboxes) and
// closes with the sheet's Close. Inside a Field, the field's label names it.
// On a pointer (D2, the admin) it hangs a list from the field instead, as the web renderer's Radix
// Select and every desktop browser's own `<select>` do: the library's pointer Menu, at least the
// field's width, its choices `menuitemradio` (`menuitemcheckbox` for a MultiSelect, which stays
// open) under their groups' headings, following WAI-ARIA's menu button pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) as Menu does.
import { type ComponentRef, type Ref, useRef, useState } from 'react'
import { View } from 'react-native'
import type { ChoiceOption, MultiSelectCommon } from '../shared/controls.ts'
import { ControlPress, ControlText, useControllable } from './control.tsx'
import { fieldBox, useField } from './field.tsx'
import { Icon, type IconName } from './icon.tsx'
import { Menu } from './menu.tsx'
import { Sheet } from './sheet.tsx'
import { tokens, useControl, useTheme } from './theme.tsx'
import { Checkbox, Radio } from './toggle.tsx'

export type MultiSelectProps<V extends string = string> = MultiSelectCommon<V, IconName>

/** One choice from a list: MultiSelect's props with one value. */
export type SelectProps<V extends string = string> = Omit<
  MultiSelectProps<V>,
  'value' | 'defaultValue' | 'onValueChange'
> & {
  value?: V
  defaultValue?: V
  onValueChange?: (value: V) => void
}

function Trigger<V extends string>({
  shown,
  placeholder,
  name,
  size,
  disabled,
  open,
  trigger,
  onPress,
}: {
  shown: ChoiceOption<V, IconName>[]
  placeholder?: string
  name: string
  size?: MultiSelectProps['size']
  disabled?: boolean
  /** A pointer's list is open: the field says it's expanded. */
  open?: boolean
  trigger?: Ref<ComponentRef<typeof View>>
  onPress: () => void
}) {
  const theme = useTheme()
  const field = useField()
  const m = useControl(size ?? field?.size)
  const off = disabled ?? field?.disabled
  const words = shown.map((o) => o.label).join(', ')
  const look = tokens.controls.looks
  return (
    <ControlPress
      ref={trigger}
      hasPopup={open === undefined ? undefined : 'menu'}
      state={open === undefined ? undefined : { expanded: open }}
      accessibilityLabel={name}
      accessibilityHint={words || placeholder}
      disabled={off}
      radius={m.radius}
      slop={{ height: m.height }}
      onPress={onPress}
      style={[
        fieldBox(theme, m, false, field?.invalid ?? false),
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: m.gap,
          paddingHorizontal: m.fieldPad,
          opacity: off ? tokens.controls.disabledOpacity : 1,
        },
      ]}
    >
      {shown.length === 1 && shown[0]?.icon ? (
        <Icon name={shown[0].icon} size={m.icon / theme.u} color="text-2" />
      ) : null}
      <View style={{ flex: 1 }}>
        <ControlText
          m={m}
          weight={m.weight}
          color={theme.colors[words ? look.field.label : look.placeholder.label]}
          lines={1}
          mono={shown.length === 1 && shown[0]?.mono}
        >
          {words || placeholder || ''}
        </ControlText>
      </View>
      <Icon name="chevron-down" size={m.icon / theme.u} color="text-2" />
    </ControlPress>
  )
}

export function Select<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  'aria-label': ariaLabel,
  size,
  disabled,
}: SelectProps<V>) {
  const field = useField()
  const [open, setOpen] = useState(false)
  const [chosen, choose] = useControllable<V | undefined>(
    value,
    defaultValue,
    onValueChange as ((v: V | undefined) => void) | undefined,
  )
  const name = ariaLabel ?? field?.label ?? placeholder ?? ''
  const pointer = useTheme().formFactor.input === 'pointer'
  const anchor = useRef<ComponentRef<typeof View>>(null)
  const trigger = (
    <Trigger
      shown={options.filter((o) => o.value === chosen)}
      placeholder={placeholder}
      name={name}
      size={size}
      disabled={disabled}
      open={pointer ? open : undefined}
      trigger={anchor}
      onPress={() => setOpen(true)}
    />
  )
  if (pointer)
    return (
      <>
        {trigger}
        <Menu
          title={name}
          open={open}
          onClose={() => setOpen(false)}
          anchor={anchor}
          align="start"
          matchWidth
          items={options.map((o) => ({
            label: o.label,
            icon: o.icon,
            group: o.group,
            mono: o.mono,
            disabled: o.disabled,
            current: o.value === chosen,
            onSelect: () => choose(o.value),
          }))}
        />
      </>
    )
  return (
    <>
      {trigger}
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <View accessibilityRole="radiogroup" accessibilityLabel={name}>
          {options.map((o) => (
            <Radio
              key={o.value}
              label={o.label}
              checked={o.value === chosen}
              disabled={o.disabled}
              onCheckedChange={() => {
                choose(o.value)
                setOpen(false)
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  )
}

export function MultiSelect<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  'aria-label': ariaLabel,
  size,
  disabled,
}: MultiSelectProps<V>) {
  const field = useField()
  const [open, setOpen] = useState(false)
  const [chosen, choose] = useControllable<V[]>(value, defaultValue ?? [], onValueChange)
  const name = ariaLabel ?? field?.label ?? placeholder ?? ''
  const pointer = useTheme().formFactor.input === 'pointer'
  const anchor = useRef<ComponentRef<typeof View>>(null)
  // kept in the options' order, whatever order they're chosen in
  const toggle = (value: V, on: boolean) =>
    choose(options.map((x) => x.value).filter((v) => (v === value ? on : chosen.includes(v))))
  const trigger = (
    <Trigger
      shown={options.filter((o) => chosen.includes(o.value))}
      placeholder={placeholder}
      name={name}
      size={size}
      disabled={disabled}
      open={pointer ? open : undefined}
      trigger={anchor}
      onPress={() => setOpen(true)}
    />
  )
  if (pointer)
    return (
      <>
        {trigger}
        <Menu
          title={name}
          open={open}
          onClose={() => setOpen(false)}
          anchor={anchor}
          align="start"
          matchWidth
          items={options.map((o) => ({
            label: o.label,
            icon: o.icon,
            group: o.group,
            mono: o.mono,
            disabled: o.disabled,
            checked: chosen.includes(o.value),
            keepsOpen: true,
            onSelect: () => toggle(o.value, !chosen.includes(o.value)),
          }))}
        />
      </>
    )
  return (
    <>
      {trigger}
      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        {options.map((o) => (
          <Checkbox
            key={o.value}
            label={o.label}
            checked={chosen.includes(o.value)}
            disabled={o.disabled}
            onCheckedChange={(on) => toggle(o.value, on)}
          />
        ))}
      </Sheet>
    </>
  )
}
