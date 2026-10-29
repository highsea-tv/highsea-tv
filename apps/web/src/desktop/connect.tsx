// SPDX-License-Identifier: AGPL-3.0-only
// C1's Choose a server in the desktop app (connectivity.md › Web and mobile; desktop-app.md › The
// local network), from the prototype's client/connect-flow.tsx: the servers this computer has used,
// the servers answering on this network as they appear (discovery.rs: the UDP broadcast and mDNS),
// and an address field. Choosing one connects to it; signing in follows (sign-in.tsx).
//
// macOS 15 asks the person before an app may look on the local network, and until they answer,
// looking fails as it does once they've refused (Apple TN3179). So the first time it's refused,
// the app takes it for the question being asked and keeps looking for a minute; after that, a
// refusal is one, and the page says where to allow it.
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { Button, Field, Icon, Input, Lockup, Mark } from '@highsea-tv/ui-web'
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { type AppServer, type CurrentServer, desktop } from '../host.ts'
import { connect as messages } from '../messages.ts'
import { desktopOs } from './window.tsx'

const ASKED = 'highsea:local-network-asked'
/** How long the first look waits for the person to answer macOS's question. */
const ASKING_FOR = 60_000
const ASK_AGAIN_EVERY = 2_000

type Nearby = { id: string; name: string; address: string }
type LocalNetwork = 'allowed' | 'asking' | 'refused'

const row =
  'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2.5 text-start outline-none transition-tint hover:bg-s2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-60'

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

function asked(): boolean {
  try {
    return localStorage.getItem(ASKED) === '1'
  } catch {
    return true
  }
}

function markAsked() {
  try {
    localStorage.setItem(ASKED, '1')
  } catch {}
}

/** Looks on this network, now and on Look again, with macOS's question in mind. */
function useNearby() {
  const [found, setFound] = useState<Nearby[]>([])
  const [scanning, setScanning] = useState(false)
  const [lan, setLan] = useState<LocalNetwork>('allowed')
  const askingSince = useRef<number | null>(null)
  const alive = useRef(true)

  const look = useCallback(async () => {
    setScanning(true)
    let refused = false
    await desktop
      .discover((f) => {
        if (f.kind === 'refused') refused = true
        else if (f.kind === 'server')
          setFound((list) =>
            list.some((s) => s.id === f.id)
              ? list
              : [...list, { id: f.id, name: f.name, address: f.address }],
          )
      })
      .catch(() => {})
    if (!alive.current) return
    if (!refused) {
      askingSince.current = null
      setLan('allowed')
      setScanning(false)
      return
    }
    if (desktopOs === 'mac' && !asked()) {
      markAsked()
      askingSince.current = Date.now()
    }
    if (askingSince.current !== null && Date.now() - askingSince.current < ASKING_FOR) {
      setLan('asking')
      setTimeout(() => alive.current && void look(), ASK_AGAIN_EVERY)
      return
    }
    askingSince.current = null
    setLan('refused')
    setScanning(false)
  }, [])

  useEffect(() => {
    alive.current = true
    void look()
    return () => {
      alive.current = false
    }
  }, [look])

  return { found, scanning, lan, rescan: () => void look() }
}

/** What went wrong connecting, from the Rust side's reason. */
function useReason() {
  const t = useT(messages)
  return (reason: unknown, address: string) => {
    const r = String(reason)
    if (r === 'unreachable') return t('unreachable', { address })
    if (r === 'not-highsea') return t('notHighsea', { address })
    if (r === 'invalid' || r === 'empty') return t('invalid')
    return t('failed', { message: r })
  }
}

export function Choose({
  servers,
  address: linked,
  onConnected,
}: {
  servers: AppServer[]
  /** An address from a `highsea://connect` link, filled in. */
  address: string | null
  onConnected: (current: CurrentServer) => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const reason = useReason()
  const { found, scanning, lan, rescan } = useNearby()
  const [address, setAddress] = useState(linked ?? '')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const now = Date.now()
  const known = new Set(servers.map((s) => s.id))
  const nearby = found.filter((s) => !known.has(s.id))

  useEffect(() => {
    if (linked) setAddress(linked)
  }, [linked])

  const connected = async () => {
    const current = await desktop.current()
    if (current) onConnected(current)
  }

  const openKnown = async (s: AppServer) => {
    setPending(s.id)
    setRowError(null)
    try {
      onConnected(await desktop.use(s.id))
    } catch (e) {
      setRowError(reason(e, s.name))
    } finally {
      setPending(null)
    }
  }

  const add = async (value: string, key: string) => {
    setPending(key)
    setError(null)
    setRowError(null)
    try {
      await desktop.add(value)
      await connected()
    } catch (e) {
      const message = reason(e, value.trim())
      if (key === 'typed') setError(message)
      else setRowError(message)
    } finally {
      setPending(null)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg p-4 text-text">
      <div className="grid w-full max-w-[28rem] gap-6">
        <Lockup size={20} className="justify-self-center" />
        <section
          aria-labelledby="connect-title"
          className="grid gap-5 rounded-lg border border-line bg-s1 p-3 py-5 shadow-2 medium:p-5"
        >
          <div className="flex items-center gap-2 px-3">
            <h1 id="connect-title" className="text-title">
              {t('title')}
            </h1>
          </div>
          <div className="grid gap-6">
            {rowError && (
              <p
                role="alert"
                className="mx-3 flex items-start gap-2 rounded-sm bg-badge-danger-bg px-3 py-2 text-badge-danger text-caption"
              >
                <Icon name="alert" size={16} className="mt-px shrink-0" />
                {rowError}
              </p>
            )}
            {servers.length > 0 && (
              <section aria-labelledby="your-servers" className="grid gap-1">
                <h2 id="your-servers" className="px-3 font-mono text-label text-text-3 uppercase">
                  {t('yourServers')}
                </h2>
                {servers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={row}
                    disabled={pending !== null}
                    onClick={() => void openKnown(s)}
                  >
                    <Mark size={28} />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold text-text text-ui">{s.name}</span>
                      <span className="truncate text-caption text-text-3">
                        {t('knownLine', {
                          address: hostOf(s.addresses[0]?.url ?? ''),
                          signedIn: String(s.signedIn),
                          when:
                            now - s.lastSeen * 1000 < 60_000
                              ? 'now'
                              : relative(new Date(s.lastSeen * 1000).toISOString(), now, locale),
                        })}
                      </span>
                    </span>
                    {pending === s.id ? (
                      <Icon name="loading" size={16} className="animate-spin text-text-3" />
                    ) : (
                      <Icon name="chevron-right" size={16} className="text-text-3" />
                    )}
                  </button>
                ))}
              </section>
            )}

            <section aria-labelledby="nearby" className="grid gap-1">
              <div className="flex items-center gap-2 px-3">
                <h2 id="nearby" className="font-mono text-label text-text-3 uppercase">
                  {t('nearby')}
                </h2>
                <span
                  role="status"
                  className="ms-auto flex items-center gap-1.5 text-caption text-text-3"
                >
                  {lan === 'refused' ? null : scanning ? (
                    <>
                      <Icon name="loading" size={14} className="animate-spin" />
                      {lan === 'asking' ? t('waitingMac') : t('looking')}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={rescan}
                      className="cursor-pointer underline-offset-2 hover:underline"
                    >
                      {t('lookAgain')}
                    </button>
                  )}
                </span>
              </div>
              {lan === 'allowed' &&
                nearby.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={row}
                    disabled={pending !== null}
                    onClick={() => void add(s.address, s.id)}
                  >
                    <Mark size={28} paint="mono" />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold text-text text-ui">{s.name}</span>
                      <span className="truncate font-mono text-caption text-text-3">
                        {hostOf(s.address)}
                      </span>
                    </span>
                    {pending === s.id ? (
                      <Icon name="loading" size={16} className="animate-spin text-text-3" />
                    ) : (
                      <Icon name="chevron-right" size={16} className="text-text-3" />
                    )}
                  </button>
                ))}
              {lan === 'asking' && (
                <p className="px-3 py-2 text-caption text-text-3">{t('asking')}</p>
              )}
              {lan === 'refused' && (
                <p className="px-3 py-2 text-caption text-text-3">{t('refused')}</p>
              )}
              {lan === 'allowed' && !scanning && nearby.length === 0 && (
                <p className="px-3 py-2 text-caption text-text-3">
                  {found.length > 0 ? t('onlyKnown') : t('none')}
                </p>
              )}
            </section>

            <form
              className="grid gap-3 px-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void add(address, 'typed')
              }}
            >
              <Field label={t('addLabel')} hint={t('addHint')} error={error ?? undefined}>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="harbor.example.net"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  inputMode="url"
                  className="font-mono"
                />
              </Field>
              <Button
                type="submit"
                loading={pending === 'typed'}
                disabled={pending !== null && pending !== 'typed'}
                className="justify-self-start"
              >
                {t('connect')}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
