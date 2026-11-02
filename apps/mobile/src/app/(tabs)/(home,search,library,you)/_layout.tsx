// SPDX-License-Identifier: AGPL-3.0-only
// Each tab's own stack (Home, Search, Library, You), with a movie and a collection pushed on it.
import { useTheme } from '@highsea-tv/ui'
import { Stack } from 'expo-router'

export default function TabStack() {
  const theme = useTheme()
  return (
    <Stack
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors.bg } }}
    />
  )
}
