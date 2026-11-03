// SPDX-License-Identifier: AGPL-3.0-only
// C1's Choose a server (connectivity.md), one screen for every client, laid out by the form factor.
// On touch and with a pointer, the prototype's client/connect-flow.tsx: the servers this device has
// used, the servers answering on this network (Bonjour, or the mock's stand-in), an address field,
// and Find my servers with a highsea account, collapsed and explained. On the TV, the prototype's
// tv/connect.tsx list: the servers it knows, then the ones answering, the only one answering taken
// without asking when none is known yet (zero configuration). Choosing one makes it the server in
// use, and leads to its sign-in, or Home when this device is still signed in there. A
// `highsea://connect?address=` link fills the address in. A known server is forgotten by swiping its
// row on touch, by pressing it long, or by VoiceOver's action (the owner's answer of 2026-10-29).
import type { PublicInfo } from '@highsea-tv/api-contract'
import {
  candidates,
  connectMessages,
  forgetMessages,
  hostOf,
  seenWhen,
  tvConnectMessages,
} from '@highsea-tv/client/gate'
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { type Nearby, useNearby } from '@highsea-tv/native/nearby'
import { useServers } from '@highsea-tv/native/servers'
import {
  Button,
  Disclosure,
  Field,
  Input,
  Mark,
  Text,
  tokens,
  useControl,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { Focusable } from '@highsea-tv/ui/tv'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable'
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated'
import { useBack, useLeaveOnBack } from '../back.tsx'

import { useForget } from '../forget.tsx'
import { useKeepsServers } from '../host'
import {
  GateFrame,
  goBack,
  ListItem,
  MARK,
  Notice,
  SectionLabel,
  SectionNote,
  TV_MARK,
  TvIdentity,
} from '../kit.tsx'
import { useOpenServer } from '../open-server.ts'

const { space } = tokens

/**
 * Where a server leads: its sign-in, or Home when this device is still signed in there. Another
 * server than the one in use mounts a new navigator, which opens on its phase's first screen by
 * itself (../_layout.tsx's Nav), so only the server already in use is led there from here: going
 * twice would open its sign-in twice, and the TV would ask for two codes.
 */
function useArrive() {
  const servers = useServers()
  const inUse = servers.current?.server.id
  return (id: string) => {
    if (id !== inUse) return
    router.replace(servers.known.find((k) => k.id === id)?.signedIn ? '/' : '/sign-in')
  }
}

export default function Connect() {
  const tv = useFormFactor().input === 'tv'
  const servers = useServers()
  // a plain browser is its own server's, with no list to choose from: it goes home
  if (!useKeepsServers() && servers.current) return <Redirect href="/" />
  return tv ? <TvServers /> : <ChooseServer />
}

// ---------------------------------------------------------------- touch and pointer

/** How far a swipe opens before letting go forgets: Mail's full swipe, at a row's height and more. */
const SWIPE_PANEL = space['16'] + space['6']

/**
 * What letting go of a swipe does, drawn only where the row has moved away from. The panel keeps
 * its width so the swipeable can measure how far it opens.
 */
function ForgetPanel({ translation, label }: { translation: SharedValue<number>; label: string }) {
  const theme = useTheme()
  const reveal = useAnimatedStyle(() => ({ width: Math.max(0, -translation.value) }))
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width: SWIPE_PANEL }}
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
            width: SWIPE_PANEL,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="body" weight={600} color="on-danger">
            {label}
          </Text>
        </View>
      </Animated.View>
    </View>
  )
}

function ChooseServer() {
  const t = useT(connectMessages)
  const f = useT(forgetMessages)
  const theme = useTheme()
  const locale = useLocale()
  const touch = useFormFactor().input === 'touch'
  const servers = useServers()
  const arrive = useArrive()
  const { forget, prompt } = useForget()
  const keeps = useKeepsServers()
  const open = useOpenServer()
  // The row under a swipe still sees the finger lift as a press, so a row being swiped, or left
  // open, doesn't open its server.
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

  const opened = (info: PublicInfo, base: string) => {
    if (!info.setupComplete) return open.notSetUp(info, base)
    void servers.add(info, base).then(() => arrive(info.id))
    return null
  }

  const add = async (typed: string) => {
    const tries = candidates(typed)
    if (!tries) return setError(t('invalid'))
    setPending('typed')
    setError(null)
    try {
      for (const base of tries) {
        const info = await servers.probe(base)
        if (info) return setError(opened(info, base))
      }
      setError(t('unreachable', { address: typed.trim() }))
    } catch {
      // keeping the server failed (the device's storage): nothing was added
      setError(t('unreachable', { address: typed.trim() }))
    } finally {
      setPending(null)
    }
  }

  const openKnown = async (id: string) => {
    setPending(id)
    setRowError(null)
    const refused = await open.openKnown(id)
    setPending(null)
    if (refused) setRowError(refused)
    else arrive(id)
  }

  const knownRow = (k: (typeof servers.known)[number]) => (
    <ListItem
      lead={<Mark size={MARK} />}
      title={k.name}
      detail={t('knownLine', {
        address: hostOf(k.addresses[0]?.url ?? ''),
        signedIn: String(k.signedIn),
        when: ((w) => (w === 'now' ? w : relative(w, now, locale)))(seenWhen(k.lastSeen, now)),
      })}
      pending={pending === k.id}
      disabled={pending !== null}
      onPress={() => {
        if (swiped.current !== k.id) void openKnown(k.id)
      }}
      // a plain browser has only its own server, with nothing to forget it for
      onLongPress={keeps ? () => forget(k.id, k.name) : undefined}
      action={
        keeps
          ? { label: f('forget', { name: k.name }), run: () => forget(k.id, k.name) }
          : undefined
      }
      style={{ backgroundColor: theme.colors.s1 }}
    />
  )

  return (
    <GateFrame
      title={t('title')}
      flush
      back={servers.current ? { label: t('back'), run: goBack } : undefined}
    >
      <View style={{ gap: space['6'] }}>
        {rowError ? (
          <View style={{ paddingHorizontal: space['3'] }}>
            <Notice>{rowError}</Notice>
          </View>
        ) : null}

        {servers.known.length > 0 ? (
          <View style={{ gap: space['1'] }}>
            <SectionLabel>{t('yourServers')}</SectionLabel>
            {servers.known.map((k) =>
              touch && keeps ? (
                // Swiping a row open asks to forget it, as Mail's full swipe does, and the row
                // closes again (https://docs.swmansion.com/react-native-gesture-handler/docs/components/reanimated_swipeable).
                <Swipeable
                  key={k.id}
                  ref={(m) => {
                    if (m) swipes.current.set(k.id, m)
                    else swipes.current.delete(k.id)
                  }}
                  friction={2}
                  rightThreshold={space['10']}
                  containerStyle={{ borderRadius: tokens.radius.sm }}
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
                  {knownRow(k)}
                </Swipeable>
              ) : (
                <View key={k.id}>{knownRow(k)}</View>
              ),
            )}
          </View>
        ) : null}

        <View style={{ gap: space['1'] }}>
          <SectionLabel
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
          </SectionLabel>
          {lan === 'allowed'
            ? nearby.map((s) => (
                <ListItem
                  key={s.info.id}
                  lead={<Mark size={MARK} paint="mono" />}
                  title={s.info.name}
                  detail={hostOf(s.base)}
                  mono
                  disabled={pending !== null}
                  onPress={() => setRowError(opened(s.info, s.base))}
                />
              ))
            : null}
          {lan === 'asking' ? <SectionNote>{t('asking')}</SectionNote> : null}
          {lan === 'refused' ? <SectionNote>{t('refused')}</SectionNote> : null}
          {lan === 'allowed' && !scanning && nearby.length === 0 ? (
            <SectionNote>{found.length > 0 ? t('onlyKnown') : t('none')}</SectionNote>
          ) : null}
        </View>

        <View style={{ gap: space['3'], paddingHorizontal: space['3'], alignItems: 'flex-start' }}>
          <View style={{ alignSelf: 'stretch' }}>
            <Field label={t('addLabel')} hint={t('addHint')} error={error ?? undefined}>
              <Input
                value={address}
                onChangeText={setAddress}
                placeholder={t('addPlaceholder')}
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
          </View>
          <Button
            loading={pending === 'typed'}
            disabled={pending !== null && pending !== 'typed'}
            onPress={() => void add(address)}
          >
            {t('connect')}
          </Button>
        </View>

        <View
          style={{
            marginHorizontal: space['3'],
            paddingTop: space['4'],
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.line,
          }}
        >
          <Disclosure icon="globe" title={t('cloud')}>
            <Text variant="caption" color="text-3">
              {t('cloudDetail')}
            </Text>
          </Disclosure>
        </View>
      </View>
      {prompt}
    </GateFrame>
  )
}

// ---------------------------------------------------------------- the TV

/** The servers this TV knows, then the ones answering on this network. */
function TvServers() {
  const t = useT(tvConnectMessages)
  const c = useT(connectMessages)
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const servers = useServers()
  const nearby = useNearby()
  const arrive = useArrive()
  const open = useOpenServer()
  const [error, setError] = useState<string | null>(null)
  // Back from here: where Another server was asked from; with no server, it's the first screen,
  // and Back leaves the app
  useBack(() => {
    if (!servers.current) return false
    goBack()
    return true
  })
  useLeaveOnBack(!servers.current)

  const choose = async (n: Nearby) => {
    // a server nobody has set up yet is set up in a browser first (connectivity.md)
    if (!n.info.setupComplete) return setError(open.notSetUp(n.info, n.base))
    setError(null)
    const k = servers.known.find((s) => s.id === n.info.id)
    if (k) await servers.use(k.id)
    else await servers.add(n.info, n.base)
    arrive(n.info.id)
  }

  // zero configuration: the only server answering, with none known yet, is the one
  const took = useRef(false)
  useEffect(() => {
    if (took.current || servers.known.length > 0 || nearby.scanning) return
    const only = nearby.found.length === 1 ? nearby.found[0] : undefined
    if (!only?.info.setupComplete) return
    took.current = true
    void choose(only)
  })

  const others = nearby.found.filter((n) => !servers.known.some((k) => k.id === n.info.id))
  const rows = [
    ...servers.known.map((k) => ({
      id: k.id,
      name: k.name,
      line: hostOf(k.addresses[0]?.url ?? ''),
      pick: async () => {
        setError(null)
        const refused = await open.openKnown(k.id)
        if (refused) setError(refused)
        else arrive(k.id)
      },
    })),
    ...others.map((n) => ({
      id: n.info.id,
      name: n.info.name,
      line: hostOf(n.base),
      pick: () => choose(n),
    })),
  ]
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        gap: tokens.tv.poster.gap * u,
        paddingHorizontal: tokens.tv.safe.x * u,
        paddingVertical: tokens.tv.safe.y * u,
        backgroundColor: theme.colors.bg,
      }}
    >
      {servers.current ? <TvIdentity /> : <Mark size={TV_MARK} />}
      <Text variant="heroTitle" accessibilityRole="header">
        {t('serversTitle')}
      </Text>
      <View style={{ width: tokens.tv.hero.copyWidth * u, gap: m.gap }}>
        {rows.map((r, i) => (
          <Focusable
            key={r.id}
            preferred={i === 0}
            lift="row"
            label={`${r.name}, ${r.line}`}
            radius={m.radius}
            onPress={() => void r.pick()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: m.gap,
              borderRadius: m.radius,
              paddingHorizontal: m.pad,
              paddingVertical: m.gap,
              backgroundColor: theme.colors['control-overlay'],
            }}
          >
            <Mark size={TV_MARK} />
            <View style={{ flexShrink: 1 }}>
              <Text variant="button" numberOfLines={1}>
                {r.name}
              </Text>
              <Text variant="pill" color="text-2" numberOfLines={1}>
                {t('serverLine', { address: r.line })}
              </Text>
            </View>
          </Focusable>
        ))}
        {error ? <Notice>{error}</Notice> : null}
        <View
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: m.gap,
            paddingHorizontal: m.pad,
          }}
        >
          {nearby.scanning ? (
            // the words beside it say it, so assistive technology skips the spinner
            <ActivityIndicator aria-hidden color={theme.colors['text-3']} />
          ) : null}
          <Text variant="pill" color="text-3">
            {nearby.scanning ? t('looking') : t('answered', { count: rows.length })}
          </Text>
        </View>
        {/* Look again, which also holds the remote's focus while nothing has answered yet */}
        <View style={{ flexDirection: 'row' }}>
          <Button icon="refresh" hasTVPreferredFocus={rows.length === 0} onPress={nearby.rescan}>
            {c('lookAgain')}
          </Button>
        </View>
      </View>
    </View>
  )
}
