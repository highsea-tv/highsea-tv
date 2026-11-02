// SPDX-License-Identifier: AGPL-3.0-only
// Who's watching on the web and desktop (prototype-gaps.md › 3.6, the owner's answer 5): Switch
// profile in the account menu opens it, drawn as the TV draws it (tv/who.tsx): the account's
// profiles as large circles, each with its name and a lock when it has a PIN, the one watching now
// marked. Choosing one with a PIN asks for its four digits first, in one field, as the TV's pad
// does with the remote's number keys; five wrong in a row rest it for a minute. The phone switches
// in a sheet of rows instead (mobile/who-sheet.tsx), sharing the PIN step. Profiles are added and
// deleted on the TV for now.
import { Button, cn, Icon, Input } from '@highsea-tv/ui'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { type Profile, toneClass, usePeople } from './profiles.ts'

const TRIES = 5
const REST_MS = 60_000

/** A profile's circle: its initial on its colour. Size and type come from the caller. */
export function ProfileAvatar({ profile, className }: { profile: Profile; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold',
        toneClass[profile.tone],
        className,
      )}
    >
      {profile.name.charAt(0)}
    </span>
  )
}

/** `/who` on the web and desktop: the page on its own, without the app's bars. */
export function WhoPage() {
  const [, navigate] = useLocation()
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-12">
      <WhoIsWatching
        onDone={() => navigate('/', { replace: true })}
        onCancel={() => (history.length > 1 ? history.back() : navigate('/'))}
      />
    </main>
  )
}

/** The profile this app watches as, for the account menu, You and Settings. */
export const useMe = () => usePeople().me

export function WhoIsWatching({
  onDone,
  onCancel,
}: {
  /** After switching: back to Home. */
  onDone: () => void
  onCancel: () => void
}) {
  const { people, me, switchTo } = usePeople()
  const [asking, setAsking] = useState<Profile | null>(null)
  const choose = (p: Profile) => {
    // the one watching now, or anyone without a PIN, needs none
    if (p.pin && p.id !== me.id) return setAsking(p)
    switchTo(p.id)
    onDone()
  }
  if (asking)
    return (
      <PinStep
        profile={asking}
        onBack={() => setAsking(null)}
        onRight={() => {
          switchTo(asking.id)
          onDone()
        }}
      />
    )
  return (
    <div className="grid justify-items-center gap-10 text-center">
      <h1 className="text-display">Who’s watching?</h1>
      <ul aria-label="Profiles" className="flex flex-wrap justify-center gap-8">
        {people.map((p) => {
          const current = p.id === me.id
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-current={current ? 'true' : undefined}
                aria-label={`${p.name}${p.pin ? ', has a PIN' : ''}${current ? ', watching now' : ''}`}
                onClick={() => choose(p)}
                className="group/person grid cursor-pointer justify-items-center gap-2 rounded-lg p-1 outline-none focus-visible:ring-focus"
              >
                <ProfileAvatar
                  profile={p}
                  className={cn(
                    'transition-transform group-hover/person:scale-105 motion-reduce:transition-none',
                    'size-32 text-[56px]',
                    current && 'ring-2 ring-text ring-offset-4 ring-offset-bg',
                  )}
                />
                <span className="flex items-center gap-1.5 font-semibold text-body text-text-2 group-hover/person:text-text">
                  {p.name}
                  {p.pin && <Icon name="lock" size={14} className="text-text-3" />}
                </span>
                {current && <span className="-mt-1.5 text-caption text-text-3">Watching now</span>}
              </button>
            </li>
          )
        })}
      </ul>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

/** Four digits in one field; the fourth checks them. In the phone's sheet, the sheet's title asks. */
export function PinStep({
  profile: p,
  size = 'web',
  onBack,
  onRight,
}: {
  profile: Profile
  size?: 'web' | 'sheet'
  onBack: () => void
  onRight: () => void
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(0)
  const [restUntil, setRestUntil] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  const resting = restUntil > Date.now()
  useEffect(() => field.current?.focus(), [])
  useEffect(() => {
    if (!resting) return
    const t = setTimeout(() => {
      setRestUntil(0)
      setError(null)
      field.current?.focus()
    }, restUntil - Date.now())
    return () => clearTimeout(t)
  }, [resting, restUntil])
  const type = (value: string) => {
    const next = value.replace(/\D/g, '').slice(0, 4)
    setDigits(next)
    setError(null)
    if (next.length < 4) return
    if (next === p.pin) return onRight()
    setDigits('')
    const tries = wrong + 1
    setWrong(tries)
    if (tries >= TRIES) {
      setWrong(0)
      setRestUntil(Date.now() + REST_MS)
      setError('Too many tries. Try again in a minute.')
    } else setError(`That isn’t ${p.name}’s PIN. Try again.`)
  }
  const sheet = size === 'sheet'
  return (
    <div className={cn('grid justify-items-center text-center', sheet ? 'gap-4 pt-2' : 'gap-5')}>
      <ProfileAvatar
        profile={p}
        className={sheet ? 'size-[64px] text-[28px]' : 'size-24 text-[40px]'}
      />
      {!sheet && <h1 className="text-heading">Enter {p.name}’s PIN</h1>}
      <Input
        aria-label={`${p.name}’s PIN, four digits`}
        ref={field}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={digits}
        disabled={resting}
        aria-invalid={error ? true : undefined}
        aria-describedby="pin-error"
        onChange={(e) => type(e.target.value)}
        className="w-44 text-center font-mono tracking-[0.6em]"
      />
      <p id="pin-error" role="alert" className="min-h-6 text-body text-danger">
        {error}
      </p>
      <Button variant="ghost" icon="arrow-left" onClick={onBack}>
        Someone else
      </Button>
    </div>
  )
}
