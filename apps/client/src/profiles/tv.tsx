// SPDX-License-Identifier: AGPL-3.0-only
// Who's watching on the TV (the owner, 2026-10-30; the prototype's tv/who.tsx), drawn only when the
// server serves profiles (./state.tsx): the account's profiles, large, with Add a profile at the
// end. Choosing one watches as it; if it has a PIN it's asked for first on a number pad the D-pad
// moves over (or, in a browser, the keyboard's number keys). `/who` is reached from Settings'
// Who's watching and the head's avatar's page; `/who/{id}` asks for a profile's PIN.
//
// The opening (TvLaunch, `/who?launch=1`): when the account has more than one profile and this TV
// asks (Settings › Profiles, kept on the device), highsea opens on Who's watching over a bloom in
// the focused profile's colour, focus on the profile last used, "Last here" under it. Otherwise it
// opens as the last profile, asking for its PIN if it has one. Back does nothing there: on a TV it
// leaves the app, which the TV does itself.
//
// A TV's composition of its own (focus over a grid against the pointer's and the phone's), in the
// TV's units: the prototype's cqw are the theme's `u` here.
import type { Profile } from '@highsea-tv/api-contract'
import { needsPin, PIN_LENGTH } from '@highsea-tv/client/profiles'
import { useT } from '@highsea-tv/i18n/react'
import {
  Avatar,
  type AvatarTone,
  Bloom,
  Icon,
  Text,
  tokens,
  useMotionReduced,
  useTheme,
} from '@highsea-tv/ui'
import { Focusable, focusShadow, LIFT, TvKey, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { type Ref, useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { useBack, useLeaveOnBack } from '../back.tsx'
import { TvIdentity } from '../kit.tsx'
import { whoMessages } from './messages.ts'
import { TV_LAUNCH as LAUNCH, TV_PIN as PIN, TV_TILE as TILE, TV_WHO as WHO } from './sizes.ts'
import { type Refused, useProfilesState } from './state.tsx'
import { useProfilesText } from './who.tsx'

const tv = tokens.tv

const home = () => router.replace('/' as Href)

/** The server's mark and name at the safe area's top left, as every gate screen on the TV starts. */
function Identity() {
  const u = useTheme().u
  return (
    <View style={{ position: 'absolute', top: tv.safe.y * u, left: tv.safe.x * u }}>
      <TvIdentity />
    </View>
  )
}

/**
 * A profile as a focus stop: the avatar, which lifts and takes the ring, and the name under it,
 * with a lock when it has a PIN, and a line under that (Watching now, Last here).
 */
export function ProfileTile({
  person,
  size,
  current = false,
  note,
  preferred,
  onPress,
  onFocus,
  ref,
}: {
  person: Profile
  /** The avatar's width, in units. */
  size: number
  current?: boolean
  note?: string
  preferred?: boolean
  onPress: () => void
  onFocus?: () => void
  ref?: Ref<ViewHandle>
}) {
  const text = useProfilesText()
  const theme = useTheme()
  const u = theme.u
  const under = note ?? (current ? text.watchingNow : undefined)
  return (
    <Focusable
      ref={ref}
      preferred={preferred}
      label={text.label(person, current)}
      description={note}
      selected={current}
      ring={false}
      lift="none"
      onPress={onPress}
      onFocus={onFocus}
    >
      {(focused) => (
        <View style={{ alignItems: 'center', gap: TILE.stack * u }}>
          <View
            style={[
              { borderRadius: (size * u) / 2 },
              focused && {
                transform: [{ scale: LIFT.poster }],
                boxShadow: focusShadow(theme.colors.text, u, theme.focusRingScale),
              },
            ]}
          >
            <Avatar name={person.name} tone={person.tone} size={size} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: TILE.nameGap * u }}>
            <Text variant="meta" weight={600} color={focused ? 'text' : 'text-2'}>
              {person.name}
            </Text>
            {person.hasPin ? <Icon name="lock" size={TILE.lock} color="text-3" /> : null}
          </View>
          {under ? (
            <Text variant="pill" color="text-3" style={{ marginTop: -TILE.noteLift * u }}>
              {under}
            </Text>
          ) : null}
        </View>
      )}
    </Focusable>
  )
}

/** Adds a profile to the account, until it has as many as it may. */
export function AddTile({ size, onFocus }: { size: number; onFocus?: () => void }) {
  const text = useProfilesText()
  const p = useProfilesState()
  const theme = useTheme()
  const u = theme.u
  if (!p || p.profiles.length >= p.max) return null
  return (
    <Focusable
      label={text.addProfile}
      ring={false}
      lift="none"
      onFocus={onFocus}
      onPress={() => router.push('/who/new' as Href)}
    >
      {(focused) => (
        <View style={{ alignItems: 'center', gap: TILE.stack * u }}>
          <View
            style={{
              width: size * u,
              height: size * u,
              borderRadius: (size * u) / 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: TILE.dash * u,
              borderStyle: 'dashed',
              borderColor: focused ? 'transparent' : `${theme.colors.text}40`,
              backgroundColor: focused ? theme.colors.text : 'transparent',
              transform: focused ? [{ scale: LIFT.poster }] : [],
            }}
          >
            <Icon name="add" size={size * 0.4} color={focused ? 'bg' : 'text-2'} />
          </View>
          <Text variant="meta" weight={600} color={focused ? 'text' : 'text-2'}>
            {text.addProfile}
          </Text>
        </View>
      )}
    </Focusable>
  )
}

/** The profiles in a row, each a stop, then Add a profile. */
function Profiles({
  sizes,
  focusOn,
  note,
  onChoose,
  onFocus,
}: {
  sizes: typeof WHO | typeof LAUNCH
  /** The profile focus starts on. */
  focusOn: string | undefined
  note?: (p: Profile) => string | undefined
  onChoose: (p: Profile) => void
  onFocus?: (p: Profile | null) => void
}) {
  const p = useProfilesState()
  const text = useProfilesText()
  const u = useTheme().u
  if (!p) return null
  return (
    <View
      accessibilityRole="list"
      accessibilityLabel={text.profiles}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: sizes.gap * u }}
    >
      {p.profiles.map((x) => (
        <ProfileTile
          key={x.id}
          person={x}
          size={sizes.size}
          note={note?.(x)}
          preferred={x.id === focusOn}
          onPress={() => onChoose(x)}
          onFocus={() => onFocus?.(x)}
        />
      ))}
      <AddTile size={sizes.size} onFocus={() => onFocus?.(null)} />
    </View>
  )
}

/** `/who` on the TV: the profiles; one with a PIN goes on to `/who/{id}`. */
export function TvWho() {
  const p = useProfilesState()
  const text = useProfilesText()
  const u = useTheme().u
  if (!p) return null
  const choose = (x: Profile) => {
    if (needsPin(x, p.me?.id)) return router.push(`/who/${x.id}` as Href)
    void p.switchTo(x.id).then(home)
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Identity />
      <View style={{ alignItems: 'center', gap: WHO.stack * u }}>
        <Text size={WHO.title} weight={600} accessibilityRole="header">
          {text.whoIsWatching}
        </Text>
        <Profiles sizes={WHO} focusOn={p.me?.id} onChoose={choose} />
      </View>
    </View>
  )
}

/** Each tone's bloom colour: the soft pair's strong half, as the prototype's mixed toward the page. */
const BLOOM: Record<
  AvatarTone,
  'accent' | 'badge-info' | 'badge-success' | 'badge-warning' | 'badge-danger'
> = {
  accent: 'accent',
  info: 'badge-info',
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
}

/**
 * The TV's opening: who's watching, large, over a bloom in the focused profile's colour, focus on
 * the profile last used here. Nobody is watching yet, so every profile with a PIN asks for it, the
 * last one too. With one profile, or when this TV doesn't ask, it opens as the last profile, asking
 * for its PIN if it has one.
 */
export function TvLaunch({ ask }: { ask: boolean }) {
  const p = useProfilesState()
  const text = useProfilesText()
  const w = useT(whoMessages)
  const theme = useTheme()
  const u = theme.u
  const [asking, setAsking] = useState<Profile | null>(null)
  // the bloom takes the focused profile's colour, and fades while Add a profile has focus
  const [glow, setGlow] = useState<{ tone: AvatarTone | null; shown: boolean }>({
    tone: null,
    shown: true,
  })
  useLeaveOnBack(!asking)
  useBack(() => {
    if (!asking) return false
    setAsking(null)
    return true
  })
  if (!p?.me) return null
  const me = p.me
  if (!ask) return <TvAskPin person={me} />
  if (asking) return <TvAskPin person={asking} onCancel={() => setAsking(null)} />
  const tone = glow.tone ?? me.tone
  const choose = (x: Profile) => {
    if (x.hasPin) return setAsking(x)
    void p.switchTo(x.id).then(home)
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Bloom color={theme.colors[BLOOM[tone]]} shown={glow.shown} />
      <Identity />
      <View style={{ alignItems: 'center', gap: LAUNCH.stack * u }}>
        <Text size={LAUNCH.title} weight={600} accessibilityRole="header">
          {text.whoIsWatching}
        </Text>
        <Profiles
          sizes={LAUNCH}
          focusOn={me.id}
          note={(x) => (x.id === me.id ? w('lastHere') : undefined)}
          onChoose={choose}
          onFocus={(x) =>
            setGlow((g) => (x ? { tone: x.tone, shown: true } : { ...g, shown: false }))
          }
        />
      </View>
    </View>
  )
}

/** `/who/{id}`: asks for someone's PIN, then watches as them. With no `onCancel`, Back leaves. */
export function TvAskPin({ person, onCancel }: { person: Profile; onCancel?: () => void }) {
  const p = useProfilesState()
  const text = useProfilesText()
  const w = useT(whoMessages)
  const u = useTheme().u
  const main = p?.profiles.find((x) => x.main)
  useBack(() => {
    if (!onCancel) return false
    onCancel()
    return true
  })
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Identity />
      <View style={{ alignItems: 'center', gap: PIN.below * u }}>
        <PinPad
          person={person}
          title={text.enterPin(person.name)}
          check={async (pin) => {
            const refused = (await p?.switchTo(person.id, pin)) ?? null
            if (!refused) home()
            return refused
          }}
        />
        <Text
          variant="pill"
          color="text-3"
          style={{ maxWidth: PIN.forgotWidth * u, textAlign: 'center' }}
        >
          {w('forgot', { name: main?.name ?? w('theAccount') })}
        </Text>
      </View>
    </View>
  )
}

const DIGIT_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
] as const

/**
 * Four digits on a number pad: the D-pad moves over the keys and OK types one (in a browser the
 * keyboard's number keys and Backspace type too). The fourth digit submits; `check` answers with
 * what the server said to a wrong PIN (and how long the profile rests after the fifth), or null
 * when it's right.
 */
export function PinPad({
  person,
  title,
  hint,
  check,
}: {
  person: Profile
  title: string
  hint?: string
  check: (pin: string) => Promise<Refused | null>
}) {
  const w = useT(whoMessages)
  const theme = useTheme()
  const u = theme.u
  const reduced = useMotionReduced()
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [restUntil, setRestUntil] = useState(0)
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
    if (resting || digits.length >= PIN_LENGTH) return
    const next = digits + d
    setDigits(next)
    setError(null)
    if (next.length < PIN_LENGTH) return
    void check(next).then((problem) => {
      if (!problem) return
      // the dots empty for the next try, after a moment to see the fourth
      setTimeout(() => setDigits(''), reduced ? 0 : 360)
      if (problem.restS) setRestUntil(Date.now() + problem.restS * 1000)
      setError(problem.message)
    })
  }
  const erase = () => setDigits((d) => d.slice(0, -1))

  // a browser's number keys and Backspace type without moving focus (the TV's frame in the
  // prototypes); a TV's remote has none
  const latest = useRef({ type, erase })
  latest.current = { type, erase }
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const doc = (globalThis as { document?: Document }).document
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) latest.current.type(e.key)
      else if (e.key === 'Backspace') latest.current.erase()
      else return
      e.preventDefault()
    }
    doc?.addEventListener('keydown', onKey)
    return () => doc?.removeEventListener('keydown', onKey)
  }, [])

  const keyWidth = (PIN.pad - 2 * PIN.key) / 3
  const key = (d: string, preferred = false) => (
    <TvKey key={d} width={keyWidth * u} preferred={preferred} onPress={() => type(d)}>
      {d}
    </TvKey>
  )
  return (
    <View style={{ alignItems: 'center', gap: PIN.stack * u }}>
      <Avatar name={person.name} tone={person.tone} size={PIN.avatar} />
      <View style={{ alignItems: 'center', gap: PIN.titleGap * u }}>
        <Text size={PIN.title} weight={600} accessibilityRole="header">
          {title}
        </Text>
        {hint ? (
          <Text variant="meta" color="text-2">
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={w('digits', { count: digits.length })}
        style={{ flexDirection: 'row', gap: PIN.dot * u }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: PIN.dot * u,
              height: PIN.dot * u,
              borderRadius: (PIN.dot * u) / 2,
              borderWidth: PIN.dotEdge * u,
              borderColor: theme.colors.text,
              backgroundColor: i < digits.length ? theme.colors.text : 'transparent',
            }}
          />
        ))}
      </View>
      <Text
        variant="meta"
        color="badge-danger"
        accessibilityLiveRegion="polite"
        {...({ role: 'alert' } as object)}
        style={{ minHeight: PIN.error * u }}
      >
        {error ?? ''}
      </Text>
      <View style={{ width: PIN.pad * u, gap: PIN.key * u, opacity: resting ? 0.4 : 1 }}>
        {DIGIT_ROWS.map((row) => (
          <View key={row[0]} style={{ flexDirection: 'row', gap: PIN.key * u }}>
            {row.map((d) => key(d, d === '5'))}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: PIN.key * u }}>
          <View style={{ width: keyWidth * u }} />
          {key('0')}
          <TvKey width={keyWidth * u} onPress={erase}>
            {w('delete')}
          </TvKey>
        </View>
      </View>
    </View>
  )
}
