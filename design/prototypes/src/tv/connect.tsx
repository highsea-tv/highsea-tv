// SPDX-License-Identifier: AGPL-3.0-only
// C1 Connect, TV (docs/product/connectivity.md#tv). Typing on a remote is slow, so the TV signs
// in by code first: it shows a short code and a QR code; a phone or computer that's signed in
// opens the link and approves, and the TV is in. Entering a password with the on-screen keyboard
// is the fallback, and another server can be picked from the ones answering on this network.
import { cn, Icon, Mark } from '@highsea/ui-web'
import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useDiscovery, useSignIn } from '../client/connect.ts'
import { useQuery } from '../mock/hooks.tsx'
import { useBack } from './back.ts'
import { TvButton, useInitialFocus } from './kit.tsx'

/** In the prototype, the phone's approval arrives after this long. */
export const APPROVAL_MS = 8000

/** A QR code's look, drawn from the code (the prototype doesn't encode a real one). */
function Qr({ seed }: { seed: string }) {
  const cells = useMemo(() => {
    let h = 2166136261
    for (const c of seed) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619)
    const n = 25
    const out: boolean[] = []
    // xorshift: an even scatter, like real modules
    let x = h >>> 0 || 1
    for (let i = 0; i < n * n; i++) {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      out.push((x >>> 0) % 100 < 45)
    }
    return { n, out }
  }, [seed])
  const finder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= cells.n - 7 && y < 7) || (x < 7 && y >= cells.n - 7)
  const ring = (x: number, y: number) => {
    const fx = x < 7 ? x : x - (cells.n - 7)
    const fy = y < 7 ? y : y - (cells.n - 7)
    return (
      fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4)
    )
  }
  return (
    <svg
      role="img"
      aria-label="QR code for the sign-in link"
      viewBox={`-2 -2 ${cells.n + 4} ${cells.n + 4}`}
      className="size-full rounded-[0.6cqw] bg-[#ededee]"
    >
      {cells.out.map((on, i) => {
        const x = i % cells.n
        const y = Math.floor(i / cells.n)
        const dark = finder(x, y) ? ring(x, y) : on
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed grid
        return dark ? <rect key={i} x={x} y={y} width={1} height={1} fill="#0b0b0c" /> : null
      })}
    </svg>
  )
}

const KEYS = 'abcdefghijklmnopqrstuvwxyz0123456789.-_@'.split('')

/** The fallback: a field per line, and a key grid the D-pad moves over. */
function Keyboard({
  onDone,
  onCancel,
  pending,
  error,
}: {
  onDone: (u: string, p: string) => void
  onCancel: () => void
  pending: boolean
  error: string | null
}) {
  const [field, setField] = useState<'username' | 'password'>('username')
  const [values, setValues] = useState({ username: '', password: '' })
  useInitialFocus(true, field, '[data-group="keys"] [data-focusable]')
  const type = (k: string) => setValues((v) => ({ ...v, [field]: v[field] + k }))
  const del = () => setValues((v) => ({ ...v, [field]: v[field].slice(0, -1) }))
  const key =
    'grid h-[3cqw] place-items-center rounded-[0.4cqw] bg-text/10 font-semibold text-(length:--tv-text-button) outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg'
  return (
    <div className="grid w-[56cqw] gap-[1.4cqw]">
      <div className="grid grid-cols-2 gap-[1cqw]">
        {(['username', 'password'] as const).map((f) => (
          <div
            key={f}
            className={cn(
              'grid gap-[0.3cqw] rounded-[0.5cqw] border-[0.15cqw] px-[1cqw] py-[0.6cqw]',
              field === f ? 'border-text' : 'border-line',
            )}
          >
            <span className="text-(length:--tv-text-pill) text-text-3">
              {f === 'username' ? 'Username' : 'Password'}
            </span>
            <span className="h-[1.6cqw] font-mono text-(length:--tv-text-button)">
              {f === 'password' ? '•'.repeat(values.password.length) : values.username}
              {field === f && <span className="animate-pulse">|</span>}
            </span>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-(length:--tv-text-pill) text-badge-danger">
          {error}
        </p>
      )}
      <div data-group="keys" className="grid grid-cols-10 gap-[0.5cqw]">
        {KEYS.map((k) => (
          <button key={k} type="button" data-focusable="" onClick={() => type(k)} className={key}>
            {k}
          </button>
        ))}
      </div>
      <div data-group="key-actions" className="flex gap-[1cqw]">
        <TvButton icon="arrow-left" onClick={del}>
          Delete
        </TvButton>
        {field === 'username' ? (
          <TvButton primary onClick={() => setField('password')}>
            Next
          </TvButton>
        ) : (
          <TvButton primary onClick={() => onDone(values.username, values.password)}>
            {pending ? 'Signing in…' : 'Sign in'}
          </TvButton>
        )}
        <TvButton onClick={onCancel}>Use a code instead</TvButton>
      </div>
    </div>
  )
}

export function TvConnect() {
  const [, navigate] = useLocation()
  const pairing = useQuery('client:pairing', (c) => c.connect.startPairing())
  const flow = useSignIn(() => navigate('/'))
  const { servers, scanning } = useDiscovery()
  const [mode, setMode] = useState<'code' | 'password' | 'servers'>('code')
  const [approved, setApproved] = useState(false)
  useInitialFocus(pairing.status === 'success' && mode !== 'password', mode)
  useBack(() => (mode === 'code' ? navigate('/') : setMode('code')))

  // the phone approves after a few seconds (prototype); then the TV is signed in
  useEffect(() => {
    if (mode !== 'code' || pairing.status !== 'success') return
    const t = setTimeout(() => setApproved(true), APPROVAL_MS)
    return () => clearTimeout(t)
  }, [mode, pairing.status])
  useEffect(() => {
    if (!approved) return
    const t = setTimeout(() => navigate('/'), 1200)
    return () => clearTimeout(t)
  }, [approved, navigate])

  const server = flow.state.step === 'sign-in' ? flow.state.server : null
  return (
    <main className="grid h-full grid-cols-[1fr_auto] items-center gap-[4cqw] px-(--tv-safe-x) py-(--tv-safe-y)">
      <div className="grid content-center gap-[1.6cqw]">
        <div className="flex items-center gap-[0.8cqw]">
          <Mark size={32} className="size-[2.4cqw]" />
          <span className="font-semibold text-(length:--tv-text-server-name)">
            {server?.name ?? 'Harbor'}
          </span>
        </div>
        {mode === 'code' && (
          <>
            <h1 className="font-semibold text-[3.6cqw] leading-[1] tracking-display">
              Sign in with your phone
            </h1>
            <ol className="grid gap-[0.8cqw] text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">
              <li>
                1. On your phone or computer, go to{' '}
                <span className="font-mono text-text">{pairing.data?.url ?? '…'}</span>, or scan the
                code.
              </li>
              <li>
                2. Enter{' '}
                <span className="font-mono font-semibold text-text tracking-[0.15em]">
                  {pairing.data?.code ?? '…'}
                </span>{' '}
                and approve this TV.
              </li>
            </ol>
            <p
              role="status"
              className="flex items-center gap-[0.6cqw] text-(length:--tv-text-meta) text-text-2"
            >
              {approved ? (
                <>
                  <Icon name="success" size={24} className="size-[1.2cqw] text-badge-success" />
                  Approved. Signing in…
                </>
              ) : (
                <>
                  <Icon name="loading" size={24} className="size-[1.2cqw] animate-spin" />
                  Waiting for approval. The code works for 10 minutes.
                </>
              )}
            </p>
            <div data-group="code-actions" className="flex gap-[1cqw]">
              <TvButton initial icon="lock" onClick={() => setMode('password')}>
                Use a password
              </TvButton>
              <TvButton icon="server" onClick={() => setMode('servers')}>
                Another server
              </TvButton>
            </div>
          </>
        )}
        {mode === 'password' && (
          <>
            <h1 className="font-semibold text-[3cqw] leading-[1] tracking-display">
              Sign in to {server?.name ?? 'Harbor'}
            </h1>
            <Keyboard
              pending={flow.signIn.pending}
              error={flow.signIn.error?.message ?? null}
              onCancel={() => setMode('code')}
              onDone={async (u, p) => {
                try {
                  if (flow.state.step === 'choose') await flow.choose('192.168.1.20:3000')
                  await flow.submit(u, p)
                } catch {
                  // the error shows above the keys
                }
              }}
            />
          </>
        )}
        {mode === 'servers' && (
          <>
            <h1 className="font-semibold text-[3cqw] leading-[1] tracking-display">
              Servers on this network
            </h1>
            <ul data-group="servers" className="grid w-[44cqw] gap-[0.6cqw]">
              {servers.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    data-focusable=""
                    {...(i === 0 ? { 'data-initial': '' } : {})}
                    onClick={() => {
                      flow.choose(s.address).catch(() => {})
                      setMode('code')
                    }}
                    className="flex w-full items-center gap-[1cqw] rounded-[0.6cqw] bg-text/8 px-[1.2cqw] py-[0.8cqw] text-start outline-none transition-lift focus-visible:scale-[1.03] focus-visible:shadow-(--tv-focus-shadow)"
                  >
                    <Mark size={32} paint="mono" className="size-[2cqw]" />
                    <span className="grid">
                      <span className="font-semibold text-(length:--tv-text-button)">{s.name}</span>
                      <span className="text-(length:--tv-text-pill) text-text-2">
                        {s.owner}’s server · {s.address}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              <li
                role="status"
                className="flex items-center gap-[0.6cqw] px-[1.2cqw] text-(length:--tv-text-pill) text-text-3"
              >
                {scanning && <Icon name="loading" size={20} className="size-[1cqw] animate-spin" />}
                {scanning
                  ? 'Looking…'
                  : `${servers.length} answered. Add one by address from the highsea app on your phone.`}
              </li>
            </ul>
          </>
        )}
      </div>
      {mode === 'code' && (
        <div className="grid w-[22cqw] gap-[1cqw] justify-self-end">
          <div className="aspect-square w-full">
            {pairing.data && <Qr seed={pairing.data.code} />}
          </div>
          <p className="text-center text-(length:--tv-text-pill) text-text-3">
            Scan with your phone’s camera
          </p>
        </div>
      )}
    </main>
  )
}
