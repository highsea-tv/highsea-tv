// SPDX-License-Identifier: AGPL-3.0-only
// One settings section as its own screen, with a way back to You (the prototype's
// MobileSettingsScreen).
import { useT } from '@highsea-tv/i18n/react'
import { EmptyState } from '@highsea-tv/ui-native'
import { useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { Back, Screen, Title } from '../../../../kit.tsx'
import { you as messages } from '../../../../messages.ts'
import { SECTIONS, SectionBody } from '../../../../settings.tsx'

export default function SettingsScreen() {
  const t = useT(messages)
  const { section } = useLocalSearchParams<{ section: string }>()
  const s = SECTIONS.find((x) => x.id === section)
  return (
    <Screen tabs gap={16}>
      <Back label={t('title')} />
      {s ? (
        <>
          <Title>{t(`section.${s.id}`)}</Title>
          <SectionBody id={s.id} />
        </>
      ) : (
        <View style={{ paddingVertical: 40 }}>
          <EmptyState icon="settings" title={t('missingTitle')}>
            {t('missingBody')}
          </EmptyState>
        </View>
      )}
    </Screen>
  )
}
