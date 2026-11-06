// SPDX-License-Identifier: AGPL-3.0-only
// Get the apps (desktop-app.md, checkpoint 4.4a): the library's (packages/ui/src/native/
// get-the-apps.tsx, drawn once there since D3 for the client and the admin's System › Status),
// with this server's name and address, each installer opened in the system browser, and the
// copy's outcome said aloud. A browser offers it, from Profile, Settings › About and the web's
// Downloads; the apps, the desktop app among them, don't.
import { useServer } from '@highsea-tv/client/data'
import { GetTheAppsDialog } from '@highsea-tv/ui'
import { openBrowser } from '../browser.ts'
import { useSay, useServerName } from '../kit.tsx'

/** The address an app adds the server by: its public one, else its first on this network. */
function useAddress() {
  const s = useServer().data
  return s?.addresses.public ?? s?.addresses.local[0] ?? ''
}

/**
 * Get the apps in a dialog for this server: Profile's, Settings › About's and the web's Downloads'.
 * The library's GetTheAppsDialog draws it; this gives it the server and the client's ways to open
 * and say.
 */
export function ServerAppsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const say = useSay()
  const server = useServerName()
  const address = useAddress()
  return (
    <GetTheAppsDialog
      open={open}
      onOpenChange={onOpenChange}
      server={server}
      address={address}
      onOpen={(url) => void openBrowser(url)}
      onSay={(title) => say({ title })}
    />
  )
}
