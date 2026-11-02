// SPDX-License-Identifier: AGPL-3.0-only
// A person on the phone (client-people.md), from the prototype's mobile/person.tsx, as the Apple
// TV app's iPhone page lays one out: Back over their best-rated film's art here, blurred; the round
// portrait centred, the name, what they're known for and how much of theirs is here, born and
// died, and the biography cut at four lines with More. Then a row of posters for each department
// they worked in on the films here, the one they're known for first, each with their role and the
// year (filmographyOf). Shows and albums join with their phases.
import { usePerson } from '@highsea-tv/client/data'
import { createLibraryText, filmographyOf, LONG_BIO } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { Button, EmptyState, Poster, Row, Text, usePosterWidth, useTheme } from '@highsea-tv/ui'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { openMovie } from '../../../../cards.tsx'
import { Center, GUTTER, TAB_BAR } from '../../../../kit.tsx'
import { person as messages } from '../../../../messages.ts'

/** The portrait's size, in points. */
const PHOTO = 128

export default function Person() {
  const t = useT(messages)
  const locale = useLocale()
  const facts = useMemo(() => createLibraryText(locale), [locale])
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const width = usePosterWidth(0.3)
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const found = usePerson(id)
  const p = found.data
  const rows = useMemo(() => (p ? filmographyOf(p.credits, p.knownFor) : []), [p])

  // Back over the art, in the overlay look (controls.md › Looks)
  const back = (
    <View style={{ position: 'absolute', top: insets.top + 8, left: 12, zIndex: 10 }}>
      <Button
        variant="overlay"
        iconOnly
        icon="chevron-left"
        accessibilityLabel={t('back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/search'))}
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
  if (found.status === 'error' || !p)
    return (
      <Center>
        {back}
        <EmptyState
          icon="user"
          tone="error"
          title={found.error?.message ?? ''}
          action={<Button onPress={() => router.navigate('/search')}>{t('search')}</Button>}
        >
          {t('gone')}
        </EmptyState>
      </Center>
    )

  const films = p.credits.filter((c) => c.inLibrary)
  const best = [...films].sort((a, b) => b.rating - a.rating)[0]
  const count = new Set(films.map((c) => c.id)).size
  const life = facts.lifeOf(p)
  const known = p.knownFor ? facts.departmentTitle(p.knownFor) : null
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {back}
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR + insets.bottom + 24, gap: 28 }}>
        <View style={{ overflow: 'hidden' }}>
          {best?.art.backdrop ? (
            <Image
              source={media(best.art.backdrop)}
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.45,
                transform: [{ scale: 1.25 }],
              }}
              blurRadius={40}
              contentFit="cover"
            />
          ) : null}
          <View
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent 75%)`,
            }}
          />
          <View
            style={{
              alignItems: 'center',
              gap: 8,
              paddingTop: insets.top + 56,
              paddingBottom: 8,
              paddingHorizontal: GUTTER,
            }}
          >
            <View
              style={{
                width: PHOTO,
                height: PHOTO,
                borderRadius: PHOTO / 2,
                overflow: 'hidden',
                marginBottom: 12,
                backgroundColor: theme.colors.s1,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
              }}
            >
              {p.photo ? (
                <Image
                  source={media(p.photo)}
                  style={{ flex: 1 }}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : null}
            </View>
            <Text variant="largeTitle" size={28} align="center" accessibilityRole="header">
              {p.name}
            </Text>
            <Text variant="callout" color="text-2" align="center">
              {[known, facts.hereOf({ films: count })].filter(Boolean).join(' · ')}
            </Text>
            {life ? (
              <Text variant="caption" size={13} color="text-3" align="center">
                {life}
              </Text>
            ) : null}
          </View>
        </View>
        {p.bio ? <Bio text={p.bio} /> : null}
        {rows.map(({ department, credits }) => (
          <Row
            key={department}
            title={facts.departmentTitle(department)}
            items={credits}
            itemWidth={width}
            keyOf={(c) => String(c.item.id)}
            render={({ item: m, role }) => (
              <Poster
                title={m.title}
                src={media(m.art.poster)}
                width={width}
                onPress={() => openMovie(m.id)}
                showTitle
                caption={[facts.roleNames(role), m.year].filter(Boolean).join(' · ')}
              />
            )}
          />
        ))}
      </ScrollView>
    </View>
  )
}

/** A biography, cut at four lines with More when it's long. */
function Bio({ text }: { text: string }) {
  const t = useT(messages)
  const [open, setOpen] = useState(false)
  const long = text.length >= LONG_BIO
  return (
    <View style={{ paddingHorizontal: GUTTER, gap: 8, alignItems: 'flex-start' }}>
      <Text
        variant="body"
        size={15}
        color="text-2"
        style={{ lineHeight: 22 }}
        numberOfLines={long && !open ? 4 : undefined}
      >
        {text}
      </Text>
      {long ? (
        <Button variant="ghost" size="sm" onPress={() => setOpen((x) => !x)}>
          {open ? t('less') : t('more')}
        </Button>
      ) : null}
    </View>
  )
}
