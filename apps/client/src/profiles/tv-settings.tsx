// SPDX-License-Identifier: AGPL-3.0-only
// The TV's Settings for profiles (the prototype's tv/settings.tsx at 2f51779^), drawn only when the
// server serves them (./state.tsx):
// - Who's watching above the sections: the account's profiles, the one watching now marked;
//   choosing another goes on to `/who/{id}` (its PIN, if it has one), and Add a profile to
//   `/who/new`;
// - PIN, after Home screen: whether the profile watching now has one, then Set a PIN, or Change
//   PIN and Turn off PIN. Choosing one is a step of its own, `/who/pin`, which asks for it twice;
// - Profiles: every profile with what's true of it, Delete on each but the account's own (asking
//   first), whether this TV asks who's watching when highsea opens (kept on the device), and Add
//   a profile until the account has as many as it may.
//
// The prototype asked for the current PIN before changing or turning it off. The contract has no
// way to check it (choosing the profile already watching skips the PIN), so those steps are left
// out until the server can; the checkpoint report lists it for the owner.
import type { Profile } from '@highsea-tv/api-contract'
import { canAdd, canDelete, needsPin } from '@highsea-tv/client/profiles'
import { useT } from '@highsea-tv/i18n/react'
import { Avatar, Button, Text, tokens, useControl, useTheme } from '@highsea-tv/ui'
import { type Href, router } from 'expo-router'
import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { useBack } from '../back.tsx'
import { useConfirm } from '../kit.tsx'
import { profileSettingsMessages as messages, whoMessages } from './messages.ts'
import { TV_PROFILE_SETTINGS as SIZE } from './sizes.ts'
import { useAskOnLaunch, useProfilesState } from './state.tsx'
import { AddTile, PinPad, ProfileTile } from './tv.tsx'

/** The TV's own sections, after Home screen: the profile's PIN and the account's Profiles. */
export type ProfileSectionId = 'pin' | 'people'

export const isProfileSection = (id: string | undefined): id is ProfileSectionId =>
  id === 'pin' || id === 'people'

/** The sections profiles add to the TV's Settings, none when the server doesn't serve them. */
export function useProfileSections(): { id: ProfileSectionId; label: string; hint: string }[] {
  const served = !!useProfilesState()
  const t = useT(messages)
  return useMemo(
    () =>
      served
        ? [
            { id: 'pin', label: t('pin'), hint: t('pinHint') },
            { id: 'people', label: t('people'), hint: t('peopleHint') },
          ]
        : [],
    [served, t],
  )
}

/** Who's watching, above the TV's Settings; nothing without profiles. */
export function TvWhoRow() {
  const p = useProfilesState()
  const t = useT(messages)
  const u = useTheme().u
  if (!p) return null
  const choose = (x: Profile) => {
    if (x.id === p.me?.id) return router.navigate('/' as Href)
    if (needsPin(x, p.me?.id)) return router.push(`/who/${x.id}` as Href)
    void p.switchTo(x.id).then(() => router.replace('/' as Href))
  }
  return (
    <View style={{ gap: SIZE.headGap * u }}>
      <Text variant="rowTitle" weight={600} accessibilityRole="header">
        {t('whoIsWatching')}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SIZE.rowGap * u }}>
        {p.profiles.map((x) => (
          <ProfileTile
            key={x.id}
            person={x}
            size={SIZE.rowSize}
            current={x.id === p.me?.id}
            onPress={() => choose(x)}
          />
        ))}
        <AddTile size={SIZE.rowSize} />
      </View>
    </View>
  )
}

/** A profile section's body. */
export function ProfileSection({ id }: { id: ProfileSectionId }) {
  return id === 'pin' ? <PinSection /> : <PeopleSection />
}

function PinSection() {
  const p = useProfilesState()
  const t = useT(messages)
  const m = useControl()
  if (!p?.me) return null
  const me = p.me
  const open = (flow: 'set' | 'change') => router.push(`/who/pin?flow=${flow}` as Href)
  return (
    <View style={{ gap: m.rowGap }}>
      <Text variant="synopsis" color="text-2">
        {me.hasPin ? t('pinOn', { name: me.name }) : t('pinOff', { name: me.name })}
      </Text>
      <View style={{ flexDirection: 'row', gap: m.gap }}>
        {me.hasPin ? (
          <>
            <Button variant="overlay" onPress={() => open('change')}>
              {t('changePin')}
            </Button>
            <Button variant="overlay" onPress={() => void p.setPin(null)}>
              {t('pinTurnOff')}
            </Button>
          </>
        ) : (
          <Button variant="overlay" icon="lock" onPress={() => open('set')}>
            {t('setPin')}
          </Button>
        )}
      </View>
    </View>
  )
}

function PeopleSection() {
  const p = useProfilesState()
  const t = useT(messages)
  const m = useControl()
  const u = useTheme().u
  const [ask, setAsk] = useAskOnLaunch()
  const w = useT(whoMessages)
  const { ask: confirm, prompt } = useConfirm()
  if (!p) return null
  const asking = ask ?? true
  return (
    <View style={{ gap: m.rowGap }}>
      <View
        accessibilityRole="list"
        style={{ maxWidth: SIZE.listWidth * u, gap: SIZE.listGap * u }}
      >
        {p.profiles.map((x) => (
          <View
            key={x.id}
            accessibilityRole="listitem"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SIZE.itemGap * u,
              minHeight: SIZE.itemHeight * u,
            }}
          >
            <Avatar name={x.name} tone={x.tone} size={SIZE.listAvatar} />
            <Text variant="button" style={{ flex: 1 }}>
              {x.name}
              <Text variant="button" color="text-3">
                {x.main ? t('own') : ''}
                {x.id === p.me?.id ? t('watching') : ''}
                {x.hasPin ? t('hasPin') : ''}
              </Text>
            </Text>
            {canDelete(x) ? (
              <Button
                variant="overlay"
                accessibilityLabel={t('deleteOne', { name: x.name })}
                onPress={() =>
                  confirm({
                    title: t('deleteTitle', { name: x.name }),
                    body: t('deleteBody'),
                    cancel: w('cancel'),
                    action: t('deleteAction'),
                    icon: 'delete',
                    run: () => void p.remove(x.id),
                  })
                }
              >
                {w('delete')}
              </Button>
            ) : null}
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'flex-start', gap: SIZE.hintGap * u }}>
        <Button variant={asking ? 'primary' : 'overlay'} onPress={() => setAsk(!asking)}>
          {t('ask', { state: asking ? t('on') : t('off') })}
        </Button>
        <Text variant="meta" color="text-3">
          {asking ? t('askOn') : t('askOff')}
        </Text>
      </View>
      {canAdd(p.profiles.length, p.max) ? (
        <View style={{ flexDirection: 'row' }}>
          <Button variant="overlay" icon="add" onPress={() => router.push('/who/new' as Href)}>
            {w('addTitle')}
          </Button>
        </View>
      ) : (
        <Text variant="meta" color="text-3">
          {t('full', { max: p.max })}
        </Text>
      )}
      {prompt}
    </View>
  )
}

/**
 * `/who/pin`: choosing the PIN of the profile watching now, twice; Back, or a match, goes back to
 * Settings. Setting and changing it are the same two steps (`?flow=` names which, for the record).
 */
export function TvPinSteps() {
  const p = useProfilesState()
  const t = useT(messages)
  const u = useTheme().u
  const [step, setStep] = useState<'choose' | 'confirm'>('choose')
  const [chosen, setChosen] = useState('')
  const [again, setAgain] = useState(false)
  const done = () => (router.canGoBack() ? router.back() : router.replace('/settings' as Href))
  useBack(() => {
    done()
    return true
  })
  if (!p?.me) return null
  const me = p.me
  const pad =
    step === 'choose'
      ? {
          title: again ? t('chooseAgain') : t('choose'),
          hint: again ? t('noMatch') : t('chooseHint', { name: me.name }),
          check: async (pin: string) => {
            setChosen(pin)
            setStep('confirm')
            return null
          },
        }
      : {
          title: t('again'),
          hint: undefined,
          check: async (pin: string) => {
            if (pin === chosen) {
              await p.setPin(pin)
              done()
            } else {
              setAgain(true)
              setStep('choose')
            }
            return null
          },
        }
  return (
    <View
      accessibilityViewIsModal
      accessibilityLabel={pad.title}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.tv.safe.y * u,
      }}
    >
      <PinPad key={`${step}:${again}`} person={me} {...pad} />
    </View>
  )
}
