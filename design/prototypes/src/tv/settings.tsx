// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings, TV (docs/product/client-settings.md#tv), on the person's profile: the avatar at
// the head's right opens it, since Settings isn't one of the TV's destinations (the owner,
// 2026-10-30). The account's profiles lead, so switching is a press or two away (who.tsx asks for
// a PIN); Settings follows, the sections down the left and the chosen one on the right, with the
// profile's PIN and the account's Profiles, and Playback (the person's languages, what plays next
// and the quality, as on the other apps). Focus moving down the list
// shows each section (as tvOS does); Right enters it, Left returns to the list. Theme and sound
// apply to this TV; the home layout follows the person.
import { relative } from '@highsea-tv/core/format'
import { cn, type IconName, Mark } from '@highsea-tv/ui-web'
import { type ReactNode, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useConnection, useKnownServers, useServer } from '../client/data.ts'
import {
  audioLanguages,
  type PlaybackSettings,
  qualityCaps,
  subtitleLanguages,
  useDevicePrefs,
  usePlaybackSettings,
  useThemeEverywhere,
} from '../client/prefs.tsx'
import { MAX_PROFILES, type Profile, usePeople } from '../client/profiles.ts'
import {
  APP_VERSION,
  type SettingsSectionId,
  settingsSections,
  useHomeLayout,
  useMyDevices,
  useThemeChoices,
} from '../client/settings.ts'
import { CustomThemeStyles } from '../client/settings-sections.tsx'
import { useNow } from '../mock/hooks.tsx'
import { useProto } from '../screen/screen.tsx'
import { useBack } from './back.ts'
import { TvAvatar, TvButton, TvHead, useInitialFocus } from './kit.tsx'
import { AddTile, PersonTile, PinPad } from './who.tsx'

const option =
  'flex w-full items-center gap-[1cqw] rounded-[0.5cqw] px-[1.2cqw] py-[0.8cqw] text-start text-(length:--tv-text-button) text-text-2 outline-none transition-lift focus-visible:scale-[1.03] focus-visible:bg-text focus-visible:text-bg not-focus-visible:aria-checked:text-text'

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[1.3cqw] shrink-0 place-items-center rounded-full border-[0.15cqw] border-current',
        on && 'bg-current',
      )}
    />
  )
}

function Theme() {
  const [prefs, set] = useDevicePrefs('tv')
  const [everywhere, setEverywhere] = useThemeEverywhere()
  const choices = useThemeChoices()
  const choose = (theme: string) => (everywhere === null ? set({ theme }) : setEverywhere(theme))
  return (
    <div className="grid gap-[1.2cqw]">
      <CustomThemeStyles />
      <div role="radiogroup" aria-label="Theme" className="grid gap-[0.4cqw]">
        {choices.map((t) => (
          // biome-ignore lint/a11y/useSemanticElements: a D-pad row, focused by the spatial navigator
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={prefs.theme === t.id}
            data-focusable=""
            onClick={() => choose(t.id)}
            className={option}
          >
            <Check on={prefs.theme === t.id} />
            <span className="flex-1">{t.name}</span>
            <span className="text-(length:--tv-text-pill) opacity-70">{t.detail}</span>
            {t.id !== 'server' && (
              <span aria-hidden className="flex gap-[0.4cqw]" data-theme={t.id}>
                {(['bg', 's2', 'accent'] as const).map((r) => (
                  <span
                    key={r}
                    className="size-[1.1cqw] rounded-full ring-[0.08cqw] ring-line-strong"
                    style={{ background: `var(--color-${r})` }}
                  />
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="grid justify-items-start gap-[0.6cqw]">
        <TvButton
          primary={everywhere !== null}
          onClick={() => setEverywhere(everywhere === null ? prefs.theme : null)}
        >
          Use on all my devices: {everywhere === null ? 'Off' : 'On'}
        </TvButton>
        <p className="text-(length:--tv-text-meta) text-text-3">
          {everywhere === null
            ? 'Only this TV changes.'
            : 'Your phone and computers use this theme too.'}
        </p>
      </div>
    </div>
  )
}

function Sounds() {
  const [prefs, set] = useDevicePrefs('tv')
  const proto = useProto()
  const on = prefs.sound ?? proto.sound.tv
  return (
    <div className="grid gap-[1.2cqw]">
      <div className="flex gap-[1cqw]">
        <TvButton primary={on} onClick={() => set({ sound: !on })}>
          Interface sounds: {on ? 'On' : 'Off'}
        </TvButton>
      </div>
      <div className="grid gap-[0.6cqw]">
        <p className="text-(length:--tv-text-meta) text-text-2">
          Volume {Math.round(prefs.volume * 100)}%
        </p>
        <div className="flex gap-[1cqw]">
          <TvButton onClick={() => set({ volume: Math.max(0, prefs.volume - 0.1) })}>
            Quieter
          </TvButton>
          <TvButton onClick={() => set({ volume: Math.min(1, prefs.volume + 0.1) })}>
            Louder
          </TvButton>
        </div>
      </div>
    </div>
  )
}

const pill =
  'rounded-full px-[1.1cqw] py-[0.45cqw] font-semibold text-(length:--tv-text-pill) text-text-2 outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg focus-visible:shadow-(--tv-focus-shadow) not-focus-visible:aria-checked:bg-text/12 not-focus-visible:aria-checked:text-text'

/** One setting as a row of choices, as the show page's seasons are: Left and Right move along. */
function Choices({
  name,
  label,
  options,
  value,
  onPick,
}: {
  name: string
  label: string
  options: { value: string; label: string; short?: string }[]
  value: string
  onPick: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-[11cqw_minmax(0,1fr)] items-center gap-[1cqw]">
      <span className="text-(length:--tv-text-meta) text-text-2">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        data-group={`playback-${name}`}
        className="flex flex-wrap gap-[0.4cqw]"
      >
        {options.map((o) => (
          // biome-ignore lint/a11y/useSemanticElements: a D-pad row, focused by the spatial navigator
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            data-focusable=""
            onClick={() => onPick(o.value)}
            className={pill}
          >
            {o.short ?? o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Playback, as on the other apps: the choices follow the person to every device. */
function Playback() {
  const [p, set] = usePlaybackSettings()
  const toggle = (key: keyof PlaybackSettings, label: string, on: boolean) => (
    <TvButton primary={on} aria-pressed={on} onClick={() => set({ [key]: !on })}>
      {label}: {on ? 'On' : 'Off'}
    </TvButton>
  )
  return (
    <div className="grid gap-[0.9cqw]">
      <Choices
        name="audio"
        label="Audio"
        options={audioLanguages.map((x) => ({
          ...x,
          short: x.value === 'original' ? 'Original' : undefined,
        }))}
        value={p.audio}
        onPick={(audio) => set({ audio })}
      />
      <Choices
        name="subtitles"
        label="Subtitles"
        options={subtitleLanguages}
        value={p.subtitles}
        onPick={(subtitles) => set({ subtitles })}
      />
      <div data-group="playback-toggles" className="flex flex-wrap gap-[0.8cqw] ps-[12cqw]">
        {p.subtitles !== 'off' &&
          toggle('onlyForeign', 'Only when the audio isn’t in my language', p.onlyForeign)}
      </div>
      <div className="grid grid-cols-[11cqw_minmax(0,1fr)] items-center gap-[1cqw]">
        <span className="text-(length:--tv-text-meta) text-text-2">Episodes</span>
        <div data-group="playback-next" className="flex flex-wrap gap-[0.8cqw]">
          {toggle('autoplayNext', 'Play the next one automatically', p.autoplayNext)}
          {toggle('skipIntros', 'Skip intros', p.skipIntros)}
        </div>
      </div>
      <Choices
        name="home"
        label="At home"
        options={qualityCaps}
        value={p.qualityHome}
        onPick={(qualityHome) => set({ qualityHome })}
      />
      <Choices
        name="away"
        label="Away"
        options={qualityCaps}
        value={p.qualityAway}
        onPick={(qualityAway) => set({ qualityAway })}
      />
    </div>
  )
}

function Home() {
  const home = useHomeLayout()
  return (
    <div className="grid gap-[0.8cqw]">
      <p className="text-(length:--tv-text-meta) text-text-2">
        OK shows or hides a row. Up and Down on Move change its place. It follows you to every
        device.
      </p>
      <ol className="grid gap-[0.4cqw]">
        {home.rows.map((r, i) => {
          const shown = !home.hidden.includes(r.id)
          return (
            <li
              key={r.id}
              data-group={`row-${r.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-[0.6cqw]"
            >
              <button
                type="button"
                data-focusable=""
                aria-pressed={shown}
                onClick={() => home.toggle(r.id, !shown)}
                className={option}
              >
                <Check on={shown} />
                <span className="flex-1">{r.title}</span>
                <span className="text-(length:--tv-text-pill) opacity-70">
                  {shown ? 'Shown' : 'Hidden'}
                </span>
              </button>
              <TvButton
                aria-label={`Move ${r.title} up`}
                disabled={i === 0}
                onClick={() => home.move(r.id, -1)}
              >
                Up
              </TvButton>
              <TvButton
                aria-label={`Move ${r.title} down`}
                disabled={i === home.rows.length - 1}
                onClick={() => home.move(r.id, 1)}
              >
                Down
              </TvButton>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Devices({ ask }: SectionProps) {
  const { devices, revoke } = useMyDevices()
  return (
    <ul className="grid gap-[0.4cqw]">
      {(devices.data ?? []).map((d) => (
        <li key={d.id} className="flex items-center gap-[1cqw]">
          <span className="flex-1 text-(length:--tv-text-button)">
            {d.name}
            {d.client === 'tvos' && <span className="text-text-3"> · this TV</span>}
          </span>
          {d.client !== 'tvos' && d.client !== 'admin' && (
            // asks first, as the other apps do: it needs a code or password to come back
            <TvButton
              aria-label={`Sign out ${d.name}`}
              onClick={() =>
                ask({
                  title: `Sign out ${d.name}?`,
                  body: 'It needs a code or password to come back.',
                  icon: 'sign-out',
                  label: 'Sign out',
                  run: () => void revoke(d.id),
                })
              }
            >
              Sign out
            </TvButton>
          )}
        </li>
      ))}
    </ul>
  )
}

function About() {
  const server = useServer()
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-[2cqw] gap-y-[0.6cqw] text-(length:--tv-text-synopsis)">
      <dt className="text-text-3">This app</dt>
      <dd>highsea {APP_VERSION}</dd>
      <dt className="text-text-3">Server</dt>
      <dd>
        {server.data?.name ?? 'this server'} {server.data?.version}
      </dd>
      <dt className="text-text-3">Licence</dt>
      <dd>AGPL-3.0, free software</dd>
    </dl>
  )
}

/**
 * Every server this TV has signed in to, the one in use marked, as the other apps list them; another
 * server is picked on the sign-in screen. Signing out asks first, then goes there.
 */
function Servers({ ask }: SectionProps) {
  const server = useServer()
  const known = useKnownServers()
  const connection = useConnection()
  const now = useNow()
  const { people } = usePeople()
  const main = people.find((p) => p.main)
  const name = server.data?.name ?? 'this server'
  const [, navigate] = useLocation()
  return (
    <div className="grid gap-[1.2cqw]">
      <ul aria-label="Servers" className="grid max-w-[44cqw] gap-[0.6cqw]">
        {(known.data ?? []).map((k) => {
          const current = k.id === server.data?.id
          return (
            <li key={k.id} className="flex min-h-[3cqw] items-center gap-[1cqw]">
              <Mark size={32} className="size-[2cqw] shrink-0" />
              <span className="grid flex-1">
                <span className="text-(length:--tv-text-button)">
                  {k.name}
                  {current && <span className="text-text-3"> · in use</span>}
                </span>
                <span className="text-(length:--tv-text-pill) text-text-3">
                  {current
                    ? connection === 'remote'
                      ? `Connected remotely · ${k.addresses.remote}`
                      : `On this network · ${k.addresses.local}`
                    : `${k.signedIn ? 'Signed in' : 'Signed out'} · last used ${relative(k.lastSeen, now)}`}
                </span>
              </span>
              {!current && (
                <TvButton
                  aria-label={`${k.signedIn ? 'Switch to' : 'Sign in to'} ${k.name}`}
                  onClick={() => navigate('/connect')}
                >
                  {k.signedIn ? 'Switch' : 'Sign in'}
                </TvButton>
              )}
            </li>
          )
        })}
      </ul>
      <p className="max-w-[44cqw] text-(length:--tv-text-meta) text-text-3">
        Signed in to {name} as {main?.name ?? 'Ines'}. Signing out signs out every profile on this
        TV.
      </p>
      <div className="flex gap-[1cqw]">
        <TvButton icon="server" onClick={() => navigate('/connect')}>
          Another server
        </TvButton>
        <TvButton
          icon="sign-out"
          onClick={() =>
            ask({
              title: `Sign out of ${name}?`,
              body: 'Every profile on this TV signs out. You can sign in again with a code.',
              icon: 'sign-out',
              label: 'Sign out',
              // the sign-in screen in Settings' place, so Back doesn't return to a server signed out of
              run: () => navigate('/connect', { replace: true }),
            })
          }
        >
          Sign out of {name}
        </TvButton>
      </div>
    </div>
  )
}

type PinFlow = 'set' | 'change' | 'off'

function Pin({ openPin }: SectionProps) {
  const { me } = usePeople()
  return (
    <div className="grid gap-[1.2cqw]">
      <p className="text-(length:--tv-text-synopsis) text-text-2">
        {me.pin
          ? `On. Every device asks for it before watching as ${me.name}.`
          : `Off. Anyone using this account can watch as ${me.name}.`}
      </p>
      <div className="flex gap-[1cqw]">
        {me.pin ? (
          <>
            <TvButton onClick={() => openPin('change')}>Change PIN</TvButton>
            <TvButton onClick={() => openPin('off')}>Turn off PIN</TvButton>
          </>
        ) : (
          <TvButton icon="lock" onClick={() => openPin('set')}>
            Set a PIN
          </TvButton>
        )}
      </div>
    </div>
  )
}

function Profiles({ askDelete }: SectionProps) {
  const { people, me, askOnLaunch, setAskOnLaunch } = usePeople()
  const [, navigate] = useLocation()
  return (
    <div className="grid gap-[1.2cqw]">
      <ul className="grid max-w-[44cqw] gap-[0.6cqw]">
        {people.map((p) => (
          <li key={p.id} className="flex h-[3cqw] items-center gap-[1cqw]">
            <TvAvatar person={p} className="w-[2.4cqw]" />
            <span className="flex-1 text-(length:--tv-text-button)">
              {p.name}
              <span className="text-text-3">
                {p.main ? ' · the account’s own' : ''}
                {p.id === me.id ? ' · watching now' : ''}
                {p.pin ? ' · PIN' : ''}
              </span>
            </span>
            {!p.main && (
              <TvButton aria-label={`Delete ${p.name}’s profile`} onClick={() => askDelete(p)}>
                Delete
              </TvButton>
            )}
          </li>
        ))}
      </ul>
      <div className="grid justify-items-start gap-[0.6cqw]">
        <TvButton primary={askOnLaunch} onClick={() => setAskOnLaunch(!askOnLaunch)}>
          Ask who’s watching when highsea opens: {askOnLaunch ? 'On' : 'Off'}
        </TvButton>
        <p className="text-(length:--tv-text-meta) text-text-3">
          {askOnLaunch
            ? 'Only this TV. With one profile, it opens straight in.'
            : 'Only this TV. It opens as whoever watched last, asking for their PIN if they have one.'}
        </p>
      </div>
      {people.length < MAX_PROFILES ? (
        <div className="flex">
          <TvButton icon="add" onClick={() => navigate('/who/new')}>
            Add a profile
          </TvButton>
        </div>
      ) : (
        <p className="text-(length:--tv-text-meta) text-text-3">
          An account has up to {MAX_PROFILES} profiles.
        </p>
      )}
    </div>
  )
}

/** A question before something that can't be taken back: signing out, a device or this TV. */
type Ask = { title: string; body: string; icon: IconName; label: string; run: () => void }

type SectionProps = {
  openPin: (flow: PinFlow) => void
  askDelete: (p: Profile) => void
  ask: (q: Ask) => void
}
type TvSectionId = SettingsSectionId | 'pin' | 'people'

const bodies: Record<TvSectionId, (props: SectionProps) => React.JSX.Element> = {
  appearance: Theme,
  sounds: Sounds,
  playback: Playback,
  home: Home,
  pin: Pin,
  people: Profiles,
  servers: Servers,
  devices: Devices,
  about: About,
}

const shared = (id: SettingsSectionId) =>
  settingsSections.find((s) => s.id === id) as {
    id: TvSectionId
    label: string
    hint: string
  }

/** The shared sections, with the profile's PIN and the account's Profiles after Home screen. */
const sections: { id: TvSectionId; label: string; hint: string }[] = [
  shared('appearance'),
  shared('sounds'),
  shared('playback'),
  shared('home'),
  { id: 'pin', label: 'PIN', hint: 'Asked for before anyone watches as this profile.' },
  { id: 'people', label: 'Profiles', hint: 'Each with its own watch history, on every device.' },
  shared('servers'),
  shared('devices'),
  shared('about'),
]

/** Setting, changing or turning off the PIN: the current one first, then the new one twice. */
function PinSteps({ flow, onClose }: { flow: PinFlow; onClose: () => void }) {
  const { me, setPin } = usePeople()
  const [step, setStep] = useState<'current' | 'choose' | 'confirm'>(
    flow === 'set' ? 'choose' : 'current',
  )
  const [chosen, setChosen] = useState('')
  const [again, setAgain] = useState(false)
  useBack(onClose)
  const pad = {
    current: {
      title: 'Enter your PIN',
      hint: undefined,
      check: (pin: string) => {
        if (pin !== me.pin) return 'That isn’t your PIN. Try again.'
        if (flow === 'off') {
          setPin(null)
          onClose()
        } else setStep('choose')
        return null
      },
    },
    choose: {
      title: again ? 'Choose a PIN again' : 'Choose a PIN',
      hint: again
        ? 'Those didn’t match.'
        : `Four digits. Every device asks for it before watching as ${me.name}.`,
      check: (pin: string) => {
        setChosen(pin)
        setStep('confirm')
        return null
      },
    },
    confirm: {
      title: 'Enter it again',
      hint: undefined,
      check: (pin: string) => {
        if (pin === chosen) {
          setPin(pin)
          onClose()
        } else {
          setAgain(true)
          setStep('choose')
        }
        return null
      },
    },
  }[step]
  return (
    <div
      data-isolate=""
      role="dialog"
      aria-label={pad.title}
      className="absolute inset-0 z-20 grid place-items-center bg-bg"
    >
      <PinPad key={`${step}:${again}`} person={me} {...pad} />
    </div>
  )
}

/** A question over the page: Cancel first, so OK by accident changes nothing. Back cancels. */
function Confirm({
  title,
  body,
  art,
  action,
  onClose,
}: {
  title: string
  body: string
  art?: ReactNode
  action: ReactNode
  onClose: () => void
}) {
  useBack(onClose)
  useInitialFocus(true, title, '[data-confirm] [data-initial]')
  return (
    <div
      data-isolate=""
      data-confirm=""
      role="dialog"
      aria-label={title}
      className="absolute inset-0 z-20 grid place-items-center bg-bg/80"
    >
      <div className="grid max-w-[40cqw] justify-items-center gap-[1.4cqw] rounded-[1cqw] bg-s1 p-[2.4cqw] text-center">
        {art}
        <h1 className="font-semibold text-[2.2cqw] leading-[1.15]">{title}</h1>
        <p className="text-(length:--tv-text-synopsis) text-text-2 leading-[1.45]">{body}</p>
        <div data-group="confirm" className="flex gap-[1cqw]">
          <TvButton initial onClick={onClose}>
            Cancel
          </TvButton>
          {action}
        </div>
      </div>
    </div>
  )
}

/** Deleting a profile asks first: its watch history goes with it, everywhere. */
function ConfirmDelete({ person, onClose }: { person: Profile; onClose: () => void }) {
  const { remove } = usePeople()
  return (
    <Confirm
      title={`Delete ${person.name}’s profile?`}
      body="Its watch history and Home go with it, on every device."
      art={<TvAvatar person={person} style={{ width: '5.6cqw' }} />}
      onClose={onClose}
      action={
        <TvButton
          icon="delete"
          onClick={() => {
            remove(person.id)
            onClose()
          }}
        >
          Delete profile
        </TvButton>
      }
    />
  )
}

/** Signing out, a device or this TV, asks first; focus goes back where it was, or to the section. */
function ConfirmAsk({ q, onClose }: { q: Ask; onClose: () => void }) {
  const from = useRef(document.activeElement as HTMLElement | null)
  const close = () => {
    onClose()
    requestAnimationFrame(() =>
      (from.current?.isConnected
        ? from.current
        : document.querySelector<HTMLElement>('[data-group="menu"] [aria-current="true"]')
      )?.focus({ preventScroll: true }),
    )
  }
  return (
    <Confirm
      title={q.title}
      body={q.body}
      onClose={close}
      action={
        <TvButton
          icon={q.icon}
          onClick={() => {
            close()
            q.run()
          }}
        >
          {q.label}
        </TvButton>
      }
    />
  )
}

export function TvProfile() {
  const { people, me } = usePeople()
  const [, navigate] = useLocation()
  const [section, setSection] = useState<TvSectionId>('appearance')
  const [pinFlow, setPinFlow] = useState<PinFlow | null>(null)
  const [deleting, setDeleting] = useState<Profile | null>(null)
  const [asking, setAsking] = useState<Ask | null>(null)
  const [focusKey, setFocusKey] = useState(0)
  useInitialFocus(!pinFlow && !deleting, focusKey, '[data-group="profile"] [aria-current="true"]')
  const Body = bodies[section]
  const current = sections.find((s) => s.id === section)
  return (
    <>
      <div
        {...(pinFlow || deleting || asking ? { 'data-isolate': '' } : {})}
        className="absolute inset-0 grid grid-cols-[24cqw_minmax(0,1fr)] grid-rows-[auto_auto_minmax(0,1fr)] gap-x-[4cqw] gap-y-[2cqw] px-(--tv-safe-x) pb-(--tv-safe-y)"
      >
        <TvHead down="profile" className="col-span-full" />
        {/* everyone on this TV, whoever's watching marked; choosing another switches to them */}
        <header className="col-span-full grid gap-[1cqw]">
          <h1 className="font-semibold text-(length:--tv-text-row-title) leading-none">
            Who’s watching
          </h1>
          <ul
            data-group="profile"
            data-go-up="nav"
            data-go-down="menu"
            className="flex items-start gap-[2.4cqw]"
          >
            {people.map((p) => (
              <li key={p.id} className="contents">
                <PersonTile
                  person={p}
                  size={5.6}
                  current={p.id === me.id}
                  onChoose={() => navigate(p.id === me.id ? '/' : `/who/${p.id}`)}
                />
              </li>
            ))}
            <li className="contents">
              <AddTile size={5.6} />
            </li>
          </ul>
        </header>
        <nav aria-label="Settings" className="grid content-start gap-[1cqw]">
          <h2 className="font-semibold text-(length:--tv-text-row-title) leading-none">Settings</h2>
          <ul
            data-group="menu"
            data-go-up="profile"
            data-go-right="panel"
            className="grid gap-[0.3cqw]"
          >
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  data-focusable=""
                  aria-current={s.id === section ? 'true' : undefined}
                  onFocus={() => setSection(s.id)}
                  className={cn(option, 'not-focus-visible:aria-[current=true]:bg-text/10')}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {/* level with the list, under the heading */}
        <section
          aria-label={current?.label}
          data-group="panel"
          data-go-left="menu"
          data-go-up="profile"
          className="grid content-start gap-[1.4cqw] pt-[calc(var(--tv-text-row-title)+1cqw)]"
        >
          <p className="text-(length:--tv-text-meta) text-text-3">{current?.hint}</p>
          <Body openPin={setPinFlow} askDelete={setDeleting} ask={setAsking} />
        </section>
      </div>
      {asking && <ConfirmAsk q={asking} onClose={() => setAsking(null)} />}
      {deleting && (
        <ConfirmDelete
          person={deleting}
          onClose={() => {
            setDeleting(null)
            setFocusKey((k) => k + 1)
          }}
        />
      )}
      {pinFlow && (
        <PinSteps
          flow={pinFlow}
          onClose={() => {
            setPinFlow(null)
            setFocusKey((k) => k + 1)
          }}
        />
      )}
    </>
  )
}
