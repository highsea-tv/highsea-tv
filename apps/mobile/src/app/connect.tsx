// SPDX-License-Identifier: AGPL-3.0-only
// C1's Choose a server on the phone (connectivity.md › Web and mobile), from the prototype's
// client/connect-flow.tsx with `?app=mobile`: the servers this phone has used, the servers
// answering on this network as Bonjour finds them (@highsea-tv/native/nearby), and an address field.
// Choosing one makes it the server in use, and the gate opens its sign-in, or Home when this
// phone is still signed in there. A `highsea://connect?address=` link fills the address in.
// A server of yours is forgotten by swiping its row left or pressing it long (the owner's answer
// of 2026-10-29), so one that no longer answers needn't stay listed. Find my servers with a
// highsea account stays collapsed and explained, as C1 prototypes it.
import type { PublicInfo } from '@highsea-tv/api-contract'
import { normalize } from '@highsea-tv/client/servers'
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useNearby } from '@highsea-tv/native/nearby'
import { publicInfoAt, useServers } from '@highsea-tv/native/servers'
import { Button, Disclosure, Field, Input, Mark, Text, useTheme } from '@highsea-tv/ui'
import { router, useLocalSearchParams } from 'expo-router'
import { useRef, useState } from 'react'
import { View } from 'react-native'
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated'
import { useForget } from '../forget.ts'
import { Alert, Group, goBack, Label, Row, Screen, Title } from '../kit.tsx'
import { forget as forgetMessages, connect as messages } from '../messages.ts'

/**
 * What letting go of a swipe does, drawn only where the row has moved away from: nothing shows
 * while it's pressed or at rest, and it stays inside the card's corners. The panel keeps its width
 * so the swipeable can measure how far it opens.
 */
function ForgetPanel({ translation, label }: { translation: SharedValue<number>; label: string }) {
  const theme = useTheme()
  const reveal = useAnimatedStyle(() => ({ width: Math.max(0, -translation.value) }))
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: 88 }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            end: 0,
            overflow: 'hidden',
            backgroundColor: theme.colors['danger-fill'],
          },
          reveal,
        ]}
      >
        {/* the label follows the row's edge out, as Mail's does */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            start: 0,
            width: 88,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="body" size={15} weight={600} color="on-danger">
            {label}
          </Text>
        </View>
      </Animated.View>
    </View>
  )
}

const hostOf = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/** The addresses to try for what someone typed: normalize's guess, then the other scheme. */
function candidates(typed: string): string[] | null {
  const n = normalize(typed)
  if (!n) return null
  if (/^https?:\/\//i.test(typed.trim())) return [n]
  return [n, n.startsWith('https:') ? n.replace(/^https:/, 'http:') : n.replace(/^http:/, 'https:')]
}

export default function Connect() {
  const t = useT(messages)
  const f = useT(forgetMessages)
  const theme = useTheme()
  const locale = useLocale()
  const servers = useServers()
  const forget = useForget()
  // The row under a swipe still sees the finger lift as a press (it's React Native's Pressable, not
  // the gesture's), so a row being swiped, or left open, doesn't open its server.
  const swiped = useRef<string | null>(null)
  const swipes = useRef(new Map<string, SwipeableMethods>())
  const linked = useLocalSearchParams<{ address?: string }>().address
  const { found, lan, scanning, rescan } = useNearby()
  const [address, setAddress] = useState(linked ?? '')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)
  const now = Date.now()
  const knownIds = new Set(servers.known.map((k) => k.id))
  const nearby = found.filter((s) => !knownIds.has(s.info.id))

  // Where a server leads: its sign-in, or Home when this phone is still signed in there. Named
  // outright, since '/' is behind the tabs' guard until then, and choosing the server already in
  // use changes no phase for the gate to move on from.
  const arrive = (id: string) =>
    router.replace(servers.known.find((k) => k.id === id)?.signedIn ? '/' : '/sign-in')

  const opened = (info: PublicInfo, base: string) => {
    if (!info.setupComplete) return t('notSetUp', { name: info.name, address: hostOf(base) })
    void servers.add(info, base).then(() => arrive(info.id))
    return null
  }

  const add = async (typed: string) => {
    const tries = candidates(typed)
    if (!tries) return setError(t('invalid'))
    setPending('typed')
    setError(null)
    for (const base of tries) {
      const info = await publicInfoAt(base)
      if (info) {
        setPending(null)
        setError(opened(info, base))
        return
      }
    }
    setPending(null)
    setError(t('unreachable', { address: typed.trim() }))
  }

  const openNearby = (s: { info: PublicInfo; base: string }) => {
    setRowError(opened(s.info, s.base))
  }

  const openKnown = async (id: string) => {
    setPending(id)
    await servers.use(id)
    setPending(null)
    arrive(id)
  }

  return (
    <Screen gap={24}>
      {servers.current && (
        <Button variant="ghost" icon="chevron-left" onPress={goBack}>
          {t('back')}
        </Button>
      )}
      <View style={{ gap: 12, alignItems: 'center', paddingTop: servers.current ? 0 : 24 }}>
        <Mark size={40} />
      </View>
      <Title>{t('title')}</Title>
      {rowError && <Alert>{rowError}</Alert>}

      {servers.known.length > 0 && (
        <View style={{ gap: 8 }}>
          <Label>{t('yourServers')}</Label>
          <Group>
            {servers.known.map((k) => (
              // Swiping a row open asks to forget it, as Mail's full swipe does, and the row closes
              // again (https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable).
              // The panel (ForgetPanel) says what letting go does; it isn't a button, since the
              // swipeable's panel takes no touches in gesture handler 3.3 on iOS.
              <Swipeable
                key={k.id}
                ref={(m) => {
                  if (m) swipes.current.set(k.id, m)
                  else swipes.current.delete(k.id)
                }}
                friction={2}
                rightThreshold={40}
                onSwipeableOpenStartDrag={() => {
                  swiped.current = k.id
                }}
                onSwipeableOpen={() => {
                  swipes.current.get(k.id)?.close()
                  forget(k.id, k.name)
                }}
                onSwipeableClose={() => {
                  if (swiped.current === k.id) swiped.current = null
                }}
                renderRightActions={(_progress, translation) => (
                  <ForgetPanel translation={translation} label={f('short')} />
                )}
              >
                <Row
                  lead={<Mark size={28} />}
                  title={k.name}
                  detail={t('knownLine', {
                    address: hostOf(k.addresses[0]?.url ?? ''),
                    signedIn: String(k.signedIn),
                    when:
                      now - k.lastSeen < 60_000
                        ? 'now'
                        : relative(new Date(k.lastSeen).toISOString(), now, locale),
                  })}
                  pending={pending === k.id}
                  disabled={pending !== null}
                  onPress={() => {
                    if (swiped.current !== k.id) void openKnown(k.id)
                  }}
                  onLongPress={() => forget(k.id, k.name)}
                  action={{ label: f('forget', { name: k.name }), run: () => forget(k.id, k.name) }}
                  style={{ backgroundColor: theme.colors.s1 }}
                />
              </Swipeable>
            ))}
          </Group>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Label
          aside={
            lan === 'refused' ? null : scanning ? (
              <Text variant="caption" color="text-3" accessibilityLiveRegion="polite">
                {lan === 'asking' ? t('waiting') : t('looking')}
              </Text>
            ) : (
              <Button variant="ghost" size="sm" onPress={rescan}>
                {t('lookAgain')}
              </Button>
            )
          }
        >
          {t('nearby')}
        </Label>
        {lan === 'allowed' && nearby.length > 0 && (
          <Group>
            {nearby.map((s) => (
              <Row
                key={s.info.id}
                lead={<Mark size={28} />}
                title={s.info.name}
                detail={hostOf(s.base)}
                disabled={pending !== null}
                onPress={() => openNearby(s)}
              />
            ))}
          </Group>
        )}
        {lan === 'asking' && (
          <Text variant="callout" color="text-3">
            {t('asking')}
          </Text>
        )}
        {lan === 'refused' && (
          <Text variant="callout" color="text-3">
            {t('refused')}
          </Text>
        )}
        {lan === 'allowed' && !scanning && nearby.length === 0 && (
          <Text variant="callout" color="text-3">
            {found.length > 0 ? t('onlyKnown') : t('none')}
          </Text>
        )}
      </View>

      <View style={{ gap: 12 }}>
        <Field label={t('addLabel')} hint={t('addHint')} error={error ?? undefined}>
          <Input
            value={address}
            onChangeText={setAddress}
            placeholder="harbor.example.net"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            // the field's own text: state can be a keystroke behind when Return follows at once
            onSubmitEditing={(e) => void add(e.nativeEvent.text)}
            mono
            invalid={!!error}
          />
        </Field>
        <Button
          variant="primary"
          block
          loading={pending === 'typed'}
          disabled={pending !== null && pending !== 'typed'}
          onPress={() => void add(address)}
        >
          {t('connect')}
        </Button>
      </View>

      <Cloud />
    </Screen>
  )
}

/** Find my servers with a highsea account, collapsed and explained as the prototype has it:
 * highsea cloud isn't built yet, so it says what it will do and that it's optional. */
function Cloud() {
  const t = useT(messages)
  const theme = useTheme()
  return (
    <View
      style={{
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: theme.colors.line,
      }}
    >
      <Disclosure icon="globe" title={t('cloud')}>
        <Text variant="caption" color="text-3">
          {t('cloudDetail')}
        </Text>
      </Disclosure>
    </View>
  )
}
