// SPDX-License-Identifier: AGPL-3.0-only
// Signing in a TV from the phone (connectivity.md#pairing-a-tv-from-the-phone, checkpoint 4.5a):
// the TV shows a code and a QR code; the phone, already signed in, scans it (or takes the code
// typed), asks once, and the TV is in. The words are the server's /link page's, so the two agree.
import { Button, cn, EmptyState, Field, Icon, Input } from '@highsea-tv/ui-web'
import { type FormEvent, useEffect, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { MobileScreen } from '../kit/mobile/device.tsx'
import { gutter } from './shell.tsx'

/** In the prototype, the camera finds the TV's code after this long. */
export const SCAN_MS = 3000

/** The TV waiting with its code (the TV prototype's), as the pairing route would find it. */
const waiting = {
  code: 'KQ7-4PM',
  device: 'Living room TV',
  app: 'highsea for Apple TV',
  address: '192.168.1.42',
}

const normal = (code: string) => code.replace(/[^a-z0-9]/gi, '').toUpperCase()

function Back({ to, label }: { to: string; label: string }) {
  const [, navigate] = useLocation()
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-1 text-[15px] text-accent-text outline-none focus-visible:ring-focus',
        gutter,
      )}
    >
      <Icon name="chevron-left" size={20} />
      {label}
    </button>
  )
}

/** Scan the TV's QR code, or type its code. */
export function MobileLinkScan() {
  const [, navigate] = useLocation()
  const [typing, setTyping] = useState(false)
  const [code, setCode] = useState('')
  useEffect(() => {
    if (typing) return
    const t = setTimeout(() => navigate(`/link/${waiting.code}`), SCAN_MS)
    return () => clearTimeout(t)
  }, [typing, navigate])

  return (
    <MobileScreen>
      <div className="grid gap-4 pt-1 pb-6">
        <Back to="/you/servers" label="Servers" />
        <div className={cn('grid gap-1', gutter)}>
          <h1 className="font-semibold text-[28px] tracking-display">Connect a device</h1>
          <p className="text-[15px] text-text-2">
            {typing
              ? 'Type the code your TV or app shows.'
              : 'Point your camera at the code on the TV.'}
          </p>
        </div>
        {typing ? (
          <form
            className={cn('grid gap-4', gutter)}
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              navigate(`/link/${normal(code)}`)
            }}
          >
            <Field label="Code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoCapitalize="characters"
                autoComplete="one-time-code"
                placeholder="KQ7-4PM"
                className="h-12 font-mono text-[20px] tracking-[0.12em]"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={normal(code).length < 6}>
              Continue
            </Button>
            <Button variant="ghost" icon="scan" onClick={() => setTyping(false)}>
              Scan the code instead
            </Button>
          </form>
        ) : (
          <>
            {/* the camera's picture: iOS draws it; the frame shows where the code goes */}
            <div
              role="img"
              aria-label="The camera, looking for the TV’s code"
              className="relative mx-4 aspect-[3/4] overflow-hidden rounded-lg bg-[radial-gradient(circle_at_40%_35%,#2a2c33,#0b0b0c_70%)]"
            >
              <span className="absolute inset-[18%] rounded-[18px] border-2 border-[#ededee]/85 border-dashed" />
              <p
                role="status"
                className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 text-[#ededee]/80 text-[13px]"
              >
                <Icon name="loading" size={14} className="animate-spin" />
                Looking for a code…
              </p>
            </div>
            <div className={cn('grid', gutter)}>
              <Button variant="ghost" onClick={() => setTyping(true)}>
                Enter the code instead
              </Button>
            </div>
          </>
        )}
      </div>
    </MobileScreen>
  )
}

/** The question, then the TV signed in. */
export function MobileLinkConfirm() {
  const { code } = useParams<{ code: string }>()
  const [, navigate] = useLocation()
  const [state, setState] = useState<'asking' | 'signing' | 'done'>('asking')
  const found = normal(code ?? '') === normal(waiting.code)

  if (!found)
    return (
      <MobileScreen>
        <div className="grid gap-4 pt-1">
          <Back to="/link" label="Connect a device" />
          <div className={cn('py-8', gutter)}>
            <EmptyState
              icon="tv"
              tone="error"
              title="That code isn’t waiting"
              action={
                <Button variant="primary" onClick={() => navigate('/link')}>
                  Try again
                </Button>
              }
            >
              Check it on the TV, or start again there for a new one.
            </EmptyState>
          </div>
        </div>
      </MobileScreen>
    )

  if (state === 'done')
    return (
      <MobileScreen>
        <div className={cn('grid min-h-full content-center gap-6 py-10', gutter)}>
          <EmptyState icon="success" title={`${waiting.device} is signed in`}>
            It opens Home on the TV now. Sign it out from You › Devices whenever you like.
          </EmptyState>
          <Button variant="primary" onClick={() => navigate('/you/servers')}>
            Done
          </Button>
        </div>
      </MobileScreen>
    )

  return (
    <MobileScreen>
      <div className="grid gap-4 pt-1 pb-6">
        <Back to="/link" label="Connect a device" />
        <div className={cn('grid gap-5', gutter)}>
          <div className="grid justify-items-start gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent-text">
              <Icon name="tv" size={28} />
            </span>
            <h1 className="font-semibold text-[28px] tracking-display">
              Sign in {waiting.device}?
            </h1>
            <p className="text-[15px] text-text-2">
              {waiting.app} at <span className="font-mono">{waiting.address}</span> signs in as you.
              It stays signed in until you sign it out from You › Devices.
            </p>
            <p className="text-[13px] text-text-3">
              Code <span className="font-mono">{waiting.code}</span> · it expires in 10 minutes.
            </p>
          </div>
          <div className="grid gap-2">
            <Button
              variant="primary"
              loading={state === 'signing'}
              onClick={() => {
                setState('signing')
                setTimeout(() => setState('done'), 800)
              }}
            >
              Sign it in
            </Button>
            <Button variant="ghost" onClick={() => navigate('/you/servers')}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </MobileScreen>
  )
}
