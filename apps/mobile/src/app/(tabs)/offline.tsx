// SPDX-License-Identifier: AGPL-3.0-only
// C8 Offline on the phone (client-settings.md#offline-before-downloads, signed off 2026-10-29):
// downloads come with checkpoint 4.6, so until then the tab stays and says what's coming.
import { useT } from '@highsea-tv/i18n/react'
import { EmptyState } from '@highsea-tv/ui-native'
import { View } from 'react-native'
import { Screen } from '../../kit.tsx'
import { offline as messages } from '../../messages.ts'
import { Header } from '../../shell.tsx'

export default function Offline() {
  const t = useT(messages)
  return (
    <Screen tabs gap={20}>
      <Header title={t('title')} />
      <View style={{ paddingVertical: 24 }}>
        <EmptyState icon="download" title={t('emptyTitle')}>
          {t('emptyBody')}
        </EmptyState>
      </View>
    </Screen>
  )
}
