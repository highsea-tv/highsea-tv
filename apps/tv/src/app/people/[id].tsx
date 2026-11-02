// SPDX-License-Identifier: AGPL-3.0-only
// A person on the TV (client-people.md, the prototype's tv/person.tsx): the ambient backdrop (their
// best-rated film here, blurred and dimmed), the round portrait beside the name, what they're
// known for and how much of theirs is here, born and died, and the biography cut at four lines,
// with More when it's longer. Then a film row per department they worked in on the films here, the
// one they're known for first, each film with their role under its title (filmographyOf). Shows
// and albums join with their phases. Focus starts on the first row; Back goes back to wherever it
// was opened from.
import { usePerson } from '@highsea-tv/client/data'
import { createLibraryText, filmographyOf, LONG_BIO } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useFormat } from '@highsea-tv/native/format'
import { useMedia } from '@highsea-tv/native/media'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import { TvAmbient, TvFilmRow, TvMessage, TvPage, type ViewHandle } from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { TvHead } from '../../kit.tsx'
import { person as messages } from '../../messages.ts'

const tv = tokens.tv

/** The portrait's size, in units. */
const PHOTO = 13

export default function Person() {
  const t = useT(messages)
  const locale = useLocale()
  const facts = useMemo(() => createLibraryText(locale), [locale])
  const f = useFormat()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const id = Number(useLocalSearchParams<{ id: string }>().id)
  const found = usePerson(id)
  // the first row's card: the head's Down goes to it
  const [first, setFirst] = useState<ViewHandle | null>(null)
  const p = found.data
  const rows = useMemo(() => (p ? filmographyOf(p.credits, p.knownFor) : []), [p])
  if (found.status === 'loading')
    return (
      <View
        accessibilityState={{ busy: true }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
      >
        <ActivityIndicator size="large" color={theme.colors['text-3']} />
      </View>
    )
  if (found.status === 'error' || !p)
    return (
      <TvMessage
        title={found.error?.message ?? ''}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={() => router.replace('/search')}>
            {t('search')}
          </Button>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  const films = p.credits.filter((c) => c.inLibrary)
  const best = [...films].sort((a, b) => b.rating - a.rating)[0]
  const count = new Set(films.map((c) => c.id)).size
  const life = facts.lifeOf(p)
  const known = p.knownFor ? facts.departmentTitle(p.knownFor) : null
  return (
    <View style={{ flex: 1 }}>
      <TvAmbient source={media(best?.art.backdrop ?? null)} />
      <TvPage keep={0.4}>
        <TvHead down={first} />
        <View
          accessibilityLabel={p.name}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 3 * u,
            paddingHorizontal: tv.safe.x * u,
            paddingTop: 1 * u,
            paddingBottom: 2 * u,
          }}
        >
          <View
            style={{
              width: PHOTO * u,
              height: PHOTO * u,
              borderRadius: (PHOTO / 2) * u,
              overflow: 'hidden',
              backgroundColor: theme.colors.s1,
              boxShadow: tokens.elevation[4].boxShadow,
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
          <View style={{ maxWidth: 48 * u, gap: 1.1 * u, alignItems: 'flex-start' }}>
            <Text variant="heroTitle" size={3.6} accessibilityRole="header">
              {p.name}
            </Text>
            <Text variant="meta" color="text-2">
              {[known, facts.hereOf({ films: count })].filter(Boolean).join(' · ')}
            </Text>
            {life ? (
              <Text variant="pill" color="text-3">
                {life}
              </Text>
            ) : null}
            {p.bio ? <Bio text={p.bio} /> : null}
          </View>
        </View>
        <View style={{ gap: 1.6 * u, paddingBottom: tv.safe.y * u }}>
          {rows.map(({ department, credits }, i) => {
            const roles = new Map(credits.map((c) => [c.item.id, facts.roleNames(c.role)]))
            return (
              <TvFilmRow
                key={department}
                ref={i === 0 ? setFirst : undefined}
                preferred={i === 0}
                title={facts.departmentTitle(department)}
                items={credits.map((c) => c.item)}
                art={(m) => ({ poster: media(m.art.poster), backdrop: media(m.art.backdrop) })}
                meta={(m) =>
                  [m.year, m.runtimeMinutes ? f.runtime(m.runtimeMinutes) : null]
                    .filter(Boolean)
                    .join(' · ')
                }
                noteOf={(m) => roles.get(m.id) ?? ''}
                onOpen={(m) => router.push(`/movies/${m.id}`)}
                onPlay={(m) => router.push(`/play/${m.id}`)}
              />
            )
          })}
        </View>
      </TvPage>
    </View>
  )
}

/** A biography, cut at four lines; More shows the rest in place. */
function Bio({ text }: { text: string }) {
  const t = useT(messages)
  const u = useTheme().u
  const [open, setOpen] = useState(false)
  const long = text.length >= LONG_BIO
  return (
    <View style={{ gap: 1.1 * u, paddingTop: 0.4 * u, alignItems: 'flex-start' }}>
      <Text variant="synopsis" color="text-2" numberOfLines={long && !open ? 4 : undefined}>
        {text}
      </Text>
      {long ? (
        <Button variant="overlay" onPress={() => setOpen((x) => !x)}>
          {open ? t('less') : t('more')}
        </Button>
      ) : null}
    </View>
  )
}
