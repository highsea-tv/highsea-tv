// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's start (docs/product/connectivity.md, desktop-app.md): which server it's
// using. The server in use when the page loaded again, else the one last used that this computer
// is signed in to, else C1's Choose a server. A server that answers at none of its addresses gets
// Unreachable, with Try again and Switch server. Each server gets its own SDK client, made afresh
// when the server changes, so nothing one server answered shows for another.
import { useT } from '@highsea-tv/i18n/react'
import { Button, cn, EmptyState, Skeleton } from '@highsea-tv/ui-web'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { type AppDevice, type AppServer, type CurrentServer, desktop } from '../host.ts'
import { desktop as messages, shell as shellMessages } from '../messages.ts'
import { Choose } from './connect.tsx'
import { WindowFrame } from './window.tsx'

type Phase =
  | { kind: 'starting' }
  | { kind: 'choose' }
  | { kind: 'connected'; current: CurrentServer }
  | { kind: 'unreachable'; server: Pick<AppServer, 'id' | 'name'> }

export type Desktop = {
  current: CurrentServer
  servers: AppServer[]
  device: AppDevice | null
  /** Back to C1, leaving this server. */
  choose: () => void
  /** Another known server: connected to, or Unreachable. */
  switchTo: (id: string) => Promise<void>
  /** This server again, at whichever of its addresses answers now. */
  reconnect: () => Promise<void>
  /** Signed out of this server: its sign-in, with a fresh client. */
  signedOut: () => void
  refresh: () => void
}

const DesktopContext = createContext<Desktop | null>(null)

/** The desktop app's servers, or null in a browser. */
export function useDesktop(): Desktop | null {
  return useContext(DesktopContext)
}

/** The server to start with: the one in use, else the last one signed in to. */
async function start(): Promise<Phase> {
  const current = await desktop.current()
  if (current) return { kind: 'connected', current }
  const servers = await desktop.servers()
  const last = servers.filter((s) => s.signedIn).sort((a, b) => b.lastSeen - a.lastSeen)[0]
  if (!last) return { kind: 'choose' }
  try {
    return { kind: 'connected', current: await desktop.use(last.id) }
  } catch {
    return { kind: 'unreachable', server: last }
  }
}

export function DesktopRoot({ children }: { children: (key: string) => ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'starting' })
  const [servers, setServers] = useState<AppServer[]>([])
  const [device, setDevice] = useState<AppDevice | null>(null)
  // a new client for each server and each sign-in
  const [generation, setGeneration] = useState(0)

  const refresh = useCallback(() => {
    desktop.servers().then(setServers, () => {})
  }, [])

  useEffect(() => {
    start().then(setPhase, () => setPhase({ kind: 'choose' }))
    desktop.device().then(setDevice, () => {})
    refresh()
  }, [refresh])

  const connectTo = useCallback(
    async (id: string, name: string) => {
      try {
        const current = await desktop.use(id)
        setPhase({ kind: 'connected', current })
      } catch {
        setPhase({ kind: 'unreachable', server: { id, name } })
      }
      setGeneration((g) => g + 1)
      refresh()
    },
    [refresh],
  )

  const choose = useCallback(() => {
    void desktop.leave()
    refresh()
    setPhase({ kind: 'choose' })
  }, [refresh])

  // a `highsea://connect?server=` link opens C1 with that address (ADR 0020's 4.4 section)
  const [linked, setLinked] = useState<string | null>(null)
  useEffect(() => {
    const off = desktop.onConnect((server) => {
      setLinked(server)
      choose()
    })
    return () => {
      void off.then((f) => f())
    }
  }, [choose])

  if (phase.kind === 'starting') return <Starting />
  if (phase.kind === 'choose')
    return (
      <>
        <WindowFrame />
        <Choose
          servers={servers}
          address={linked}
          onConnected={(current) => {
            setLinked(null)
            setPhase({ kind: 'connected', current })
            setGeneration((g) => g + 1)
            refresh()
          }}
        />
      </>
    )
  if (phase.kind === 'unreachable')
    return (
      <>
        <WindowFrame />
        <DesktopUnreachable
          name={phase.server.name}
          onRetry={() => connectTo(phase.server.id, phase.server.name)}
          onSwitch={choose}
          className="min-h-screen bg-bg text-text"
        />
      </>
    )

  const current = phase.current
  const value: Desktop = {
    current,
    servers,
    device,
    choose,
    switchTo: (id) => connectTo(id, servers.find((s) => s.id === id)?.name ?? current.name),
    reconnect: async () => {
      const again = await desktop.use(current.id).catch(() => null)
      if (again) setPhase({ kind: 'connected', current: again })
    },
    signedOut: () => {
      refresh()
      setGeneration((g) => g + 1)
    },
    refresh,
  }
  return (
    <DesktopContext.Provider value={value}>
      {children(`${current.id}:${generation}`)}
    </DesktopContext.Provider>
  )
}

function Starting() {
  return (
    <>
      <WindowFrame />
      <div aria-busy className="grid min-h-screen place-items-center bg-bg">
        <Skeleton className="h-8 w-40" />
      </div>
    </>
  )
}

/** No address of the server answered (connectivity.md › Unreachable). */
export function DesktopUnreachable({
  name,
  onRetry,
  onSwitch,
  className,
}: {
  name: string
  onRetry: () => void
  onSwitch: () => void
  className?: string
}) {
  const t = useT(messages)
  const s = useT(shellMessages)
  return (
    <main
      className={cn(
        'mx-auto grid min-h-[70vh] w-full max-w-[1680px] place-items-center px-4 medium:px-8 wide:px-16',
        className,
      )}
    >
      <EmptyState
        icon="network"
        title={s('unreachableTitle', { name })}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon="refresh" onClick={onRetry}>
              {s('tryAgain')}
            </Button>
            <Button onClick={onSwitch}>{t('switchServer')}</Button>
          </div>
        }
      >
        {t('unreachableBody', { name })}
      </EmptyState>
    </main>
  )
}
