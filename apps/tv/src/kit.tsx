// SPDX-License-Identifier: AGPL-3.0-only
// Pieces every TV screen shares (the prototype's kit.tsx, tv.md): the server identity, the
// announcement pill, the global navigation and a screen's foot. ui-native's tv/ has the focus
// stops, buttons and rows.
import { useAnnouncements } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useServers } from '@highsea-tv/native/servers'
import { useMaybeSession } from '@highsea-tv/native/session'
import { Icon, Mark, Text, tokens, useTheme } from '@highsea-tv/ui-native'
import { alpha, Focusable, type ViewHandle } from '@highsea-tv/ui-native/tv'
import { type Href, router, usePathname } from 'expo-router'
import { type ReactNode, type Ref, useState } from 'react'
import { Platform, TVFocusGuideView, View } from 'react-native'
import { shell } from './messages.ts'

const tv = tokens.tv

/** The kind of app the server tailors home and announcements to: one TV app, two platforms. */
export const appKind = Platform.OS === 'android' ? 'androidtv' : 'tvos'

/**
 * Top left: the server's mark and name, and "Connected remotely" under it when that's how. It sits
 * at the top of the page and scrolls away with it, so it never covers the rows.
 */
export function ServerIdentity() {
  const t = useT(shell)
  const u = useTheme().u
  const name = useServers().current?.server.name ?? ''
  const away = useMaybeSession()?.away ?? false
  return (
    <View
      style={{
        position: 'absolute',
        top: tv.safe.y * u,
        left: tv.safe.x * u,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.8 * u,
      }}
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

/** Top right: the owner's newest announcement, as a pill. It scrolls with the page too. */
export function AnnouncementPill() {
  const theme = useTheme()
  const u = theme.u
  const a = useAnnouncements(appKind)
  if (!a.latest || a.latest.acknowledgement === 'require') return null
  return (
    <View
      style={{
        position: 'absolute',
        top: tv.safe.y * u,
        right: tv.safe.x * u,
        maxWidth: 30 * u,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.6 * u,
        borderRadius: 999,
        paddingHorizontal: 1.2 * u,
        paddingVertical: 0.5 * u,
        backgroundColor: alpha(theme.colors.s2, 0.75),
      }}
    >
      <Icon name="announcement" size={1.1} color="text-2" />
      <Text variant="pill" color="text-2" numberOfLines={1} style={{ flexShrink: 1 }}>
        {a.latest.title}
      </Text>
    </View>
  )
}

const destinations = [
  { path: '/', label: 'home' },
  { path: '/search', label: 'search' },
  { path: '/library', label: 'library' },
  { path: '/settings', label: 'settings' },
] as const

/**
 * The global navigation (client-home.md#tv): a tab row across the top that shows while focus is in
 * it, reached by Up from the hero's actions or a screen's top row, and Down leaves it again. It's
 * always laid out, faint while unfocused, since tvOS's focus engine skips views it can't see; a
 * focus guide sends focus from the row's edges to the tab in use.
 */
export function GlobalNav({ ref }: { ref?: Ref<ViewHandle> }) {
  const t = useT(shell)
  const theme = useTheme()
  const u = theme.u
  const pathname = usePathname()
  const [inside, setInside] = useState(false)
  const active = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path))
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('main')}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        alignItems: 'center',
        paddingTop: tv.safe.y * u,
        opacity: inside ? 1 : 0.02,
      }}
    >
      <TVFocusGuideView
        autoFocus
        onFocus={() => setInside(true)}
        onBlur={() => setInside(false)}
        style={{
          flexDirection: 'row',
          gap: 0.6 * u,
          borderRadius: 999,
          padding: 0.4 * u,
          backgroundColor: alpha(theme.colors.s2, 0.85),
        }}
      >
        {destinations.map((d) => {
          const here = active(d.path)
          return (
            <Focusable
              key={d.path}
              ref={here ? ref : undefined}
              role="tab"
              selected={here}
              label={t(d.label)}
              ring={false}
              radius={999}
              onPress={() => (here ? null : router.replace(d.path as Href))}
            >
              {(focused) => (
                <View
                  style={{
                    borderRadius: 999,
                    paddingHorizontal: 1.4 * u,
                    paddingVertical: 0.5 * u,
                    backgroundColor: focused ? theme.colors.text : 'transparent',
                  }}
                >
                  <Text
                    variant="button"
                    color={focused ? 'bg' : here ? 'text' : 'text-2'}
                    numberOfLines={1}
                  >
                    {t(d.label)}
                  </Text>
                </View>
              )}
            </Focusable>
          )
        })}
      </TVFocusGuideView>
    </View>
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
