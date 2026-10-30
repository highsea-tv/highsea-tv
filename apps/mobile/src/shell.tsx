// SPDX-License-Identifier: AGPL-3.0-only
// The phone app's frame (mobile.md#home-tabs--carousel), from the prototype's mobile/shell.tsx:
// the five-tab bar over the content above the home indicator; the header with the server
// switcher (a sheet) and the avatar; the owner's announcements (a card on Home, or a dialog when
// it must be acknowledged); and what an unreachable server looks like.
import { useAnnouncements, useServer } from '@highsea-tv/client/data'
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { useCurrent, useServers } from '@highsea-tv/native/servers'
import { useMaybeSession, useReachableState } from '@highsea-tv/native/session'
import {
  Avatar,
  Banner,
  Button,
  Dialog,
  EmptyState,
  Icon,
  type IconName,
  Mark,
  Press,
  Sheet,
  Text,
  useTheme,
} from '@highsea-tv/ui-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import type { BottomTabBarProps } from 'expo-router/tabs'
import { type ReactNode, useState } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Cta, Inline } from './inline.tsx'
import { Center, GUTTER, Row, TAB_BAR, tabBarBottom } from './kit.tsx'
import { shell as messages } from './messages.ts'

const TABS: Record<
  string,
  { label: 'home' | 'search' | 'library' | 'offline' | 'you'; icon: IconName }
> = {
  '(home)': { label: 'home', icon: 'dashboard' },
  '(search)': { label: 'search', icon: 'search' },
  '(library)': { label: 'library', icon: 'library' },
  offline: { label: 'offline', icon: 'download' },
  '(you)': { label: 'you', icon: 'user' },
}

/** The tab bar, as the prototype draws it: s1 at 92%, a line above, the accent on the current tab. */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const t = useT(messages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('main')}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: TAB_BAR + tabBarBottom(insets.bottom),
        paddingBottom: tabBarBottom(insets.bottom),
        flexDirection: 'row',
        backgroundColor: `${theme.colors.s1}eb`,
        borderTopWidth: 1,
        borderTopColor: theme.colors.line,
      }}
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name]
        if (!tab) return null
        const focused = state.index === index
        const color = focused ? 'accent-text' : 'text-3'
        return (
          <Press
            key={route.key}
            haptic
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={t(tab.label)}
            onPress={() => {
              // as the stock bar does: a second tap reaches the tab's stack as tabPress, which
              // pops it to its first screen
              const event = emitter.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
              if (!focused && !event.defaultPrevented) navigateToTab(route.key)
            }}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <Icon name={tab.icon} size={22} color={color} />
            <Text variant="tabLabel" color={color} maxFontSizeMultiplier={1.4}>
              {t(tab.label)}
            </Text>
          </Press>
        )
      })}
    </View>
  )
}

export function useServerName() {
  const server = useServer()
  const current = useCurrent()
  return server.data?.name ?? current.server.name
}

function ServerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT(messages)
  const locale = useLocale()
  const servers = useServers()
  const current = useCurrent()
  const away = useMaybeSession()?.away ?? false
  const { offline } = useReachableState()
  const now = Date.now()
  return (
    <Sheet open={open} onClose={onClose} title={t('servers')}>
      <View style={{ gap: 4 }}>
        {servers.known.map((k) => {
          const inUse = k.id === current.server.id
          return (
            <Row
              key={k.id}
              lead={<Mark size={30} />}
              title={k.name}
              detail={
                inUse
                  ? offline
                    ? t('offLine')
                    : away
                      ? t('remotely')
                      : t('onNetwork')
                  : t('otherLine', {
                      signedIn: String(k.signedIn),
                      when:
                        now - k.lastSeen < 60_000
                          ? t('justNow')
                          : relative(new Date(k.lastSeen).toISOString(), now, locale),
                    })
              }
              trailing={inUse ? <Icon name="check" size={18} color="accent-text" /> : undefined}
              onPress={() => {
                onClose()
                if (!inUse) void servers.use(k.id)
              }}
            />
          )
        })}
      </View>
      <View style={{ marginTop: 12 }}>
        <Button
          icon="add"
          block
          onPress={() => {
            onClose()
            router.push('/connect')
          }}
        >
          {t('addServer')}
        </Button>
      </View>
    </Sheet>
  )
}

/** A tab's header: the server switcher (Home) or the tab's title, and the avatar. */
export function Header({ title }: { title?: string }) {
  const t = useT(messages)
  const name = useServerName()
  const session = useMaybeSession()
  const away = session?.away ?? false
  const [open, setOpen] = useState(false)
  const person = session?.user.displayName ?? ''
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 }}>
      {title ? (
        <Text variant="largeTitle" size={28} accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </Text>
      ) : (
        <Press
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${t('switchServer')}`}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 44,
            flexShrink: 1,
          }}
        >
          <Mark size={26} />
          <View style={{ flexShrink: 1 }}>
            <Text variant="body" size={17} weight={600} numberOfLines={1}>
              {name}
            </Text>
            {away && (
              <Text variant="caption" size={11} color="text-3">
                {t('remotely')}
              </Text>
            )}
          </View>
          <Icon name="chevron-down" size={16} color="text-3" />
        </Press>
      )}
      {person ? (
        <Press
          onPress={() => router.navigate('/you')}
          accessibilityRole="button"
          accessibilityLabel={t('profile', { name: person })}
          // a 44pt target around the 36pt avatar, the margins keeping the row as drawn
          style={{
            marginStart: 'auto',
            marginEnd: -4,
            marginVertical: -4,
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Avatar name={person} size={36} />
        </Press>
      ) : null}
      <ServerSheet open={open} onClose={() => setOpen(false)} />
    </View>
  )
}

/** The owner's announcement as Home's card: dismissible unless it must be acknowledged. */
export function AnnouncementCard() {
  const a = useAnnouncements('ios')
  const card = a.cards[0]
  if (!card) return null
  return (
    <Banner
      title={card.title}
      onDismiss={() => void a.dismiss(card.id)}
      action={card.cta ? <Cta cta={card.cta} /> : undefined}
    >
      <Text variant="callout" color="text-2">
        <Inline text={card.body} />
      </Text>
    </Banner>
  )
}

/** An announcement that must be acknowledged: it stays until Got it. */
export function AnnouncementDialog() {
  const t = useT(messages)
  const a = useAnnouncements('ios')
  const media = useMedia()
  const m = a.modal
  return (
    <Dialog
      open={!!m}
      title={m?.title ?? t('announcement')}
      footer={
        m && (
          <View style={{ gap: 8 }}>
            <Cta cta={m.cta} />
            <Button variant="primary" block onPress={() => void a.dismiss(m.id)}>
              {t('gotIt')}
            </Button>
          </View>
        )
      }
    >
      {m && (
        <View style={{ gap: 16 }}>
          {m.image && (
            <Image
              source={media(m.image)}
              style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 10 }}
              contentFit="cover"
            />
          )}
          <Text variant="body" color="text-2">
            <Inline text={m.body} />
          </Text>
        </View>
      )}
    </Dialog>
  )
}

export function Unreachable() {
  const t = useT(messages)
  const name = useCurrent().server.name
  const { retry } = useReachableState()
  return (
    <Center>
      <EmptyState
        icon="network"
        title={t('unreachableTitle', { name })}
        action={
          <View style={{ gap: 8, flex: 1 }}>
            <Button variant="primary" icon="refresh" block onPress={retry}>
              {t('tryAgain')}
            </Button>
            <Button block onPress={() => router.push('/connect')}>
              {t('switchServer')}
            </Button>
          </View>
        }
      >
        {t('unreachableBody', { name })}
      </EmptyState>
    </Center>
  )
}

/** A tab's content, or Unreachable while the server doesn't answer. */
export function Reachable({ children }: { children: ReactNode }) {
  const { offline } = useReachableState()
  return offline ? <Unreachable /> : children
}

export { GUTTER }
