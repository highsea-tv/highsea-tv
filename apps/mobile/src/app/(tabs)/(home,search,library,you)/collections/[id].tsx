// SPDX-License-Identifier: AGPL-3.0-only
// A collection on the phone (client-search.md#collections), from the prototype's
// mobile/collection.tsx: the backdrop with Back over it, the name, how many are here and their
// years, the overview, then its titles three a row, oldest first. A smart one says so and gives
// its rules in words.
import { useCollection } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Button, EmptyState, Poster, Text, useTheme } from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Center, Grid, GUTTER, TAB_BAR } from '../../../../kit.tsx'
import { library as messages } from '../../../../messages.ts'

export default function Collection() {
  const t = useT(messages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const f = useFormat()
  const media = useMedia()
  const { id } = useLocalSearchParams<{ id: string }>()
  const found = useCollection(id, 'ios')

  // Back over the backdrop, in the overlay look (controls.md › Looks)
  const back = (
    <View style={{ position: 'absolute', top: insets.top + 8, left: 12, zIndex: 10 }}>
      <Button
        variant="overlay"
        iconOnly
        icon="chevron-left"
        accessibilityLabel={t('back')}
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/library?view=collections')
        }
      />
    </View>
  )

  if (found.status === 'loading')
    return (
      <Center>
        {back}
        <ActivityIndicator color={theme.colors['text-3']} />
      </Center>
    )
  if (found.status === 'error')
    return (
      <Center>
        {back}
        <EmptyState
          icon="library"
          tone="error"
          title={found.error.message}
          action={<Button onPress={() => router.navigate('/search')}>{t('search')}</Button>}
        >
          {t('collectionGone')}
        </EmptyState>
      </Center>
    )

  const { collection: c, items } = found.data
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {back}
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR + insets.bottom + 24, gap: 20 }}>
        <View>
          <Image
            source={media(c.art.backdrop)}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
            contentFit="cover"
            transition={150}
          />
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent 60%)`,
            }}
          />
        </View>
        <View style={{ marginTop: -48, paddingHorizontal: GUTTER, gap: 8 }}>
          {c.smart?.words ? (
            <Text variant="caption" mono color="text-3" style={{ textTransform: 'uppercase' }}>
              {t('smartCollection')}
            </Text>
          ) : null}
          <Text variant="largeTitle" size={28} accessibilityRole="header">
            {c.name}
          </Text>
          <Text variant="callout" size={14} color="text-3">
            {[f.moviesHere(c.count), c.years].filter(Boolean).join(' · ')}
          </Text>
          {c.smart?.words ? (
            <Text variant="caption" size={13} color="text-3">
              {c.smart.words}
            </Text>
          ) : null}
          {c.overview ? (
            <Text variant="body" size={15} color="text-2" style={{ lineHeight: 22 }}>
              {c.overview}
            </Text>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: GUTTER }}>
          <Grid
            items={items}
            keyOf={(m) => String(m.id)}
            render={(m, width) => (
              <Poster
                title={m.title}
                src={media(m.art.poster)}
                width={width}
                onPress={() => router.push(`/movies/${m.id}`)}
                progress={m.progress !== null ? m.progress * 100 : undefined}
                showTitle
                caption={
                  m.progress !== null
                    ? (f.left(m) ?? undefined)
                    : m.year
                      ? String(m.year)
                      : undefined
                }
              />
            )}
          />
        </View>
      </ScrollView>
    </View>
  )
}
