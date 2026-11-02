// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (the prototype's kit.tsx, tv.md): the server identity, the head
// with the destinations, Alerts and the account, a screen's foot, a page that scrolls by focus and
// the ambient backdrop. @highsea-tv/ui/tv has the focus stops and rows; the controls are the
// library's.
import { useAnnouncements } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import { useMaybeSession } from '@highsea-tv/native/session'
import { Mark, Text, tokens, useTheme } from '@highsea-tv/ui'
import { TvHead as Head, TvHeadStop, type ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router, usePathname } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { Platform, View } from 'react-native'
import { shell } from './messages.ts'

const tv = tokens.tv

/** The kind of app the server tailors home and announcements to: one TV app, two platforms. */
export const appKind = Platform.OS === 'android' ? 'androidtv' : 'tvos'

/**
 * The server's mark and name, and "Connected remotely" under it when that's how: the head's left
 * end, and on a full-screen message the screen's top left (`corner`).
 */
export function ServerIdentity({ corner = false }: { corner?: boolean }) {
  const t = useT(shell)
  const u = useTheme().u
  const name = useServers().current?.server.name ?? ''
  const away = useMaybeSession()?.away ?? false
  return (
    <View
      style={[
        { height: 3 * u, flexDirection: 'row', alignItems: 'center', gap: 0.8 * u },
        corner && { position: 'absolute', top: tv.safe.y * u, left: tv.safe.x * u },
      ]}
    >
      <Mark size={2} />
      <View>
        <Text variant="serverName">{name}</Text>
        {away ? (
          <Text variant="pill" color="text-2">
            {t('remotely')}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

/**
 * The destinations, Search first as its icon alone, then a destination per kind of media with
 * Collections first (the owner, 2026-10-30). Shows and Music join with their phases; Settings
 * isn't one: it's reached through the account at the head's right.
 */
const destinations = [
  { path: '/search', label: 'search', icon: 'search' },
  { path: '/', label: 'home' },
  { path: '/collections', label: 'collections' },
  { path: '/movies', label: 'movies' },
] as const

/**
 * The head on every screen but the player (@highsea-tv/ui/tv's TvHead): the server at the left,
 * the destinations centred, and Alerts and the account at the right. Up lands on the current
 * destination; on a film's or a person's page, which is none of them, on Home.
 */
export function TvHead({
  down,
  reachable = true,
}: {
  down?: ViewHandle | null
  reachable?: boolean
}) {
  const t = useT(shell)
  const pathname = usePathname()
  const active = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))
  const alerts = active('/alerts')
  const account = active('/settings')
  const landing =
    alerts || account ? null : (destinations.find((d) => active(d.path)) ?? destinations[1])
  const fresh = useAnnouncements(appKind).unread.length
  const person = useMaybeSession()?.user.displayName ?? ''
  const [tab, setTab] = useState<ViewHandle | null>(null)
  const [bell, setBell] = useState<ViewHandle | null>(null)
  const [me, setMe] = useState<ViewHandle | null>(null)
  const go = (to: string) => () => router.push(to as Href)
  return (
    <Head
      label={t('main')}
      goal={landing ? tab : alerts ? bell : me}
      down={down}
      reachable={reachable}
      start={<ServerIdentity />}
      center={destinations.map((d) => (
        <TvHeadStop
          key={d.path}
          ref={d === landing ? setTab : undefined}
          label={t(d.label)}
          text={'icon' in d ? undefined : t(d.label)}
          icon={'icon' in d ? d.icon : undefined}
          here={active(d.path)}
          disabled={!reachable}
          onPress={go(d.path)}
        />
      ))}
      end={
        <>
          {/* Alerts, in place of the banner across Home's top (the owner, 2026-10-30) */}
          <TvHeadStop
            ref={setBell}
            label={fresh ? t('alertsNew', { count: fresh }) : t('alerts')}
            icon="notification"
            dot={fresh > 0}
            here={alerts}
            disabled={!reachable}
            onPress={go('/alerts')}
          />
          {/* the account opens Settings; the profiles beside it on the prototype's page wait for
          the server (apps-catch-up.md, question 2) */}
          <TvHeadStop
            ref={setMe}
            label={t('account', { name: person })}
            avatar={person}
            here={account}
            disabled={!reachable}
            onPress={go('/settings')}
          />
        </>
      }
    />
  )
}

/** A quiet line of actions at the foot of a screen: Forget this server, under sign-in. */
export function Foot({ children }: { children: ReactNode }) {
  const u = useTheme().u
  return (
    <View
      style={{
        position: 'absolute',
        bottom: tv.safe.y * u,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 1 * u,
      }}
    >
      {children}
    </View>
  )
}
