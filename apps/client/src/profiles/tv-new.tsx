// SPDX-License-Identifier: AGPL-3.0-only
// `/who/new` on the TV: Add a profile (the prototype's tv/who.tsx, TvNewProfile), drawn only when
// the server serves profiles. The new profile's circle on the left, in the colour chosen, with its
// name under it; on the right the title and its line, the name as it's typed, an on-screen
// keyboard the D-pad moves over, the colours, and Add profile and Cancel. Adding it watches as it,
// then Home. A name the account already has is refused before it's sent (the server refuses it
// too). In a browser the keyboard's own keys type as well.
//
// Shift, as a phone's keyboard has it: once capitalises the next letter, twice in a row is caps
// lock, and a third press turns it off. It turns itself on at the start of each word, as names are
// capitalised, unless caps lock is on.
import { PROFILE_TONES, type ProfileTone } from '@highsea-tv/api-contract'
import { nextTone } from '@highsea-tv/client/profiles'
import { useT } from '@highsea-tv/i18n/react'
import { Avatar, Button, Text, tokens, useControl, useTheme } from '@highsea-tv/ui'
import { Focusable, TvKey } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import { useBack } from '../back.tsx'
import { TvIdentity } from '../kit.tsx'
import { whoMessages } from './messages.ts'
import { TV_NEW as SIZE } from './sizes.ts'
import { useProfilesState } from './state.tsx'

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
/** The longest name the keyboard types, as the prototype's. */
const NAME_MAX = 20

/** The right-hand column: what's left of the screen beside the circle. */
const COLUMN = SIZE.screen - 2 * SIZE.inset - SIZE.avatar - SIZE.gap
const KEY = (COLUMN - 9 * SIZE.key) / 10
const span = (n: number) => n * KEY + (n - 1) * SIZE.key

type Shift = 'off' | 'once' | 'lock'

export function TvNewProfile() {
  const p = useProfilesState()
  const w = useT(whoMessages)
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const [name, setName] = useState('')
  const [tone, setTone] = useState<ProfileTone>(() =>
    nextTone(p?.profiles.map((x) => x.tone) ?? []),
  )
  const [shift, setShift] = useState<Shift>('once')
  const [adding, setAdding] = useState(false)
  const back = () => (router.canGoBack() ? router.back() : router.replace('/' as Href))
  useBack(() => {
    back()
    return true
  })

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
  const erase = () => {
    const n = name.slice(0, -1)
    setName(n)
    if (shift !== 'lock') setShift(atStart(n) ? 'once' : 'off')
  }
  const pressShift = () => setShift((s) => (s === 'off' ? 'once' : s === 'once' ? 'lock' : 'off'))

  // a browser's keys type too, without moving focus (the TV's frame in the prototypes)
  const latest = useRef({ type, space, erase })
  latest.current = { type, space, erase }
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const doc = (globalThis as { document?: Document }).document
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[a-z]$/i.test(e.key)) latest.current.type(e.key.toLowerCase())
      else if (e.key === ' ') latest.current.space()
      else if (e.key === 'Backspace') latest.current.erase()
      else return
      e.preventDefault()
    }
    doc?.addEventListener('keydown', onKey)
    return () => doc?.removeEventListener('keydown', onKey)
  }, [])

  if (!p) return null
  const trimmed = name.trim()
  const taken = p.profiles.some((x) => x.name.toLowerCase() === trimmed.toLowerCase())
  const add = () => {
    if (!trimmed || taken || adding) return
    setAdding(true)
    void p
      .add(trimmed, tone)
      .then(() => router.replace('/' as Href))
      .finally(() => setAdding(false))
  }
  const key = (k: string, first = false) => (
    <TvKey key={k} width={KEY * u} preferred={first} onPress={() => type(k)}>
      {shift === 'off' ? k : k.toUpperCase()}
    </TvKey>
  )
  const rows = [LETTERS.slice(0, 10), LETTERS.slice(10, 20), LETTERS.slice(20)]
  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SIZE.gap * u,
        paddingHorizontal: SIZE.inset * u,
      }}
    >
      <View style={{ position: 'absolute', top: tokens.tv.safe.y * u, left: tokens.tv.safe.x * u }}>
        <TvIdentity />
      </View>
      <View style={{ alignItems: 'center', gap: SIZE.avatarGap * u }}>
        <Avatar name={trimmed || '?'} tone={tone} size={SIZE.avatar} />
        <Text size={SIZE.name} weight={600} style={{ height: SIZE.nameHeight * u }}>
          {name}
        </Text>
      </View>
      <View style={{ width: COLUMN * u, gap: SIZE.stack * u }}>
        <View style={{ gap: SIZE.titleGap * u }}>
          <Text size={SIZE.title} weight={600} accessibilityRole="header">
            {w('addTitle')}
          </Text>
          <Text variant="meta" color="text-2">
            {w('addHint')}
          </Text>
        </View>
        <View
          accessibilityLiveRegion="polite"
          accessibilityLabel={name || w('name')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            height: SIZE.field * u,
            paddingHorizontal: SIZE.fieldPad * u,
            borderRadius: SIZE.fieldRadius * u,
            backgroundColor: `${theme.colors.text}14`,
          }}
        >
          <Text variant="button" color={name ? 'text' : 'text-3'}>
            {name || w('name')}
          </Text>
          <View
            style={{
              marginStart: SIZE.caret.gap * u,
              height: SIZE.caret.height * u,
              width: SIZE.caret.width * u,
              backgroundColor: theme.colors.text,
            }}
          />
        </View>
        <View style={{ gap: SIZE.key * u }}>
          {rows.slice(0, 2).map((row, i) => (
            <View key={row[0]} style={{ flexDirection: 'row', gap: SIZE.key * u }}>
              {row.map((k, j) => key(k, i === 0 && j === 0))}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: SIZE.key * u }}>
            <TvKey
              width={span(2) * u}
              label={shift === 'lock' ? w('capsLock') : w('shift')}
              pressed={shift !== 'off'}
              onPress={pressShift}
            >
              {shift === 'lock' ? w('capsLock') : w('shift')}
            </TvKey>
            {(rows[2] ?? []).map((k) => key(k))}
            <TvKey width={span(2) * u} onPress={erase}>
              {w('delete')}
            </TvKey>
          </View>
          <View style={{ flexDirection: 'row', paddingStart: (span(2) + SIZE.key) * u }}>
            <TvKey width={span(6) * u} onPress={space}>
              {w('space')}
            </TvKey>
          </View>
        </View>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={w('colour')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: SIZE.swatchGap * u }}
        >
          <Text variant="meta" color="text-2" style={{ marginEnd: SIZE.swatchLabel * u }}>
            {w('colour')}
          </Text>
          {PROFILE_TONES.map((t) => (
            <Focusable
              key={t}
              role="radio"
              selected={t === tone}
              label={w(`tone.${t}`)}
              lift="button"
              radius={(SIZE.swatch * u) / 2}
              onPress={() => setTone(t)}
            >
              {() => <Avatar name=" " tone={t} size={SIZE.swatch} ring={t === tone} />}
            </Focusable>
          ))}
        </View>
        {taken ? (
          <Text variant="meta" color="badge-danger" {...({ role: 'alert' } as object)}>
            {w('taken', { name: trimmed })}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: m.gap }}>
          <Button
            variant="primary"
            icon="add"
            disabled={!trimmed || taken}
            loading={adding}
            onPress={add}
          >
            {w('add')}
          </Button>
          <Button variant="overlay" onPress={back}>
            {w('cancel')}
          </Button>
        </View>
      </View>
    </View>
  )
}
