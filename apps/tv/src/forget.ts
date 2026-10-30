// SPDX-License-Identifier: AGPL-3.0-only
// Forgetting a server, asked first, from the foot of sign-in and of Unreachable (as on the phone,
// apps/mobile/src/forget.ts). Its token leaves the keychain with it. Alert is tvOS's own alert,
// and Android TV's dialog, each moved over with the remote.
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import { Alert } from 'react-native'
import { forget as messages } from './messages.ts'

export function useForget() {
  const t = useT(messages)
  const servers = useServers()
  return (id: string, name: string) =>
    Alert.alert(t('confirm', { name }), t('detail'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('forget', { name }), style: 'destructive', onPress: () => void servers.remove(id) },
    ])
}
