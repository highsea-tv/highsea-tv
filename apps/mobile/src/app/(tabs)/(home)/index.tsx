// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home on the phone (client-home.md#mobile), from the prototype's mobile/home.tsx: the locked
// Tabs + carousel layout. The header, the owner's announcement card, the featured carousel (78%
// wide cards with the next one peeking, never moving by itself), then Continue watching (stills,
// 62% wide) and poster rows (about 30% wide, three and a peek). Pull to refresh. Built-in rows
// have no title from the server; they're named here.
import type { ClientItem, HomeSection } from '@highsea-tv/api-contract'
import { useHome } from '@highsea-tv/client/data'
import { createFormat } from '@highsea-tv/client/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import {
  Button,
  EmptyState,
  Poster,
  Press,
  Row,
  Text,
  tokens,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useMemo } from 'react'
import { ActivityIndicator, FlatList, View } from 'react-native'
import { GUTTER, Screen } from '../../../kit.tsx'
import { useMedia } from '../../../lib/media.ts'
import { home as messages } from '../../../messages.ts'
import { AnnouncementCard, Header, Reachable } from '../../../shell.tsx'

type T = ReturnType<typeof useT<typeof messages>>

const titleOf = (s: HomeSection, t: T) =>
  s.title ?? (s.id === 'continue' ? t('continue') : s.id === 'recent' ? t('recent') : '')

export const openMovie = (id: number) => router.push(`/movies/${id}`)

export function PosterRow({
  title,
  suffix,
  items,
}: {
  title: string
  suffix?: string | null
  items: ClientItem[]
}) {
  const media = useMedia()
  const width = usePosterWidth()
  return (
    <Row
      title={title}
      suffix={suffix}
      items={items}
      itemWidth={width}
      keyOf={(m) => String(m.id)}
      render={(m) => (
        <Poster
          title={m.title}
          src={media(m.art.poster)}
          width={width}
          onPress={() => openMovie(m.id)}
          progress={m.progress !== null ? m.progress * 100 : undefined}
        />
      )}
    />
  )
}

function Featured({ section }: { section: HomeSection }) {
  const theme = useTheme()
  const media = useMedia()
  const width = usePosterWidth(0.78)
  return (
    <FlatList
      horizontal
      data={section.items}
      keyExtractor={(m) => String(m.id)}
      accessibilityLabel={section.title ?? undefined}
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + 12}
      decelerationRate="fast"
      contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
      renderItem={({ item: m }) => (
        <Press
          onPress={() => openMovie(m.id)}
          accessibilityRole="button"
          accessibilityLabel={m.title}
          style={{
            width,
            aspectRatio: 4 / 5,
            borderRadius: tokens.radius.lg,
            overflow: 'hidden',
            backgroundColor: theme.colors.s2,
            justifyContent: 'flex-end',
          }}
        >
          <Image
            source={media(m.art.poster)}
            style={{ position: 'absolute', inset: 0 }}
            contentFit="cover"
            transition={150}
          />
          {/* React Native draws CSS gradients itself (https://reactnative.dev/docs/view-style-props#backgroundimage) */}
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(0deg, ${theme.colors.bg} 2%, transparent 55%)`,
            }}
          />
          <View style={{ padding: 16, gap: 4 }}>
            <Text
              variant="caption"
              size={11}
              weight={600}
              color="accent-text"
              style={{ textTransform: 'uppercase', letterSpacing: 1.1 }}
            >
              {[m.year, m.genres[0]].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="largeTitle" size={24} numberOfLines={2}>
              {m.title}
            </Text>
          </View>
        </Press>
      )}
    />
  )
}

function ContinueRow({ section, title }: { section: HomeSection; title: string }) {
  const media = useMedia()
  const locale = useLocale()
  const format = useMemo(() => createFormat(locale), [locale])
  const width = usePosterWidth(0.62)
  return (
    <Row
      title={title}
      items={section.items}
      itemWidth={width}
      keyOf={(m) => String(m.id)}
      render={(m) => (
        <Poster
          title={m.title}
          src={media(m.art.backdrop)}
          aspect="still"
          width={width}
          onPress={() => router.push(`/play/${m.id}`)}
          progress={(m.progress ?? 0) * 100}
          showTitle
          caption={format.left(m) ?? undefined}
        />
      )}
    />
  )
}

export default function Home() {
  const t = useT(messages)
  const theme = useTheme()
  const home = useHome('ios')
  return (
    <Reachable>
      <Screen tabs padded={false} gap={24} refreshing={false} onRefresh={home.refetch}>
        <View style={{ paddingHorizontal: GUTTER, gap: 16 }}>
          <Header />
          <AnnouncementCard />
        </View>
        {home.status === 'loading' ? (
          <View style={{ paddingTop: 80, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors['text-3']} />
          </View>
        ) : home.status === 'error' ? (
          <View style={{ paddingHorizontal: GUTTER, paddingTop: 40 }}>
            <EmptyState
              tone="error"
              icon="alert"
              title={t('failed')}
              action={<Button onPress={home.refetch}>{t('tryAgain')}</Button>}
            >
              {home.error.message}
            </EmptyState>
          </View>
        ) : home.data.length === 0 ? (
          <View style={{ paddingHorizontal: GUTTER, paddingTop: 40 }}>
            <EmptyState icon="movie" title={t('emptyTitle')}>
              {t('emptyBody')}
            </EmptyState>
          </View>
        ) : (
          home.data.map((s) =>
            s.layout === 'hero' ? (
              <Featured key={s.id} section={s} />
            ) : s.layout === 'continue' ? (
              <ContinueRow key={s.id} section={s} title={titleOf(s, t)} />
            ) : (
              // spotlights read as rows on a phone: there's no room for a synopsis beside the art
              <PosterRow key={s.id} title={titleOf(s, t)} suffix={s.suffix} items={s.items} />
            ),
          )
        )}
      </Screen>
    </Reachable>
  )
}
