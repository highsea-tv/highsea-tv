// SPDX-License-Identifier: AGPL-3.0-only
// Who's watching with a pointer and by touch (client-settings.md › Switch profile; the prototype's
// client/who.tsx and mobile/who-sheet.tsx), drawn only when the server serves profiles
// (./state.tsx):
// - with a pointer, `/who` on its own, without the top bar: the account's profiles as large circles
//   in their colours, each with its name and a lock when it has a PIN, the one watching now ringed
//   and marked, then Cancel;
// - by touch, a sheet over You (Settings) instead, as phones switch accounts: Switch profile, then
//   a row per profile with its circle and name, "Watching now" and a check on the current one, a
//   lock on one with a PIN.
// Choosing one with a PIN asks for its four digits first, in one field (PinField), which the
// server checks; then Home, as that profile. Adding and deleting profiles stay on the TV for now.
import type { Profile } from '@highsea-tv/api-contract'
import { createProfilesText, needsPin, PIN_LENGTH, pinDigits } from '@highsea-tv/client/profiles'
import { useLocale } from '@highsea-tv/i18n/react'
import {
  Avatar,
  Button,
  Icon,
  Input,
  Press,
  ScrollView,
  Sheet,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui'
import { type Href, router } from 'expo-router'
import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react'
import { type TextInput, View } from 'react-native'
import { WHO } from './sizes.ts'
import { useProfilesState } from './state.tsx'

const { space } = tokens

/** The profiles' shared words in this locale. */
export function useProfilesText() {
  const locale = useLocale()
  return useMemo(() => createProfilesText(locale), [locale])
}

const home = () => router.replace('/' as Href)

/** The prototype's sizes: the page's 128 circle (its initial 56), the PIN step's 96, the sheet's 44 and 64. */
const SIZES = {
  page: { avatar: space['16'] * 2, pin: space['16'] + space['8'] },
  sheet: { avatar: space['10'] + space['1'], pin: space['16'] },
} as const

// ---------------------------------------------------------------- with a pointer

/**
 * `/who` with a pointer: the profiles, then the PIN of the one chosen if it has one; `/who/{id}`
 * starts at that profile's PIN.
 */
export function WhoPage({ asking: first = null }: { asking?: Profile | null }) {
  const p = useProfilesState()
  const text = useProfilesText()
  const theme = useTheme()
  const [asking, setAsking] = useState<Profile | null>(first)
  if (!p) return null
  const choose = (x: Profile) => {
    if (needsPin(x, p.me?.id)) return setAsking(x)
    void p.switchTo(x.id).then(home)
  }
  const cancel = () => (router.canGoBack() ? router.back() : home())
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space['4'],
        paddingVertical: space['12'],
      }}
    >
      {asking ? (
        <PinField profile={asking} size="page" onBack={() => setAsking(null)} onRight={home} />
      ) : (
        <View style={{ alignItems: 'center', gap: space['10'] }}>
          <Text variant="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {text.whoIsWatching}
          </Text>
          <View
            accessibilityRole="list"
            accessibilityLabel={text.profiles}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: space['8'],
            }}
          >
            {p.profiles.map((x) => {
              const current = x.id === p.me?.id
              return (
                <View key={x.id} accessibilityRole="listitem">
                  <Press
                    accessibilityRole="button"
                    accessibilityLabel={text.label(x, current)}
                    {...(current ? { 'aria-current': 'true' } : {})}
                    onPress={() => choose(x)}
                    style={{
                      alignItems: 'center',
                      gap: space['2'],
                      padding: space['1'],
                      borderRadius: tokens.radius.lg,
                    }}
                  >
                    {({ hovered }) => (
                      <>
                        <View style={{ transform: [{ scale: hovered ? WHO.hover : 1 }] }}>
                          <Avatar
                            name={x.name}
                            tone={x.tone}
                            size={SIZES.page.avatar}
                            ring={current}
                          />
                        </View>
                        <Name profile={x} color={hovered ? 'text' : 'text-2'} />
                        {current ? (
                          <Text
                            variant="caption"
                            color="text-3"
                            style={{ marginTop: -(space['1'] + space['0.5']) }}
                          >
                            {text.watchingNow}
                          </Text>
                        ) : null}
                      </>
                    )}
                  </Press>
                </View>
              )
            })}
          </View>
          <Button variant="ghost" onPress={cancel}>
            {text.cancel}
          </Button>
        </View>
      )}
    </ScrollView>
  )
}

/** A profile's name, semibold, with a lock when it has a PIN. */
function Name({ profile, color }: { profile: Profile; color: 'text' | 'text-2' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['1'] + space['0.5'] }}>
      <Text variant="body" weight={600} color={color}>
        {profile.name}
      </Text>
      {profile.hasPin ? <Icon name="lock" size={WHO.lock} color="text-3" /> : null}
    </View>
  )
}

// ---------------------------------------------------------------- the PIN, in one field

/**
 * Four digits in one field; the fourth sends them to the server, which says whether they're right,
 * and rests the profile after the fifth wrong one in a row. In the phone's sheet the sheet's title
 * asks for the PIN.
 */
export function PinField({
  profile: p,
  size,
  onBack,
  onRight,
}: {
  profile: Profile
  size: 'page' | 'sheet'
  onBack: () => void
  onRight: () => void
}) {
  const state = useProfilesState()
  const text = useProfilesText()
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [restUntil, setRestUntil] = useState(0)
  const field = useRef<ComponentRef<typeof TextInput>>(null)
  const resting = restUntil > Date.now()
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
    const next = pinDigits(value)
    setDigits(next)
    setError(null)
    if (next.length < PIN_LENGTH || !state) return
    void state.switchTo(p.id, next).then((refused) => {
      if (!refused) return onRight()
      setDigits('')
      if (refused.restS) setRestUntil(Date.now() + refused.restS * 1000)
      setError(refused.message)
    })
  }
  const sheet = size === 'sheet'
  return (
    <View
      style={{
        alignItems: 'center',
        gap: sheet ? space['4'] : space['5'],
        paddingTop: sheet ? space['2'] : 0,
      }}
    >
      <Avatar name={p.name} tone={p.tone} size={SIZES[size].pin} />
      {sheet ? null : (
        <Text variant="heading" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {text.enterPin(p.name)}
        </Text>
      )}
      <Input
        ref={field}
        accessibilityLabel={text.pinField(p.name)}
        autoFocus
        secureTextEntry
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="off"
        maxLength={PIN_LENGTH}
        value={digits}
        disabled={resting}
        invalid={!!error}
        mono
        onChangeText={type}
        style={{
          width: space['16'] * 2 + space['12'],
          textAlign: 'center',
          letterSpacing: WHO.pinSpacing,
        }}
      />
      <Text
        variant="body"
        color="danger"
        accessibilityLiveRegion="polite"
        {...({ role: 'alert' } as object)}
        style={{ minHeight: space['6'], textAlign: 'center' }}
      >
        {error ?? ''}
      </Text>
      <Button variant="ghost" icon="arrow-left" onPress={onBack}>
        {text.someoneElse}
      </Button>
    </View>
  )
}

// ---------------------------------------------------------------- by touch

/** The phone's Switch profile: a sheet of rows over You, asking for a PIN in the same sheet. */
export function WhoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = useProfilesState()
  const text = useProfilesText()
  const theme = useTheme()
  const [asking, setAsking] = useState<Profile | null>(null)
  if (!p) return null
  const done = () => {
    setAsking(null)
    onClose()
    home()
  }
  const choose = (x: Profile) => {
    if (x.id === p.me?.id) return onClose()
    // anyone without a PIN needs none
    if (x.hasPin) return setAsking(x)
    void p.switchTo(x.id).then(done)
  }
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onDismiss={() => setAsking(null)}
      title={asking ? text.enterPin(asking.name) : text.switchProfile}
    >
      {asking ? (
        <PinField profile={asking} size="sheet" onBack={() => setAsking(null)} onRight={done} />
      ) : (
        <View
          accessibilityRole="list"
          accessibilityLabel={text.profiles}
          style={{ marginHorizontal: -space['3'] }}
        >
          {p.profiles.map((x) => {
            const current = x.id === p.me?.id
            return (
              <View key={x.id} accessibilityRole="listitem">
                <Press
                  haptic
                  accessibilityRole="button"
                  accessibilityLabel={text.label(x, current)}
                  {...(current ? { 'aria-current': 'true' } : {})}
                  onPress={() => choose(x)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space['3'],
                    minHeight: space['16'],
                    paddingHorizontal: space['3'],
                    paddingVertical: space['2'],
                    borderRadius: tokens.radius.md,
                    backgroundColor: pressed ? theme.colors.s2 : 'transparent',
                  })}
                >
                  <Avatar name={x.name} tone={x.tone} size={SIZES.sheet.avatar} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body" weight={600} numberOfLines={1}>
                      {x.name}
                    </Text>
                    {current ? (
                      <Text variant="caption" color="text-3">
                        {text.watchingNow}
                      </Text>
                    ) : null}
                  </View>
                  {current ? (
                    <Icon name="check" size={tokens.icon.size.md} color="accent-text" />
                  ) : x.hasPin ? (
                    <Icon name="lock" size={WHO.sheetLock} color="text-3" />
                  ) : null}
                </Press>
              </View>
            )
          })}
        </View>
      )}
    </Sheet>
  )
}
