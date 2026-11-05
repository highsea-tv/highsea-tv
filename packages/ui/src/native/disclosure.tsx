// SPDX-License-Identifier: AGPL-3.0-only
// A disclosure (design system 1.1's wishes from stage 6): an accordion row whose title shows and
// hides what's under it, at the control's height and text, with a chevron that turns to say which.
// VoiceOver hears it as a button that's expanded or collapsed
// (https://reactnative.dev/docs/accessibility#accessibilitystate). On the TV the row is a focus stop.
import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { DisclosureCommon } from '../shared/controls.ts'
import { ControlPress, ControlText, useControllable } from './control.tsx'
import { Icon, type IconName } from './icon.tsx'
import { Text } from './text.tsx'
import { useControl, useTheme } from './theme.tsx'

export function Disclosure({
  title,
  icon,
  detail,
  open,
  defaultOpen = false,
  onOpenChange,
  children,
}: DisclosureCommon<IconName> & { children: ReactNode }) {
  const theme = useTheme()
  const m = useControl()
  const [shown, show] = useControllable(open, defaultOpen, onOpenChange)
  return (
    <View>
      <ControlPress
        state={{ expanded: shown }}
        accessibilityLabel={detail ? `${title}, ${detail}` : title}
        radius={m.radius}
        lift="row"
        haptic={false}
        slop={{ height: m.height }}
        onPress={() => show(!shown)}
        style={{
          minHeight: m.height,
          flexDirection: 'row',
          alignItems: 'center',
          gap: m.gap,
        }}
      >
        {icon ? <Icon name={icon} size={m.icon / theme.u} color="text-2" /> : null}
        <View style={{ flex: 1 }}>
          <ControlText m={m} weight={500} color={theme.colors.text} lines={0}>
            {title}
          </ControlText>
        </View>
        {detail ? (
          <Text variant="callout" color="text-3">
            {detail}
          </Text>
        ) : null}
        <Icon name={shown ? 'chevron-up' : 'chevron-down'} size={m.icon / theme.u} color="text-2" />
      </ControlPress>
      {shown ? <View style={{ paddingTop: m.gap }}>{children}</View> : null}
    </View>
  )
}
