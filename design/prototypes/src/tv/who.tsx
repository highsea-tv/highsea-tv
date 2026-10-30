// SPDX-License-Identifier: AGPL-3.0-only
// Who's watching, TV (the owner, 2026-10-30): the account's profiles, large, with Add a profile
// at the end. Choosing one watches as it; if it has a PIN it's asked for first, on a number pad
// the D-pad moves over, or with the remote's number keys. The TV opens here when the account has
// more than one profile, and the profile page's row opens a profile's PIN here too (`/who/{id}`).
// Adding a profile asks only for a name and a colour (`/who/new`): it's the account's, so nobody
// signs in.
import { cn, Icon, useSound } from '@highsea-tv/ui-web'
import { useReducedMotion } from 'motion/react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { useBack } from './back.ts'
import { focusFrom, ServerIdentity, TvAvatar, TvButton, tvKey, useInitialFocus } from './kit.tsx'
import { MAX_PROFILES, type Tone, type TvPerson, tones, usePeople } from './people.ts'

/** How many wrong PINs in a row before the pad rests for a minute. */
const TRIES = 5
const REST_MS = 60_000

/**
 * A person as a focus stop: the avatar, which lifts and takes the ring, and the name under it,
 * with a lock when they have a PIN. `size` is the avatar's width in cqw.
 */
export function PersonTile({
  person,
  size,
  current = false,
  initial = false,
  onChoose,
}: {
  person: TvPerson
  size: number
  current?: boolean
  initial?: boolean
  onChoose: () => void
}) {
  return (
    <button
      type="button"
      data-focusable=""
      {...(initial ? { 'data-initial': '' } : {})}
      aria-label={`${person.name}${person.pin ? ', has a PIN' : ''}${current ? ', watching now' : ''}`}
      aria-current={current ? 'true' : undefined}
      onClick={onChoose}
      className="group/person grid justify-items-center gap-[0.8cqw] outline-none"
    >
      <TvAvatar
        person={person}
        style={{ width: `${size}cqw` }}
        className="transition-lift group-focus-visible/person:scale-(--scale-poster) group-focus-visible/person:shadow-(--tv-focus-shadow)"
      />
      <span className="flex items-center gap-[0.4cqw] font-semibold text-(length:--tv-text-meta) text-text-2 transition-lift group-focus-visible/person:text-text">
        {person.name}
        {person.pin && <Icon name="lock" size={20} className="size-[0.95cqw] text-text-3" />}
      </span>
      {current && (
        <span className="-mt-[0.6cqw] text-(length:--tv-text-pill) text-text-3">Watching now</span>
      )}
    </button>
  )
}

/** Adds a profile to the account, until it has as many as it may. */
export function AddTile({ size }: { size: number }) {
  const [, navigate] = useLocation()
  const { people } = usePeople()
  if (people.length >= MAX_PROFILES) return null
  return (
    <button
      type="button"
      data-focusable=""
      aria-label="Add a profile"
      onClick={() => navigate('/who/new')}
      className="group/person grid justify-items-center gap-[0.8cqw] outline-none"
    >
      <span
        style={{ width: `${size}cqw` }}
        className="grid aspect-square place-items-center rounded-full border-[0.2cqw] border-text/25 border-dashed text-text-2 transition-lift group-focus-visible/person:scale-(--scale-poster) group-focus-visible/person:border-transparent group-focus-visible/person:bg-text group-focus-visible/person:text-bg"
      >
        <Icon name="add" size={48} className="size-[40%]" />
      </span>
      <span className="font-semibold text-(length:--tv-text-meta) text-text-2 group-focus-visible/person:text-text">
        Add a profile
      </span>
    </button>
  )
}

/**
 * Four digits on a number pad: the D-pad moves over the keys and OK types one, or the remote's
 * number keys type straight in. The fourth digit submits; `check` answers with an error to show,
 * or null when it's right.
 */
export function PinPad({
  person,
  title,
  hint,
  check,
}: {
  person: TvPerson
  title: string
  hint?: string
  check: (pin: string) => string | null
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [wrong, setWrong] = useState(0)
  const [restUntil, setRestUntil] = useState(0)
  const dots = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  useInitialFocus(true, title, '[data-group="pin"] [data-initial]')

  const resting = restUntil > Date.now()
  useEffect(() => {
    if (!resting) return
    const t = setTimeout(() => {
      setRestUntil(0)
      setError(null)
    }, restUntil - Date.now())
    return () => clearTimeout(t)
  }, [resting, restUntil])

  const type = (d: string) => {
    if (resting || digits.length >= 4) return
    const next = digits + d
    setDigits(next)
    setError(null)
    if (next.length < 4) return
    const problem = check(next)
    if (!problem) return
    // a short shake, then the dots empty for the next try
    if (!reduced)
      dots.current?.animate(
        [0, -0.6, 0.6, -0.4, 0.4, 0].map((x) => ({ translate: `${x}cqw 0` })),
        { duration: 360, easing: 'ease-out' },
      )
    setTimeout(() => setDigits(''), reduced ? 0 : 360)
    const tries = wrong + 1
    setWrong(tries)
    if (tries >= TRIES) {
      setWrong(0)
      setRestUntil(Date.now() + REST_MS)
      setError('Too many tries. Try again in a minute.')
    } else setError(problem)
  }
  const erase = () => setDigits((d) => d.slice(0, -1))

  // the remote's number keys, and Backspace, type without moving focus
  const latest = useRef({ type, erase })
  latest.current = { type, erase }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) latest.current.type(e.key)
      else if (e.key === 'Backspace') latest.current.erase()
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="grid justify-items-center gap-[1.6cqw] text-center">
      <TvAvatar person={person} style={{ width: '5.6cqw' }} />
      <div className="grid gap-[0.5cqw]">
        <h1 className="font-semibold text-[2.4cqw] leading-[1.15]">{title}</h1>
        {hint && <p className="text-(length:--tv-text-meta) text-text-2">{hint}</p>}
      </div>
      <div
        ref={dots}
        role="img"
        aria-label={`${digits.length} of 4 digits`}
        className="flex gap-[1.2cqw]"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'size-[1.2cqw] rounded-full border-[0.15cqw] border-text transition-colors',
              i < digits.length && 'bg-text',
            )}
          />
        ))}
      </div>
      <p role="alert" className="h-[1.5cqw] text-(length:--tv-text-meta) text-danger">
        {error}
      </p>
      <div data-group="pin" className="grid w-[17cqw] grid-cols-3 gap-[0.8cqw]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            data-focusable=""
            {...(d === '5' ? { 'data-initial': '' } : {})}
            onClick={() => type(d)}
            className={cn(tvKey, 'h-[3.6cqw] text-[1.5cqw]', resting && 'opacity-40')}
          >
            {d}
          </button>
        ))}
        <span />
        <button
          type="button"
          data-focusable=""
          onClick={() => type('0')}
          className={cn(tvKey, 'h-[3.6cqw] text-[1.5cqw]', resting && 'opacity-40')}
        >
          0
        </button>
        <button type="button" data-focusable="" onClick={erase} className={cn(tvKey, 'h-[3.6cqw]')}>
          Delete
        </button>
      </div>
    </div>
  )
}

/** Asks for someone's PIN, then watches as them. */
function AskPin({ person, onCancel }: { person: TvPerson; onCancel: () => void }) {
  const { people, switchTo } = usePeople()
  const main = people.find((p) => p.main)
  const [, navigate] = useLocation()
  useBack(onCancel)
  return (
    <main className="grid h-full place-items-center">
      <ServerIdentity className="absolute top-(--tv-safe-y) left-(--tv-safe-x)" />
      <div className="grid justify-items-center gap-[2cqw]">
        <PinPad
          person={person}
          title={`Enter ${person.name}’s PIN`}
          check={(pin) => {
            if (pin !== person.pin) return `That isn’t ${person.name}’s PIN. Try again.`
            switchTo(person.id)
            navigate('/')
            return null
          }}
        />
        <p className="max-w-[40cqw] text-center text-(length:--tv-text-pill) text-text-3">
          Forgot it? Turn it off from {main?.name ?? 'the account'}’s profile, in Settings ›
          Profiles.
        </p>
      </div>
    </main>
  )
}

export function TvWho() {
  const { id } = useParams<{ id?: string }>()
  const { people, me, switchTo } = usePeople()
  const [, navigate] = useLocation()
  const asking = people.find((p) => p.id === id && p.pin && p.id !== me.id)
  // back from a PIN lands on the person it was for
  const [last, setLast] = useState(me.id)
  useInitialFocus(!asking, `${asking?.id}:${last}`, `[data-person="${last}"] [data-focusable]`)
  useBack(() => (history.length > 1 ? history.back() : undefined))

  const choose = (p: TvPerson) => {
    setLast(p.id)
    if (p.pin && p.id !== me.id) navigate(`/who/${p.id}`)
    else {
      switchTo(p.id)
      navigate('/')
    }
  }
  // someone without a PIN, or the one watching now, needs no PIN: straight in
  useEffect(() => {
    if (!id || asking) return
    const p = people.find((x) => x.id === id)
    if (!p) return
    switchTo(p.id)
    navigate('/')
  }, [id, asking, people, switchTo, navigate])

  if (asking)
    return (
      <AskPin
        person={asking}
        onCancel={() => {
          setLast(asking.id)
          navigate('/who')
        }}
      />
    )
  return (
    <main className="grid h-full place-items-center">
      <ServerIdentity className="absolute top-(--tv-safe-y) left-(--tv-safe-x)" />
      <div className="grid justify-items-center gap-[3.6cqw]">
        <h1 className="font-semibold text-[3.2cqw] leading-none tracking-display">
          Who’s watching?
        </h1>
        <ul data-group="people" aria-label="Profiles" className="flex items-start gap-[2.8cqw]">
          {people.map((p) => (
            <li key={p.id} data-person={p.id} className="contents">
              <PersonTile person={p} size={9.5} onChoose={() => choose(p)} />
            </li>
          ))}
          <li className="contents">
            <AddTile size={9.5} />
          </li>
        </ul>
      </div>
    </main>
  )
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const toneNames: Record<Tone, string> = {
  accent: 'Accent',
  info: 'Blue',
  success: 'Green',
  warning: 'Amber',
  danger: 'Red',
}
const NAME_MAX = 20

/**
 * Add a profile: its name, typed on a key grid, and its colour. It's the account's at once, on
 * every device, and the TV watches as it.
 */
export function TvNewProfile() {
  const { people, add } = usePeople()
  const [, navigate] = useLocation()
  const [name, setName] = useState('')
  const [tone, setTone] = useState<Tone>(tones[people.length % tones.length] as Tone)
  useInitialFocus(true, null, '[data-group="keys"] [data-focusable]')
  useBack(() => history.back())
  // Shift, as a phone's keyboard has it: once capitalises the next letter, twice in a row is caps
  // lock, and a third press turns it off. It turns itself on at the start of each word, as names
  // are capitalised, unless caps lock is on.
  const [shift, setShift] = useState<'off' | 'once' | 'lock'>('once')
  const atStart = (n: string) => n === '' || n.endsWith(' ')
  const type = (k: string) => {
    if (name.length >= NAME_MAX) return
    setName(name + (shift === 'off' ? k : k.toUpperCase()))
    if (shift === 'once') setShift('off')
  }
  const space = () => {
    if (!name || atStart(name) || name.length >= NAME_MAX) return
    setName(`${name} `)
    if (shift !== 'lock') setShift('once')
  }
  const del = () => {
    const n = name.slice(0, -1)
    setName(n)
    if (shift !== 'lock') setShift(atStart(n) ? 'once' : 'off')
  }
  // Space is narrower than the row above it, so the navigator, which scores by centres, would
  // take Down from the row's ends to the colours; every key in that row goes to Space instead. On
  // the grid itself, so it runs before the navigator on the TV's root.
  const play = useSound()
  const keys = useRef<HTMLDivElement>(null)
  const spaceKey = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const el = keys.current
    const onKey = (e: KeyboardEvent) => {
      const key = (e.target as HTMLElement).closest('[data-above-space]')
      if (e.key !== 'ArrowDown' || e.defaultPrevented || !key || !spaceKey.current) return
      e.preventDefault()
      focusFrom(key, spaceKey.current, play)
    }
    el?.addEventListener('keydown', onKey)
    return () => el?.removeEventListener('keydown', onKey)
  }, [play])
  const pressShift = () => setShift((s) => (s === 'off' ? 'once' : s === 'once' ? 'lock' : 'off'))
  const preview: TvPerson = { id: 'new', name: name || '?', tone, pin: null, main: false }
  const taken = people.some((p) => p.name.toLowerCase() === name.trim().toLowerCase())
  return (
    <main className="grid h-full grid-cols-[auto_minmax(0,1fr)] items-center gap-[5cqw] px-[8cqw]">
      <ServerIdentity className="absolute top-(--tv-safe-y) left-(--tv-safe-x)" />
      <div className="grid justify-items-center gap-[1.2cqw]">
        <TvAvatar person={preview} style={{ width: '13cqw' }} />
        <p className="h-[2cqw] font-semibold text-[1.6cqw]">{name}</p>
      </div>
      <div className="grid gap-[1.6cqw]">
        <div className="grid gap-[0.5cqw]">
          <h1 className="font-semibold text-[2.6cqw] leading-none tracking-display">
            Add a profile
          </h1>
          <p className="text-(length:--tv-text-meta) text-text-2">
            It keeps its own watch history and Home, on every device signed in to this account.
          </p>
        </div>
        <p
          aria-live="polite"
          className="flex h-[3.4cqw] items-center rounded-[0.5cqw] bg-text/8 px-[1.2cqw] text-(length:--tv-text-button)"
        >
          {name || <span className="text-text-3">Name</span>}
          <span aria-hidden className="ms-[0.1cqw] h-[1.6cqw] w-[0.12cqw] bg-text" />
        </p>
        <div ref={keys} data-group="keys" className="grid grid-cols-10 gap-[0.5cqw]">
          {LETTERS.map((k, i) => (
            <Fragment key={k}>
              {i === 20 && (
                <button
                  type="button"
                  data-focusable=""
                  data-above-space=""
                  aria-label={shift === 'lock' ? 'Caps lock' : 'Shift'}
                  aria-pressed={shift !== 'off'}
                  onClick={pressShift}
                  className={cn(tvKey, 'col-span-2 flex items-center justify-center gap-[0.6cqw]')}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-[0.5cqw] rounded-full',
                      shift === 'off' ? 'bg-current/25' : 'bg-current',
                    )}
                  />
                  {shift === 'lock' ? 'Caps lock' : 'Shift'}
                </button>
              )}
              <button
                type="button"
                data-focusable=""
                {...(i >= 20 ? { 'data-above-space': '' } : {})}
                onClick={() => type(k)}
                className={tvKey}
              >
                {shift === 'off' ? k : k.toUpperCase()}
              </button>
            </Fragment>
          ))}
          <button
            type="button"
            data-focusable=""
            data-above-space=""
            onClick={del}
            className={cn(tvKey, 'col-span-2')}
          >
            Delete
          </button>
          <button
            ref={spaceKey}
            type="button"
            data-focusable=""
            onClick={space}
            className={cn(tvKey, 'col-span-6 col-start-3')}
          >
            Space
          </button>
        </div>
        <div
          role="radiogroup"
          aria-label="Colour"
          data-group="colours"
          className="flex items-center gap-[1cqw]"
        >
          <span className="me-[0.6cqw] text-(length:--tv-text-meta) text-text-2">Colour</span>
          {tones.map((t) => (
            // biome-ignore lint/a11y/useSemanticElements: a D-pad row, focused by the spatial navigator
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={t === tone}
              aria-label={toneNames[t]}
              data-focusable=""
              onClick={() => setTone(t)}
              className="rounded-full outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:shadow-(--tv-focus-shadow)"
            >
              <TvAvatar
                person={{ ...preview, tone: t, name: ' ' }}
                className={cn(
                  'w-[2.6cqw] ring-[0.2cqw] ring-transparent ring-offset-[0.2cqw] ring-offset-bg',
                  t === tone && 'ring-text',
                )}
              />
            </button>
          ))}
        </div>
        {taken && (
          <p role="alert" className="text-(length:--tv-text-meta) text-danger">
            The account already has a profile called {name.trim()}.
          </p>
        )}
        <div data-group="actions" className="flex gap-[1cqw]">
          <TvButton
            primary
            icon="add"
            disabled={!name.trim() || taken}
            onClick={() => {
              add(name.trim(), tone)
              navigate('/')
            }}
          >
            Add profile
          </TvButton>
          <TvButton onClick={() => history.back()}>Cancel</TvButton>
        </div>
      </div>
    </main>
  )
}
