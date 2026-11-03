// SPDX-License-Identifier: AGPL-3.0-only
// The navigation shell (one-client-platform.md › A, W7), one for every client, drawn by the form
// factor around the destinations' stack:
// - touch: the phone's five-tab bar at the foot (the prototype's mobile/shell.tsx): Home, Search,
//   Library, Offline and You, which opens Settings;
// - the TV: the head (the prototype's tv/kit.tsx, @highsea-tv/ui/tv's TvHead): the server at the
//   left, Search as its icon, Home, Collections and Movies centred, then Alerts and the account,
//   which opens Settings;
// - a pointer: the web's top bar (the prototype's web/shell.tsx): the server at the left, the TV's
//   destinations centred, Alerts and the profile at the right.
// Films only, so Shows and Music wait for their phases. While the server doesn't answer, the
// destinations give way to Unreachable, with Try again, Another server and Forget this server.
import { useAnnouncements, useServer } from '@highsea-tv/client/data'
import { type destinationMessages, forgetMessages, shellMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { useCurrent } from '@highsea-tv/native/servers'
import { useMaybeSession, useReachableState } from '@highsea-tv/native/session'
import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  type IconName,
  Mark,
  Press,
  Text,
  tokens,
  useControl,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { TvHead, TvHeadStop, TvMessage, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router, Stack, usePathname } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLeaveOnBack } from '../../back.tsx'
import { useForget } from '../../forget.tsx'
import { useDevice, useKeepsServers } from '../../host'
import { HeadGoal, TAB, TAB_ROW, TvIdentity } from '../../kit.tsx'

const { space } = tokens

type Destination = { path: string; label: keyof typeof destinationMessages; icon?: IconName }

/** The phone's tabs (mobile.md#home-tabs--carousel). */
const TABS: (Destination & { icon: IconName })[] = [
  { path: '/', label: 'home', icon: 'dashboard' },
  { path: '/search', label: 'search', icon: 'search' },
  { path: '/library', label: 'library', icon: 'library' },
  { path: '/offline', label: 'offline', icon: 'download' },
  { path: '/settings', label: 'you', icon: 'user' },
]

/** The TV's and the web's destinations: Search as its icon, then each kind, Collections first. */
const DESTINATIONS: Destination[] = [
  { path: '/search', label: 'search', icon: 'search' },
  { path: '/', label: 'home' },
  { path: '/collections', label: 'collections' },
  { path: '/movies', label: 'movies' },
]

/** The kind of app the server's announcements are for. */
const useKind = () => (({ phone: 'ios', tv: 'tvos', web: 'web' }) as const)[useDevice()]

const isHere = (path: string, pathname: string) =>
  path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)

const go = (path: string) => router.navigate(path as Href)

export default function Shell() {
  const theme = useTheme()
  const input = useFormFactor().input
  const { offline } = useReachableState()
  const [goal, setGoal] = useState<ViewHandle | null>(null)
  const content = offline ? (
    <Unreachable />
  ) : (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: input === 'touch' ? undefined : 'fade',
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    />
  )
  if (input === 'touch')
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <View style={{ flex: 1 }}>{content}</View>
        <TabBar />
      </View>
    )
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {input === 'tv' ? <Head reachable={!offline} onGoal={setGoal} /> : <TopBar />}
      <HeadGoal.Provider value={goal}>
        <View style={{ flex: 1 }}>{content}</View>
      </HeadGoal.Provider>
    </View>
  )
}

/** The phone's tab bar, as the prototype draws it: s1, a line above, the accent on the current tab. */
function TabBar() {
  const t = useT(shellMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  return (
    <View
      accessibilityRole={TAB_ROW}
      accessibilityLabel={t('main')}
      style={{
        flexDirection: 'row',
        minHeight: space['16'],
        paddingBottom: insets.bottom,
        backgroundColor: theme.colors.s1,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.line,
      }}
    >
      {TABS.map((tab) => {
        const here = isHere(tab.path, pathname)
        const color = here ? 'accent-text' : 'text-3'
        return (
          <Press
            key={tab.path}
            haptic
            accessibilityRole={TAB}
            accessibilityState={{ selected: here }}
            accessibilityLabel={t(tab.label)}
            onPress={() => {
              if (!here) go(tab.path)
            }}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: space['0.5'],
              minHeight: space['16'],
            }}
          >
            <Icon name={tab.icon} size={tokens.icon.size.md} color={color} />
            <Text variant="tabLabel" color={color} maxFontSizeMultiplier={1.4}>
              {t(tab.label)}
            </Text>
          </Press>
        )
      })}
    </View>
  )
}

/**
 * The TV's head on every destination: Up from the page lands on the current destination, or on the
 * bell or the account when one of theirs is open.
 */
function Head({
  reachable,
  onGoal,
}: {
  reachable: boolean
  /** Told the stop Up lands on, which a page with no stops of its own focuses (kit's HeadGoal). */
  onGoal: (goal: ViewHandle | null) => void
}) {
  const t = useT(shellMessages)
  const pathname = usePathname()
  const alerts = isHere('/alerts', pathname)
  const account = isHere('/settings', pathname)
  const landing =
    alerts || account
      ? null
      : (DESTINATIONS.find((d) => isHere(d.path, pathname)) ?? DESTINATIONS[1])
  const fresh = useAnnouncements(useKind()).unread.length
  const person = useMaybeSession()?.user.displayName ?? ''
  const [tab, setTab] = useState<ViewHandle | null>(null)
  const [bell, setBell] = useState<ViewHandle | null>(null)
  const [me, setMe] = useState<ViewHandle | null>(null)
  const goal = landing ? tab : alerts ? bell : me
  useEffect(() => onGoal(goal), [goal, onGoal])
  return (
    <TvHead
      label={t('main')}
      goal={goal}
      reachable={reachable}
      start={<TvIdentity />}
      center={DESTINATIONS.map((d) => (
        <TvHeadStop
          key={d.path}
          ref={d === landing ? setTab : undefined}
          label={t(d.label)}
          text={d.icon ? undefined : t(d.label)}
          icon={d.icon}
          here={isHere(d.path, pathname)}
          disabled={!reachable}
          onPress={() => go(d.path)}
        />
      ))}
      end={
        <>
          <TvHeadStop
            ref={setBell}
            label={fresh ? t('alertsNew', { count: fresh }) : t('alerts')}
            icon="notification"
            dot={fresh > 0}
            here={alerts}
            disabled={!reachable}
            onPress={() => go('/alerts')}
          />
          <TvHeadStop
            ref={setMe}
            label={t('account', { name: person })}
            avatar={person}
            here={account}
            disabled={!reachable}
            onPress={() => go('/settings')}
          />
        </>
      }
    />
  )
}

/** `aria-current="page"` for the destination shown, which React Native's types don't list. */
const pageMark = (here: boolean) =>
  (here ? { 'aria-current': 'page' } : {}) as Record<string, never>

/**
 * The web's top bar: the server, the destinations, then Alerts and the profile. The server and the
 * profile go to Choose a server and Settings for now; their menus (the prototype's web/shell.tsx)
 * come with part B.
 */
function TopBar() {
  const t = useT(shellMessages)
  const theme = useTheme()
  const m = useControl()
  const pathname = usePathname()
  const current = useCurrent()
  const name = useServer().data?.name ?? current.server.name
  const away = useMaybeSession()?.away ?? false
  const person = useMaybeSession()?.user.displayName ?? ''
  const fresh = useAnnouncements(useKind()).unread.length
  // a plain browser is its own server's: its name, with no list to switch to
  const keeps = useKeepsServers()
  const identity = (
    <>
      <Mark size={m.height - m.gap} />
      <View>
        <Text variant="body" weight={600} numberOfLines={1}>
          {name}
        </Text>
        {away ? (
          <Text variant="caption" color="text-3">
            {t('remotely')}
          </Text>
        ) : null}
      </View>
    </>
  )
  const row = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: m.gap,
    minHeight: m.height,
  } as const
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: space['3'],
        minHeight: space['16'] + space['4'],
        paddingHorizontal: space['8'],
        paddingVertical: space['2'],
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.line,
        backgroundColor: theme.colors.bg,
      }}
    >
      {keeps ? (
        <Press
          onPress={() => router.push('/connect')}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${t('switchServer')}`}
          style={row}
        >
          {identity}
          <Icon name="chevron-down" size={tokens.icon.size.sm} color="text-3" />
        </Press>
      ) : (
        <View style={row}>{identity}</View>
      )}
      <View
        role="navigation"
        accessibilityLabel={t('main')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['1'],
          marginHorizontal: 'auto',
        }}
      >
        {DESTINATIONS.map((d) => {
          const here = isHere(d.path, pathname)
          // each destination a link, the one shown marked as the page (WAI-ARIA's aria-current,
          // which react-native-web hands to the element)
          return (
            <Press
              key={d.path}
              role="link"
              accessibilityLabel={t(d.label)}
              {...pageMark(here)}
              onPress={() => go(d.path)}
              style={{
                minHeight: m.height,
                minWidth: m.height,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: d.icon ? 0 : m.fieldPad,
                borderRadius: m.radius,
                backgroundColor: d.icon && here ? theme.colors.s2 : 'transparent',
              }}
            >
              {d.icon ? (
                <Icon name={d.icon} size={m.icon} color={here ? 'text' : 'text-2'} />
              ) : (
                <Text variant="body" weight={600} color={here ? 'text' : 'text-2'}>
                  {t(d.label)}
                </Text>
              )}
            </Press>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
        <Button
          variant="ghost"
          iconOnly
          icon="notification"
          accessibilityLabel={fresh ? t('alertsNew', { count: fresh }) : t('alerts')}
          onPress={() => go('/alerts')}
        />
        <Press
          onPress={() => go('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t('account', { name: person })}
          style={{ minHeight: m.height, justifyContent: 'center' }}
        >
          <Avatar name={person} size={m.height} />
        </Press>
      </View>
    </View>
  )
}

/** The server doesn't answer: what to do about it, in place of the destinations. */
function Unreachable() {
  const t = useT(shellMessages)
  const f = useT(forgetMessages)
  const theme = useTheme()
  const tv = useFormFactor().input === 'tv'
  const { retry } = useReachableState()
  const current = useCurrent()
  const { forget, prompt } = useForget()
  // a plain browser is its server's, with no list to pick another from or forget this one in
  const keeps = useKeepsServers()
  const name = current.server.name
  const another = () => router.push('/connect')
  const forgetIt = () => forget(current.server.id, name)
  // it stands in for the shell's screens, Home among them, so with nothing behind it the TV's Back
  // leaves highsea as Home's would, rather than going to a Home that isn't there
  useLeaveOnBack(!router.canGoBack())
  if (tv)
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
        <TvMessage
          title={t('unreachableTitle', { name })}
          actions={
            <>
              <Button variant="primary" hasTVPreferredFocus icon="refresh" onPress={retry}>
                {t('tryAgain')}
              </Button>
              {keeps ? (
                <>
                  <Button variant="overlay" icon="server" onPress={another}>
                    {t('anotherServer')}
                  </Button>
                  <Button variant="overlay" icon="delete" onPress={forgetIt}>
                    {f('thisServer')}
                  </Button>
                </>
              ) : null}
            </>
          }
        >
          {t('unreachableBody', { name })}
        </TvMessage>
        {prompt}
      </View>
    )
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.mobile.gutter,
        backgroundColor: theme.colors.bg,
      }}
    >
      <View style={{ width: '100%', maxWidth: space['16'] * 7 }}>
        <EmptyState
          icon="network"
          title={t('unreachableTitle', { name })}
          action={
            <View style={{ flex: 1, gap: space['2'] }}>
              <Button variant="primary" icon="refresh" block onPress={retry}>
                {t('tryAgain')}
              </Button>
              {keeps ? (
                <>
                  <Button block onPress={another}>
                    {t('switchServer')}
                  </Button>
                  <Button variant="danger-ghost" block onPress={forgetIt}>
                    {f('thisServer')}
                  </Button>
                </>
              ) : null}
            </View>
          }
        >
          {t('unreachableBody', { name })}
        </EmptyState>
      </View>
      {prompt}
    </View>
  )
}
