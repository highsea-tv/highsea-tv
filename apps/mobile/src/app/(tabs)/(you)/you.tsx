// SPDX-License-Identifier: AGPL-3.0-only
// C8 You on the phone (client-settings.md#you), from the prototype's mobile/more.tsx: who's
// signed in and on which server, the settings sections, Downloads, and signing out of this server
// (which forgets its token here and keeps the server in the list).
import { useT } from '@highsea-tv/i18n/react'
import { useSessionData } from '@highsea-tv/native/session'
import { Avatar, Text } from '@highsea-tv/ui-native'
import { router } from 'expo-router'
import { View } from 'react-native'
import { Group, Row, Screen } from '../../../kit.tsx'
import { you as messages } from '../../../messages.ts'
import { SECTIONS, SignOutRow } from '../../../settings.tsx'
import { Header, useServerName } from '../../../shell.tsx'

export default function You() {
  const t = useT(messages)
  const session = useSessionData()
  const name = useServerName()
  const u = session.user
  return (
    <Screen tabs gap={24}>
      <Header title={t('title')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={u.displayName} size={56} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title" size={20} numberOfLines={1}>
            {u.displayName}
          </Text>
          <Text variant="caption" size={13} color="text-3" numberOfLines={1}>
            {t(`handle.${u.role}`, { username: u.username, name })}
          </Text>
        </View>
      </View>
      <View accessibilityLabel={t('settings')}>
        <Group>
          {SECTIONS.map((s) => (
            <Row
              key={s.id}
              icon={s.icon}
              title={t(`section.${s.id}`)}
              onPress={() => router.push(`/settings/${s.id}`)}
            />
          ))}
        </Group>
      </View>
      <Group>
        <Row icon="download" title={t('downloads')} onPress={() => router.navigate('/offline')} />
        <SignOutRow />
      </Group>
    </Screen>
  )
}
