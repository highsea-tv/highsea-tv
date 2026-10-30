// SPDX-License-Identifier: AGPL-3.0-only
// Forgetting a server, asked first wherever it's offered: Choose a server (a swipe or a long
// press on its row), its sign-in, and You › Servers. Its token leaves the keychain with it.
import { useT } from '@highsea-tv/i18n/react'
import { Alert } from 'react-native'
import { forget as messages } from '../messages.ts'
import { useServers } from './servers.tsx'

export function useForget() {
  const t = useT(messages)
  const servers = useServers()
  return (id: string, name: string) =>
    Alert.alert(t('confirm', { name }), t('detail'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('forget', { name }), style: 'destructive', onPress: () => void servers.remove(id) },
    ])
}
