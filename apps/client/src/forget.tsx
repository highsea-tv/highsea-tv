// SPDX-License-Identifier: AGPL-3.0-only
// Forgetting a server, asked first wherever it's offered: Choose a server (a swipe, a long press
// or VoiceOver's action on its row), its sign-in, Unreachable and Settings › Servers. Its token
// leaves the keychain with it (on the web, the page's storage). The question is the library's
// Dialog, or TvConfirm on the TV (./kit.tsx's useConfirm), drawn where the screen puts `prompt`.
import { forgetMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import { useDesktopHost } from './desktop/host.ts'
import { useDevice } from './host'
import { useConfirm } from './kit.tsx'

export function useForget() {
  const t = useT(forgetMessages)
  const servers = useServers()
  // the desktop app is a computer, not a browser, though it draws the web's form (ADR 0058)
  const inApp = useDesktopHost() !== null
  const kind = useDevice()
  const device = inApp ? 'desktop' : kind
  const { ask, prompt } = useConfirm()
  const forget = (id: string, name: string) =>
    ask({
      title: t('confirm', { name }),
      body: t('detail', { device }),
      cancel: t('cancel'),
      action: t('forget', { name }),
      icon: 'delete',
      run: () => void servers.remove(id),
    })
  return { forget, prompt }
}
