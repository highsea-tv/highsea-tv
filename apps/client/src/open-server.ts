// SPDX-License-Identifier: AGPL-3.0-only
// Opening a server, from Choose a server's rows (known or found nearby) and Settings › Servers. A
// server nobody has set up yet has nobody to sign in: its owner sets it up in a browser first
// (connectivity.md), so it isn't opened, and the words say where. An app that keeps servers opens
// that page in the system browser, as apps/web's desktop app did (apps/web/src/sign-in.tsx); the
// TV, with no browser, only says it. A plain browser is its own server's, and its sign-in sends it
// to setup (./app/sign-in.tsx's useSetupRedirect).
import type { PublicInfo } from '@highsea-tv/api-contract'
import { connectMessages, hostOf } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import { openBrowser } from './browser'
import { useKeepsServers } from './host'
import { mock } from './transport.ts'

export function useOpenServer() {
  const t = useT(connectMessages)
  const servers = useServers()
  const keeps = useKeepsServers()

  /** What to say about a server that isn't set up, opening its setup where there's a browser. */
  const notSetUp = (info: PublicInfo, base: string) => {
    if (keeps && !mock) void openBrowser(`${base}/setup`)
    return t('notSetUp', { name: info.name, address: hostOf(base) })
  }

  /**
   * Opens a server this device knows, once it answers that it's set up; one that doesn't answer
   * opens anyway, and the shell says it's unreachable. Answers what to say instead, or null.
   */
  const openKnown = async (id: string): Promise<string | null> => {
    const base = servers.known.find((k) => k.id === id)?.addresses[0]?.url
    const info = base === undefined ? null : await servers.probe(base).catch(() => null)
    if (info && base !== undefined && !info.setupComplete) return notSetUp(info, base)
    await servers.use(id)
    return null
  }

  return { notSetUp, openKnown }
}
