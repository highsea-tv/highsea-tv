// SPDX-License-Identifier: AGPL-3.0-only
// Forget this server, at the foot of the desktop app's sign-in and of Unreachable before it (the
// owner, 2026-10-29, as on the phone): a server that's gone, or whose address changed, can be let
// go of without signing in. It asks first; forgetting drops the server's device token from the
// keychain and the server from the list (servers.rs' `forget`), then the app is back at C1.
import { useT } from '@highsea-tv/i18n/react'
import { Button, ConfirmDialog } from '@highsea-tv/ui'
import { desktop as messages } from '../messages.ts'

export function ForgetServer({ name, onForget }: { name: string; onForget: () => void }) {
  const t = useT(messages)
  return (
    <div className="flex justify-center px-4 pt-2 pb-6">
      <ConfirmDialog
        trigger={<Button variant="danger-ghost">{t('forgetThis')}</Button>}
        title={t('forgetConfirm', { name })}
        description={t('forgetDetail')}
        confirmLabel={t('forget', { name })}
        cancelLabel={t('forgetCancel')}
        destructive
        onConfirm={onForget}
      />
    </div>
  )
}
