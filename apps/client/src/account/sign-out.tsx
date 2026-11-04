// SPDX-License-Identifier: AGPL-3.0-only
// Signing out of the server in use: Settings' Sign out (Servers' button, the phone's last row) and
// the pointer's account menu (the prototype's web/shell.tsx Profile) ask the same and do the same.
import { settingsPageMessages } from '@highsea-tv/client/prefs'
import { useT } from '@highsea-tv/i18n/react'
import { useCurrent, useServers } from '@highsea-tv/native/servers'
import { useAction } from '@highsea-tv/sdk/react'
import { useState } from 'react'
import { useDevice } from '../host'
import { useConfirm, useSay, useServerName } from '../kit.tsx'

/** Asks first, then forgets this device's sign-in whether or not the server heard. */
export function useSignOut() {
  const t = useT(settingsPageMessages)
  const servers = useServers()
  const name = useServerName()
  const out = useAction((c) => c.auth.signOut())
  const { ask, prompt } = useConfirm()
  const device = useDevice()
  const current = useCurrent()
  const say = useSay()
  const [failure, setFailure] = useState<string | null>(null)
  const signOut = async () => {
    setFailure(null)
    try {
      await out.run()
    } catch {
      // a device token is this device's own sign-in, forgotten whether or not the server heard; a
      // browser's is the server's cookie, which only the server can end: starting again would
      // sign straight back in with it
      if (!current.token) return setFailure(t('signOutFailed'))
    }
    try {
      await servers.signedOut()
      say({
        title: t('signedOut', { name }),
        body: device === 'tv' ? undefined : t('signedOutBody'),
        next: true,
      })
    } catch {
      setFailure(t('signOutFailed'))
    }
  }
  const run = () =>
    ask({
      title: t('signOutAsk', { name }),
      body: t('signOutBody', { device }),
      cancel: t('cancel'),
      action: t('signOutShort'),
      icon: 'sign-out',
      run: () => void signOut(),
    })
  return { run, pending: out.pending, name, prompt, failure }
}
