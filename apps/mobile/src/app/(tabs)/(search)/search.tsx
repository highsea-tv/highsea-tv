// SPDX-License-Identifier: AGPL-3.0-only
// C6 Search on the phone (client-search.md#mobile), from the prototype's mobile/more.tsx: the
// field, quick picks while it's empty, then a section per kind as you type, the best-matching kind
// first. Movies three a row; collections and people in rows that scroll. A person searches their
// name. Kinds the phone doesn't show yet (`discover`) are skipped, as the API asks of clients. The
// query lives in this screen, which stays mounted under a result, so Back finds it as it was.
import type { SearchSection } from '@highsea-tv/api-contract'
import { useSearch } from '@highsea-tv/client/data'
import { useT } from '@highsea-tv/i18n/react'
import { Icon, Input, Poster, Press, Text, usePosterWidth } from '@highsea-tv/ui-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Chip, Grid, GUTTER, Screen } from '../../../kit.tsx'
import { useFormat } from '../../../lib/format.ts'
import { useMedia } from '../../../lib/media.ts'
import { search as messages } from '../../../messages.ts'
import { Header, Reachable, useServerName } from '../../../shell.tsx'

/** Quick picks for an empty search (the web's). */
const SUGGESTIONS = ['Comedy', 'Horror', 'Animation', 'Science Fiction', 'Drama']

const KINDS = ['movies', 'collections', 'people'] as const
type Shown = Extract<SearchSection, { kind: (typeof KINDS)[number] }>
const shown = (s: SearchSection): s is Shown => (KINDS as readonly string[]).includes(s.kind)

function Results({ section, onPerson }: { section: Shown; onPerson: (name: string) => void }) {
  const f = useFormat()
  const media = useMedia()
  const width = usePosterWidth()
  switch (section.kind) {
    case 'movies':
      return (
        <View style={{ paddingHorizontal: GUTTER }}>
          <Grid
            items={section.items}
            keyOf={(m) => String(m.id)}
            render={(m, w) => (
              <Poster
                title={m.title}
                src={media(m.art.poster)}
                width={w}
                onPress={() => router.push(`/movies/${m.id}`)}
                showTitle
                caption={m.year ? String(m.year) : undefined}
              />
            )}
          />
        </View>
      )
    case 'collections':
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 8 }}
        >
          {section.items.map((c) => (
            <Poster
              key={c.id}
              title={c.name}
              src={media(c.art.poster)}
              width={width}
              onPress={() => router.push(`/collections/${c.id}`)}
              showTitle
              caption={f.caption(c)}
            />
          ))}
        </ScrollView>
      )
    case 'people':
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
        >
          {section.items.map((p) => (
            <Press
              key={p.id}
              onPress={() => onPerson(p.name)}
              accessibilityRole="button"
              accessibilityLabel={`${p.name}, ${f.moviesHere(p.titles)}`}
              style={{ width: 72, alignItems: 'center', gap: 4 }}
            >
              <Image
                source={media(p.photo)}
                style={{ width: 64, height: 64, borderRadius: 32 }}
                contentFit="cover"
              />
              <Text
                variant="caption"
                size={12}
                color="text-2"
                numberOfLines={2}
                style={{ textAlign: 'center' }}
              >
                {p.name}
              </Text>
            </Press>
          ))}
        </ScrollView>
      )
  }
}

export default function Search() {
  const t = useT(messages)
  const name = useServerName()
  const [q, setQ] = useState('')
  const { results, settled } = useSearch(q)
  const sections = results.data?.sections.filter(shown)
  return (
    <Reachable>
      <Screen tabs padded={false} gap={20}>
        <View style={{ paddingHorizontal: GUTTER, gap: 16 }}>
          <Header title={t('title')} />
          <View style={{ justifyContent: 'center' }}>
            <Input
              value={q}
              onChangeText={setQ}
              placeholder={t('placeholder')}
              accessibilityLabel={t('field')}
              returnKeyType="search"
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={{ paddingStart: 40 }}
            />
            <View pointerEvents="none" style={{ position: 'absolute', start: 12 }}>
              <Icon name="search" size={18} color="text-3" />
            </View>
          </View>
        </View>
        {!settled.trim() ? (
          <View
            style={{ paddingHorizontal: GUTTER, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
          >
            {SUGGESTIONS.map((s) => (
              <Chip key={s} pressed={false} onPress={() => setQ(s)}>
                {s}
              </Chip>
            ))}
          </View>
        ) : results.status === 'error' ? (
          <Text variant="callout" color="badge-danger" style={{ paddingHorizontal: GUTTER }}>
            {t('failed', { message: results.error.message })}
          </Text>
        ) : !sections ? (
          <Text variant="caption" size={13} color="text-3" style={{ paddingHorizontal: GUTTER }}>
            {t('searching')}
          </Text>
        ) : sections.length === 0 ? (
          <Text variant="body" size={15} color="text-2" style={{ paddingHorizontal: GUTTER }}>
            {t('nothing', { name, query: settled.trim() })}
          </Text>
        ) : (
          <View accessibilityLiveRegion="polite" style={{ gap: 24 }}>
            {sections.map((section) => (
              <View key={section.kind} style={{ gap: 10 }}>
                <Text
                  variant="title"
                  size={17}
                  accessibilityRole="header"
                  style={{ paddingHorizontal: GUTTER }}
                >
                  {t(section.kind)}{' '}
                  <Text variant="title" size={17} weight={400} color="text-3">
                    {section.items.length}
                  </Text>
                </Text>
                <Results section={section} onPerson={setQ} />
              </View>
            ))}
          </View>
        )}
      </Screen>
    </Reachable>
  )
}
