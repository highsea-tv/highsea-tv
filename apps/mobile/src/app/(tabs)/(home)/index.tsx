// SPDX-License-Identifier: AGPL-3.0-only
// C2 Home on the phone (client-home.md#mobile), from the prototype's mobile/home.tsx: the locked
// Tabs + carousel layout. The header, the owner's announcement card, the featured carousel (78%
// wide cards with the next one peeking, never moving by itself), then Continue watching (stills,
// 62% wide, with the bar under the art) and rows of 16:9 stills (46% wide, two and a peek), each
// with its title under the art. Holding a Continue watching card opens its menu: go to the film,
// mark it watched, or take it off the row, in iOS's action sheet as the film page's choices are.
// Pull to refresh. Built-in rows have no title from the server; they're named here.
import type { HomeSection } from '@highsea-tv/api-contract'
import { useContinueActions, useHome } from '@highsea-tv/client/data'
import { createLibraryText } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import {
  Button,
  EmptyState,
  Press,
  Row,
  Text,
  tokens,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useMemo } from 'react'
import { ActivityIndicator, Alert, FlatList, View } from 'react-native'
import { ContinuePoster, FilmRow, openMovie } from '../../../cards.tsx'
import { choose } from '../../../choose.ts'
import { GUTTER, Screen } from '../../../kit.tsx'
import { home as messages } from '../../../messages.ts'
import { AnnouncementCard, Header, Reachable } from '../../../shell.tsx'

type T = ReturnType<typeof useT<typeof messages>>

const titleOf = (s: HomeSection, t: T) =>
  s.title ?? (s.id === 'continue' ? t('continue') : s.id === 'recent' ? t('recent') : '')

/** How long a film counts as new on the featured card's kicker ("New · 2010 · Fantasy"). */
const NEW_FOR = 30 * 24 * 60 * 60 * 1000

function Featured({ section }: { section: HomeSection }) {
  const t = useT(messages)
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
      renderItem={({ item: m, index }) => (
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
              {[
                // the first card says it's new, as the prototype's does, when it arrived lately
                index === 0 && Date.now() - Date.parse(m.addedAt) < NEW_FOR ? t('new') : null,
                m.year,
                m.genres[0],
              ]
                .filter(Boolean)
                .join(' · ')}
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
  const width = usePosterWidth(0.62)
  return (
    <Row
      title={title}
      items={section.items}
      itemWidth={width}
      keyOf={(m) => String(m.id)}
      render={(m) => <ContinueCard item={m} width={width} />}
    />
  )
}

/** A Continue watching card: a tap resumes, holding it opens its menu (client-home.md). */
function ContinueCard({ item, width }: { item: HomeSection['items'][number]; width: number }) {
  const t = useT(messages)
  const locale = useLocale()
  const words = useMemo(() => createLibraryText(locale).continueMenu(item), [locale, item])
  const actions = useContinueActions(item.id)
  const failed = (e: Error) => Alert.alert(t('changeFailed', { message: e.message }))
  const menu = async () => {
    const v = await choose(
      item.title,
      [
        { value: 'go', label: words.goTo.label },
        { value: 'watched', label: words.markWatched },
        { value: 'remove', label: words.remove },
      ],
      t('cancel'),
    )
    if (v === 'go') router.push(words.goTo.path as `/movies/${number}`)
    else if (v === 'watched') actions.markWatched.run().catch(failed)
    else if (v === 'remove') actions.remove.run().catch(failed)
  }
  return (
    <ContinuePoster
      item={item}
      width={width}
      onMenu={() => void menu()}
      menuLabel={t('cardMenu')}
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
              <FilmRow key={s.id} title={titleOf(s, t)} suffix={s.suffix} items={s.items} />
            ),
          )
        )}
      </Screen>
    </Reachable>
  )
}
