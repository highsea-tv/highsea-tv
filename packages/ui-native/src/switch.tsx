// SPDX-License-Identifier: AGPL-3.0-only
// A switch in a row: the platform's own control, tinted with the accent, beside its label. iOS's
// UISwitch is what people expect on the phone (mobile.md › Platform conventions).
import { Switch as RNSwitch, View } from 'react-native'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

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
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: tokens.targets.touch,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="caption" color="text-3">
            {hint}
          </Text>
        ) : null}
      </View>
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: theme.colors['accent-fill'], false: theme.colors.s3 }}
        ios_backgroundColor={theme.colors.s3}
        // React Native's iOS Switch sets alignSelf: 'flex-start' (Switch.js); centre it in the row
        style={{ alignSelf: 'center' }}
      />
    </View>
  )
}
