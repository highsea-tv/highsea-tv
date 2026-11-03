// SPDX-License-Identifier: AGPL-3.0-only
// An address the client has no screen for, worded as the phone's and the TV's catalogs have it
// (https://docs.expo.dev/router/error-handling/#unmatched-routes). On the web it's what a link
// into a screen part B hasn't ported opens.
import { useT } from '@highsea-tv/i18n/react'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import { router } from 'expo-router'
import { View } from 'react-native'
import { notFound } from '../messages.ts'

export default function NotFound() {
  const t = useT(notFound)
  const theme = useTheme()
  const tv = theme.formFactor.input === 'tv'
  const pad = tv ? tokens.tv.safe.x * theme.u : tokens.mobile.gutter
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: pad,
        gap: pad / 2,
      }}
    >
      <Text variant={tv ? 'heroTitle' : 'title'} align="center" accessibilityRole="header">
        {t('title')}
      </Text>
      <Text variant={tv ? 'synopsis' : 'body'} color="text-2" align="center">
        {t('body')}
      </Text>
      {/* a button hugs its words at the column's start (alignSelf), so its row is centred */}
      <View>
        <Button variant="primary" onPress={() => router.replace('/')}>
          {t('home')}
        </Button>
      </View>
    </View>
  )
}
