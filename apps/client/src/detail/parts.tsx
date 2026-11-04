// SPDX-License-Identifier: AGPL-3.0-only
// What a film's page draws at every form factor, each part taking the form factor's own type from
// the library's Text: the meta line (year and length, the certification in a box, the genres, the
// rating, the qualities it plays in and Watched, as each prototype has them), the leading cast and
// the director, Mark as watched with the words after it, and the not-found state. Touch's and a
// pointer's rows and cards under the hero are here too; the TV's are its composition's.
import type { ClientDetail } from '@highsea-tv/api-contract'
import { useCollections, useMarkWatched } from '@highsea-tv/client/data'
import { filmsMessages, qualitiesOf } from '@highsea-tv/client/films'
import { createLibraryText, type FactCredit, peopleOf } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { ApiError } from '@highsea-tv/sdk'
import { breakpoints, formFactorLayouts } from '@highsea-tv/tokens'
import {
  Button,
  Certification,
  EmptyState,
  FactsCard,
  PersonTile,
  Poster,
  QualityTag,
  Rating,
  Row,
  Text,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui'
import { TvMessage } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useFilmsText } from '../films.ts'
import { useDeviceClient } from '../host'
import { useSay } from '../kit.tsx'
import { libraryScreenMessages } from '../library/messages.ts'
import { LibraryCollectionTile } from '../library/parts.tsx'
import { OverlayBack } from './back.tsx'
import { detailMessages } from './messages.ts'

const { space } = tokens

/** The phone's row item, a share of the row inside its gutters (mobile.md › Layout). */
const SHARE = formFactorLayouts['compact-touch'].itemShare

/** Where a film's page is, for links and presses; the player's is @highsea-tv/client's playPath. */
export const filmPath = (id: number | string) => `/movies/${id}` as Href
export const personPath = (id: number | string) => `/people/${id}` as Href

/** A pointer's hero, never shorter than 32rem; and from medium the share of the window's height
 * it fills, at most a 16:9 frame of its width (web/detail.tsx's heroHeight). */
const HERO = {
  min: space['16'] * 8,
  share: 0.82,
  frame: tokens.aspect.still[1] / tokens.aspect.still[0],
}

/**
 * A film's hero with a pointer, loaded or loading (web/detail.tsx's heroHeight): from medium it
 * runs under the top bar (`overlay`, for useChromeOverlay) and fills the first screen less the next
 * row's title peeking under it, min(82svh, 56.25vw); below medium the page starts under the bar.
 * Never under 32rem.
 */
export function useHero() {
  const window = useWindowDimensions()
  const overlay = window.width >= breakpoints.medium
  const fill = Math.min(window.height * HERO.share, window.width * HERO.frame)
  return { overlay, minHeight: overlay ? Math.max(HERO.min, fill) : HERO.min }
}

/** The id in the address as the API takes it, or null for one that can't be one. */
export const idOf = (raw: string | string[] | undefined) => {
  const text = Array.isArray(raw) ? raw[0] : raw
  if (!text || !/^\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** A read the server answered with not-found (404), as against one that failed. */
export const isMissing = (error: Error | null | undefined) =>
  !error || (error instanceof ApiError && error.code === 'not-found')

/** The words a page takes from @highsea-tv/client: the films' and the library's. */
export function useTexts() {
  const locale = useLocale()
  const films = useFilmsText()
  const facts = useMemo(() => createLibraryText(locale), [locale])
  return { films, facts }
}

/**
 * Year and length, the certification in a box, the genres (the first on the phone, two
 * elsewhere), the rating, the qualities it plays in, and Watched (the web's and the TV's line).
 */
export function Meta({ d }: { d: ClientDetail }) {
  const { films } = useTexts()
  const it = d.item
  return (
    <MetaLine
      lead={films.leadOf(it)}
      certification={d.certification}
      genres={it.genres}
      rating={it.rating}
      qualities={qualitiesOf(d.versions)}
      watched={it.watched}
    />
  )
}

/** The meta line's parts, a film's (Meta) or a show's (its years and seasons as the lead). */
export function MetaLine({
  lead,
  certification,
  genres: all,
  rating,
  qualities = [],
  watched,
}: {
  lead: string | null
  certification: string | null
  genres: string[]
  rating: number
  qualities?: string[]
  watched: boolean
}) {
  const t = useT(detailMessages)
  const m = useControl()
  const input = useFormFactor().input
  const variant = input === 'touch' ? 'callout' : input === 'tv' ? 'meta' : 'body'
  const genres = all.slice(0, input === 'touch' ? 1 : 2).join(' · ')
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: m.gap,
        rowGap: m.inset,
      }}
    >
      {lead ? (
        <Text variant={variant} color="text-2">
          {lead}
        </Text>
      ) : null}
      {certification ? <Certification>{certification}</Certification> : null}
      {genres ? (
        <Text variant={variant} color="text-2">
          {genres}
        </Text>
      ) : null}
      {rating > 0 ? <Rating value={rating} size={input === 'tv' ? undefined : space['3']} /> : null}
      {qualities.map((q) => (
        <QualityTag key={q}>{q}</QualityTag>
      ))}
      {watched && input !== 'touch' ? (
        <Text variant={variant} color="text-2">
          {t('watched')}
        </Text>
      ) : null}
    </View>
  )
}

/** "Starring" the first three, and "Directed by", each on a line of its own. */
export function Credits({ d, width }: { d: ClientDetail; width?: number }) {
  const t = useT(detailMessages)
  return <CreditLines cast={d.cast} makers={d.directors} madeBy={t('directedBy')} width={width} />
}

/** "Starring" the first three, then who made it ("Directed by", or a show's "Created by"). */
export function CreditLines({
  cast,
  makers,
  madeBy,
  width,
}: {
  cast: FactCredit[]
  makers: FactCredit[]
  madeBy: string
  width?: number
}) {
  const t = useT(detailMessages)
  const { facts } = useTexts()
  const input = useFormFactor().input
  const variant = input === 'tv' ? 'meta' : 'caption'
  if (cast.length === 0 && makers.length === 0) return null
  return (
    <View style={{ maxWidth: width }}>
      {cast.length > 0 ? (
        <Text variant={variant} color="text-2" numberOfLines={input === 'touch' ? 2 : 1}>
          <Text variant={variant} color="text-3">
            {t('starring')}
          </Text>
          {facts.names(cast.slice(0, 3))}
        </Text>
      ) : null}
      {makers.length > 0 ? (
        <Text variant={variant} color="text-2" numberOfLines={1}>
          <Text variant={variant} color="text-3">
            {madeBy}
          </Text>
          {facts.names(makers)}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * Mark as watched, or unwatched once it is: a toggle that changes at once, then refreshes the page
 * and says what happened (the films' words after it). A press while one is on its way is let go,
 * and one that fails is undone, with why.
 */
export function useWatched(d: ClientDetail, refresh: () => void) {
  const t = useT(detailMessages)
  const { films } = useTexts()
  const say = useSay()
  const mark = useMarkWatched(d.item.id)
  const [on, setOn] = useState(d.item.watched)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  // the server's answer once the page is read again, unless a change is still on its way
  useEffect(() => {
    if (!pending.current) setOn(d.item.watched)
  }, [d.item.watched])
  const words = films.markWatched({ ...d.item, watched: on })
  return {
    label: words.label,
    on,
    error,
    toggle: async () => {
      if (pending.current) return
      pending.current = true
      const became = !on
      setOn(became)
      setError(null)
      try {
        await mark.run(became)
        const toast = words.toast(became)
        say({ title: toast.title, body: toast.description })
        refresh()
      } catch (e) {
        setOn(!became)
        setError(t('markFailed', { message: (e as Error).message }))
      } finally {
        pending.current = false
      }
    },
  }
}

/**
 * Not found, or a read that failed: the server's words (or the spec's for a title that isn't
 * here), what may have happened, and the way out each prototype gives (client-detail.md ›
 * Errors): Go home on touch and with a pointer, Movies on the TV.
 */
export function FilmMissing({ error }: { error?: Error | null }) {
  const t = useT(detailMessages)
  const words = useT(libraryScreenMessages)
  const input = useFormFactor().input
  const title = isMissing(error) ? t('missingTitle') : (error?.message ?? t('missingTitle'))
  if (input === 'tv')
    return (
      <TvMessage
        title={title}
        actions={
          <Button variant="primary" hasTVPreferredFocus onPress={() => router.replace('/movies')}>
            {words('movies')}
          </Button>
        }
      >
        {t('missingBody')}
      </TvMessage>
    )
  return (
    <Middle back={input === 'touch'}>
      <EmptyState
        icon="movie"
        tone="error"
        title={title}
        action={<Button onPress={() => router.replace('/')}>{t('goHome')}</Button>}
      >
        {input === 'pointer' ? t('missingBodyWeb') : t('missingBody')}
      </EmptyState>
    </Middle>
  )
}

/**
 * In the middle of the page, no wider than the gate's card, as the prototypes' empty states; by
 * touch with Back over it (`back`), as every page with its own Back has.
 */
export function Middle({ children, back = false }: { children: ReactNode; back?: boolean }) {
  const theme = useTheme()
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: tokens.mobile.gutter,
        backgroundColor: theme.colors.bg,
      }}
    >
      {back ? <OverlayBack /> : null}
      <View style={{ width: '100%', maxWidth: space['16'] * 7, alignItems: 'center' }}>
        {children}
      </View>
    </View>
  )
}

/** The web's stills in a film page's rows: clamp(15rem, 24vw, 21rem). */
const STILL = { min: space['16'] * 3 + space['12'], share: 0.24, max: space['16'] * 5 + space['4'] }

/**
 * The page's widths for its rows' items, by the form factor (the prototypes' rows), which its
 * skeleton shares so the page doesn't move as it loads: by touch shares of the row; with a
 * pointer stills at clamp(15rem, 24vw, 21rem), portraits at 8rem and posters at 10rem.
 */
export function useRowWidths() {
  const input = useFormFactor().input
  const window = useWindowDimensions()
  const still = usePosterWidth(SHARE * 1.5)
  const person = usePosterWidth(SHARE * 0.8)
  const poster = usePosterWidth()
  if (input === 'touch') return { still, person, poster }
  return {
    still: Math.min(STILL.max, Math.max(STILL.min, window.width * STILL.share)),
    person: space['16'] * 2,
    poster: space['10'] * 4,
  }
}

/**
 * Touch's and a pointer's rows under the hero: More like this as stills with their titles and
 * years, the collection it's in (with its art when Collections lists it), Cast and crew (each
 * opening the person's page), then About, Information, and Languages and quality as cards: side by
 * side with a pointer (three in a wide window, two from medium with About across both).
 */
export function Below({ d }: { d: ClientDetail }) {
  const t = useT(detailMessages)
  const { facts } = useTexts()
  const media = useMedia()
  const w = useRowWidths()
  const ref = d.collection
  const collection = useFilmCollection(d)
  const people = peopleOf(d)
  return (
    <>
      {d.related.length > 0 ? (
        <Row
          title={t('moreLike')}
          items={d.related}
          itemWidth={w.still}
          keyOf={(r) => r.id}
          render={(r) => (
            <Poster
              title={r.title}
              src={media(r.art.backdrop)}
              aspect="still"
              width={w.still}
              showTitle
              caption={r.year ? String(r.year) : undefined}
              onPress={() => router.push(filmPath(r.id))}
            />
          )}
        />
      ) : null}
      {ref ? (
        <Row
          title={t('collections')}
          items={[ref]}
          itemWidth={w.poster}
          keyOf={(c) => String(c.id)}
          render={(c) => <CollectionTile of={c} collection={collection} width={w.poster} />}
        />
      ) : null}
      {people.length > 0 ? (
        <Row
          title={t('people')}
          items={people}
          itemWidth={w.person}
          keyOf={(c) => c.id}
          render={(c) => (
            <PersonTile
              name={c.name}
              role={facts.role(c)}
              photo={media(c.photo)}
              width={w.person}
              onPress={() => router.push(personPath(c.personId))}
            />
          )}
        />
      ) : null}
      <Cards d={d} />
    </>
  )
}

/**
 * The collection a film is in as Collections lists it, for its art and what it holds: the film's
 * page has only its id and name (CollectionRef), and the list has its tile.
 */
export function useFilmCollection(d: ClientDetail) {
  const collections = useCollections(useDeviceClient())
  const ref = d.collection
  if (!ref) return null
  return collections.data?.find((c) => String(c.id) === String(ref.id)) ?? null
}

/**
 * The collection's tile: Collections' own (LibraryCollectionTile) once the list has it, and until
 * then, or for one this person can't see listed, a poster with its name and "Collection".
 */
export function CollectionTile({
  of,
  collection,
  width,
  preferred,
  onFocus,
}: {
  of: NonNullable<ClientDetail['collection']>
  collection: ReturnType<typeof useFilmCollection>
  width?: number
  preferred?: boolean
  onFocus?: () => void
}) {
  const words = useT(filmsMessages)
  if (collection)
    return (
      <LibraryCollectionTile
        collection={collection}
        width={width}
        preferred={preferred}
        onFocus={onFocus}
      />
    )
  return (
    <Poster
      title={of.name}
      src={undefined}
      width={width}
      showTitle
      caption={words('collection')}
      preferred={preferred}
      onFocus={onFocus}
      onPress={() => router.push(`/collections/${of.id}` as Href)}
    />
  )
}

/** About, Information, and Languages and quality. */
function Cards({ d }: { d: ClientDetail }) {
  const t = useT(detailMessages)
  const { facts } = useTexts()
  const input = useFormFactor().input
  const gutter = usePageGutter()
  const { width } = useWindowDimensions()
  const open = (to: string) => router.push(to as Href)
  const it = d.item
  const about = (
    <FactsCard title={t('about')}>
      {d.tagline ? (
        <Text variant="body" weight={600}>
          {d.tagline}
        </Text>
      ) : null}
      {it.synopsis ? (
        <Text variant="body" color="text-2">
          {it.synopsis}
        </Text>
      ) : null}
    </FactsCard>
  )
  const information = (
    <FactsCard title={t('information')} facts={facts.informationOf(d)} onOpen={open} />
  )
  const languages = <FactsCard title={t('languages')} facts={facts.languagesOf(d)} onOpen={open} />
  const gap = input === 'pointer' ? space['4'] : space['3']
  if (input !== 'pointer' || width < breakpoints.medium)
    return (
      <View style={{ paddingHorizontal: gutter, gap }}>
        {about}
        {information}
        {languages}
      </View>
    )
  const wide = width >= breakpoints.wide
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, paddingHorizontal: gutter }}>
      <View style={{ flexGrow: 1.2, flexBasis: wide ? 0 : '100%' }}>{about}</View>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>{information}</View>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>{languages}</View>
    </View>
  )
}
