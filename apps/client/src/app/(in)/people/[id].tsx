// SPDX-License-Identifier: AGPL-3.0-only
// A person (the prototypes' {web,mobile,tv}/person.tsx), one screen for every client: their
// best-rated film here as the art behind them, the round portrait, the name, what they're known
// for and how much of theirs is here, born and died, and the biography cut with More when it's
// long (LONG_BIO). Then a row for each department they worked in on the films here, the one
// they're known for first, each film with their role (filmographyOf). Only what's on this server,
// as Jellyfin and Infuse do. Shows and albums join with their phases. Laid out by the form factor:
// - touch (mobile/person.tsx): Back over the blurred art, the portrait centred with the words
//   under it, the biography cut at four lines, and rows of posters with the role and year;
// - a pointer (web/person.tsx): the portrait beside the words over the blurred art, the biography
//   cut at three lines, and rows of posters with the role and year, within the page's width;
// - the TV (tv/person.tsx): the ambient backdrop, the portrait beside the words, the biography cut
//   at four lines, and a film row per department, each film with the role under its title; focus
//   starts on the first row and Back goes back where the page was opened from.
import type { Person as ClientPerson } from '@highsea-tv/api-contract'
import { usePerson } from '@highsea-tv/client/data'
import { personHeaderOf } from '@highsea-tv/client/films'
import { filmographyOf, LONG_BIO, playPath } from '@highsea-tv/client/library'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { web } from '@highsea-tv/tokens'
import {
  Button,
  EmptyState,
  FilmRow,
  PersonPortrait,
  Poster,
  Row,
  ScrollView,
  Text,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import {
  Kept,
  TV_HEAD_HEIGHT,
  TV_ROW_GAP,
  TvAmbient,
  TvMessage,
  TvPage,
  type ViewHandle,
} from '@highsea-tv/ui/tv'
import { Image } from 'expo-image'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { type Ref, useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { OverlayBack } from '../../../detail/back.tsx'
import { PERSON_ART, PERSON_TV, PHONE_PERSON } from '../../../detail/layout.ts'
import { personMessages } from '../../../detail/messages.ts'
import {
  filmPath,
  idOf,
  isMissing,
  Middle,
  useHero,
  useRowWidths,
  useTexts,
} from '../../../detail/parts.tsx'
import { PersonSkeleton } from '../../../detail/skeletons.tsx'
import { ROW_KEEP } from '../../../keep.ts'
import { useChromeOverlay, useHeadDown } from '../../../kit.tsx'
import { libraryScreenMessages } from '../../../library/messages.ts'

const { space } = tokens
const tv = tokens.tv

export default function Person() {
  const id = idOf(useLocalSearchParams<{ id: string }>().id)
  if (id === null) return <PersonMissing />
  return <Load key={id} id={id} />
}

function Load({ id }: { id: number }) {
  const input = useFormFactor().input
  const found = usePerson(id)
  if (found.status === 'loading') return <PersonSkeleton />
  if (found.status === 'error') return <PersonMissing error={found.error} />
  if (input === 'tv') return <TvPerson p={found.data} />
  return <PagePerson p={found.data} />
}

/** Not found, or a read that failed, with Search as the way out (every prototype's). */
function PersonMissing({ error }: { error?: Error | null }) {
  const t = useT(personMessages)
  const words = useT(libraryScreenMessages)
  const input = useFormFactor().input
  const title = isMissing(error) ? t('missingTitle') : (error?.message ?? t('missingTitle'))
  const search = () => router.navigate('/search')
  if (input === 'tv')
    return (
      <TvMessage
        title={title}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={search}>
            {words('search')}
          </Button>
        }
      >
        {t('gone')}
      </TvMessage>
    )
  return (
    <Middle back={input === 'touch'}>
      <EmptyState
        icon="user"
        tone="error"
        title={title}
        action={
          <Button variant="primary" onPress={search}>
            {words('search')}
          </Button>
        }
      >
        {t('gone')}
      </EmptyState>
    </Middle>
  )
}

/** What the header says: "Acting · 3 movies here", and born and died. */
function useHeader(p: ClientPerson) {
  const { facts } = useTexts()
  const { best, count } = personHeaderOf(p.credits)
  const rows = useMemo(() => filmographyOf(p.credits, p.knownFor), [p])
  return {
    best,
    rows,
    known: [p.knownFor ? facts.departmentTitle(p.knownFor) : null, facts.hereOf({ films: count })]
      .filter(Boolean)
      .join(' · '),
    life: facts.lifeOf(p),
  }
}

/**
 * A biography, cut at `lines` when it's long, with More to show the rest in place: on the phone in
 * text-2 at 15 on 1.45 (mobile/person.tsx's Bio), with a pointer the page's body, on the TV the
 * synopsis's type.
 */
function Bio({ text, lines, ref }: { text: string; lines: number; ref?: Ref<ViewHandle> }) {
  const t = useT(personMessages)
  const m = useControl()
  const input = useFormFactor().input
  const tv = input === 'tv'
  const [open, setOpen] = useState(false)
  const long = text.length >= LONG_BIO
  const phone = PHONE_PERSON.bio
  const size = input === 'touch' ? phone.size : undefined
  return (
    <View style={{ gap: input === 'touch' ? space['2'] : m.gap, alignItems: 'flex-start' }}>
      <Text
        variant={tv ? 'synopsis' : 'body'}
        color={input === 'pointer' ? 'text' : 'text-2'}
        size={size}
        leading={input === 'touch' ? phone.leading : undefined}
        numberOfLines={long && !open ? lines : undefined}
      >
        {text}
      </Text>
      {long ? (
        <Button
          ref={ref}
          variant={tv ? 'overlay' : 'ghost'}
          size={tv ? 'md' : 'sm'}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((x) => !x)}
        >
          {open ? t('less') : t('more')}
        </Button>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------- touch and a pointer

function PagePerson({ p }: { p: ClientPerson }) {
  const { facts } = useTexts()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const media = useMedia()
  const gutter = usePageGutter()
  const touch = useFormFactor().input === 'touch'
  const hero = useHero()
  const side = !touch && hero.overlay
  const h = useHeader(p)
  const poster = useRowWidths().poster
  // with a pointer from medium the blurred art runs under the top bar, which turns to glass as the
  // page scrolls, as the prototype's does
  const chrome = useChromeOverlay(!touch && hero.overlay)
  const words = (
    <View
      style={{
        gap: touch ? space['2'] : space['3'],
        maxWidth: space['16'] * 11,
        alignItems: side ? 'flex-start' : touch ? 'center' : 'flex-start',
        flexShrink: 1,
      }}
    >
      <Text
        variant={touch ? 'largeTitle' : 'display'}
        align={touch ? 'center' : 'left'}
        accessibilityRole="header"
      >
        {p.name}
      </Text>
      <View style={{ gap: touch ? space['2'] : space['1'] }}>
        <Text variant={touch ? 'callout' : 'body'} color="text-2" align={touch ? 'center' : 'left'}>
          {h.known}
        </Text>
        {h.life ? (
          <Text
            variant={touch ? 'caption' : 'body'}
            color="text-3"
            align={touch ? 'center' : 'left'}
          >
            {h.life}
          </Text>
        ) : null}
      </View>
      {!touch && p.bio ? <Bio text={p.bio} lines={3} /> : null}
    </View>
  )
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {touch ? <OverlayBack /> : null}
      <ScrollView
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
        contentContainerStyle={{
          paddingBottom: touch ? space['6'] : space['16'],
          gap: touch ? PHONE_PERSON.sections : space['10'],
        }}
      >
        <View style={{ overflow: 'hidden' }}>
          {h.best?.art.backdrop ? (
            <Image
              source={media(h.best.art.backdrop)}
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: PERSON_ART.opacity,
                  transform: [{ scale: PERSON_ART.scale[touch ? 'touch' : 'pointer'] }],
                },
              ]}
              blurRadius={PERSON_ART.blur}
              contentFit="cover"
            />
          ) : null}
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage: `linear-gradient(0deg, ${theme.colors.bg}, transparent 70%)`,
              },
            ]}
          />
          <View
            style={{
              width: '100%',
              maxWidth: web.maxWidth,
              alignSelf: 'center',
              flexDirection: side ? 'row' : 'column',
              alignItems: side ? 'center' : touch ? 'center' : 'flex-start',
              columnGap: space['10'],
              rowGap: touch ? PHONE_PERSON.portraitGap : space['6'],
              // with a pointer clear of the top bar, then the prototype's pt-28 less the bar's height
              paddingTop: touch ? insets.top + PHONE_PERSON.top : chrome.pad + space['8'],
              paddingBottom: touch ? space['2'] : space['10'],
              paddingHorizontal: gutter,
            }}
          >
            <PersonPortrait photo={media(p.photo)} />
            {words}
          </View>
        </View>
        {touch && p.bio ? (
          <View style={{ paddingHorizontal: gutter }}>
            <Bio text={p.bio} lines={4} />
          </View>
        ) : null}
        <View
          style={{
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            gap: space['10'],
          }}
        >
          {h.rows.map(({ department, credits }) => (
            <Row
              key={department}
              title={facts.departmentTitle(department)}
              items={credits}
              itemWidth={poster}
              keyOf={(c) => String(c.item.id)}
              render={({ item: m, role }) => (
                <Poster
                  title={m.title}
                  src={media(m.art.poster)}
                  width={poster}
                  showTitle
                  caption={[facts.roleNames(role), m.year].filter(Boolean).join(' · ')}
                  onPress={() => router.push(filmPath(m.id))}
                />
              )}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------- the TV

/** The first row's, under the header (tv/person.tsx's first group's data-keep). */
const FIRST_ROW_KEEP = 0.72

function TvPerson({ p }: { p: ClientPerson }) {
  const { facts, films } = useTexts()
  const theme = useTheme()
  const u = theme.u
  const media = useMedia()
  const h = useHeader(p)
  // the ambient art runs under the head, and Down from it goes to More, else the first row, as the
  // prototype's down={long ? 'bio' : groups[0]}
  const [down, setDown] = useState<ViewHandle | null>(null)
  const downRef = useCallback((v: ViewHandle | null) => setDown(v), [])
  const long = (p.bio?.length ?? 0) >= LONG_BIO
  // the head lies over the page and scrolls away with it, as the prototype's
  const chrome = useChromeOverlay()
  useHeadDown(down)
  const row = ({ department, credits }: (typeof h.rows)[number], i: number) => {
    const roles = new Map(credits.map((c) => [c.item.id, facts.roleNames(c.role)]))
    return (
      <FilmRow
        key={department}
        preferred={i === 0}
        ref={i === 0 && !long ? downRef : undefined}
        title={facts.departmentTitle(department)}
        items={credits.map((c) => c.item)}
        art={(x) => ({ poster: media(x.art.poster), backdrop: media(x.art.backdrop) })}
        meta={films.leadOf}
        noteOf={(x) => roles.get(x.id) ?? ''}
        onOpen={(x) => router.push(filmPath(x.id))}
        onPlay={(x) => router.push(playPath(x.id) as Href)}
      />
    )
  }
  const [first, ...rest] = h.rows
  return (
    <View style={{ flex: 1 }}>
      <TvAmbient source={media(h.best?.art.backdrop ?? null)} />
      <TvPage
        keep={ROW_KEEP}
        onScroll={chrome.onScroll}
        scrollEventThrottle={chrome.scrollEventThrottle}
      >
        {/* the header keeps the page at its top; the first row lands 0.72 of the way down the
            screen, where it sits under the header, as the prototype's */}
        <Kept rest>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: PERSON_TV.portraitGap * u,
              paddingHorizontal: tv.safe.x * u,
              // clear of the head laid over the page, then the page's gap under the head
              paddingTop: (TV_HEAD_HEIGHT + TV_ROW_GAP) * u,
              paddingBottom: tv.safe.y * u,
            }}
          >
            <PersonPortrait photo={media(p.photo)} />
            <View
              style={{
                maxWidth: PERSON_TV.wordsMax * u,
                gap: tv.poster.gap * u,
                alignItems: 'flex-start',
              }}
            >
              <Text variant="heroTitle" size={PERSON_TV.name} accessibilityRole="header">
                {p.name}
              </Text>
              <Text variant="meta" color="text-2">
                {h.known}
              </Text>
              {h.life ? (
                <Text variant="pill" color="text-3">
                  {h.life}
                </Text>
              ) : null}
              {p.bio ? <Bio text={p.bio} lines={4} ref={long ? downRef : undefined} /> : null}
            </View>
          </View>
        </Kept>
        {first ? <Kept keep={FIRST_ROW_KEEP}>{row(first, 0)}</Kept> : null}
        <View
          style={{
            gap: tv.poster.gap * u,
            paddingTop: tv.poster.gap * u,
            paddingBottom: tv.safe.y * u,
          }}
        >
          {rest.map((r, i) => (
            <Kept key={r.department}>{row(r, i + 1)}</Kept>
          ))}
        </View>
      </TvPage>
    </View>
  )
}
