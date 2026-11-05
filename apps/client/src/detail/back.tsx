// SPDX-License-Identifier: AGPL-3.0-only
// Back over a page's art by touch, where the phone has no bar at the top: the prototypes'
// BackBadge (mobile/kit.tsx), drawn by a film's page, a person's page and a collection's page,
// loaded, loading or failed alike, so there's always a way out. In the overlay look
// (controls.md › Looks), just inside the status bar; kit's goBack takes it where the page was
// opened from, or Home.
import { useT } from '@highsea-tv/i18n/react'
import { Button, tokens } from '@highsea-tv/ui'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { goBack } from '../kit.tsx'
import { libraryScreenMessages } from '../library/messages.ts'

const { space } = tokens

export function OverlayBack() {
  const words = useT(libraryScreenMessages)
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{ position: 'absolute', top: insets.top + space['2'], left: space['3'], zIndex: 10 }}
    >
      <Button
        variant="overlay"
        iconOnly
        icon="chevron-left"
        accessibilityLabel={words('back')}
        onPress={goBack}
      />
    </View>
  )
}
