// SPDX-License-Identifier: AGPL-3.0-only
import type { KnownTitle } from '@highsea-tv/client/data'
import { useMedia } from '@highsea-tv/native/media'
import {
  FilmRowSkeleton,
  PosterSkeleton,
  ROUND_ACTION_ROOM,
  Skeleton,
  SkeletonText,
  TitleLogo,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  usePageMeasure,
  useTheme,
} from '@highsea-tv/ui'
import { TV_HEAD_HEIGHT, TV_ROW_GAP } from '@highsea-tv/ui/tv'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChromeOverlay } from '../kit.tsx'
import { OverlayBack } from './back.tsx'
import { PointerHero, TouchHero, TvHero, useHero, usePointerHero } from './hero.tsx'
import { FILM_TV, PERSON_TV, PHONE_PERSON } from './layout.ts'
import { useRowWidths } from './parts.tsx'

const { space, radius } = tokens
const tv = tokens.tv

/** A row's title and a few stills, clipped at the page's edge: the web's More like this. */
function StillsSkeleton({ count }: { count: number }) {
  const gutter = usePageGutter()
  const w = useRowWidths()
  return (
    <View aria-hidden style={{ gap: space['3'], paddingHorizontal: gutter }}>
      <Skeleton height={space['6']} width={space['10'] * 4} />
      <View style={{ flexDirection: 'row', gap: space['4'], overflow: 'hidden' }}>
        {Array.from({ length: count }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
          <PosterSkeleton key={i} aspect="still" width={w.still} />
        ))}
      </View>
    </View>
  )
}

/**
 * A film's or a show's page while it's read. What the card pressed to open it already said (its
 * art and its name, `known`: @highsea-tv/client/data's useKnownTitle) is drawn at once in its place
 * on the page, the rest as placeholders (HT-116).
 */
export function FilmSkeleton({ known = null }: { known?: KnownTitle | null }) {
  const input = useFormFactor().input
  if (input === 'tv') return <TvFilmSkeleton known={known} />
  if (input === 'pointer') return <PointerFilmSkeleton known={known} />
  return <TouchFilmSkeleton known={known} />
}

type Known = { known: KnownTitle | null }

function TouchFilmSkeleton({ known }: Known) {
  const theme = useTheme()
  const m = useControl()
  const media = useMedia()
  return (
    <View aria-busy style={{ flex: 1, gap: space['5'], backgroundColor: theme.colors.bg }}>
      <OverlayBack />
      <TouchHero source={media(known?.art.backdrop)}>
        {known ? (
          <TitleLogo title={known.title} logo={media(known.art.logo)} variant="largeTitle" />
        ) : (
          <Skeleton height={space['12']} width="60%" />
        )}
        <Skeleton height={space['3'] + space['0.5']} width={space['12'] * 4} />
        <Skeleton height={space['12']} radius={radius.md} />
        <SkeletonText lines={3} />
        <Skeleton height={space['3']} width={space['16'] * 3 + space['8']} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ alignItems: 'center', gap: space['1'] + space['0.5'] }}>
              <Skeleton width={m.height} height={m.height} radius={radius.pill} />
              <Skeleton height={space['3']} width={space['12']} />
            </View>
          ))}
        </View>
      </TouchHero>
    </View>
  )
}

function PointerFilmSkeleton({ known }: Known) {
  const measure = usePageMeasure()
  const theme = useTheme()
  const m = useControl()
  const media = useMedia()
  const { hero } = usePointerHero()
  return (
    <View
      aria-busy
      style={{
        flex: 1,
        gap: space['10'],
        paddingBottom: space['16'],
        backgroundColor: theme.colors.bg,
      }}
    >
      <PointerHero source={media(known?.art.backdrop)} hero={hero}>
        <View style={{ maxWidth: space['16'] * 10, gap: space['3'] }}>
          {known ? (
            <TitleLogo title={known.title} logo={media(known.art.logo)} variant="display" />
          ) : (
            <Skeleton height={space['12']} width="80%" />
          )}
          <Skeleton height={space['4']} width={space['16'] * 4 + space['8']} />
          <SkeletonText lines={3} />
          <Skeleton height={space['3']} width={space['16'] * 3 + space['4']} />
        </View>
        <View style={{ flexDirection: 'row', gap: m.gap }}>
          <Skeleton height={m.height} width={space['16'] * 2} radius={m.radius} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} width={m.height} height={m.height} radius={m.radius} />
          ))}
        </View>
      </PointerHero>
      <View style={{ width: '100%', maxWidth: measure, alignSelf: 'center' }}>
        <StillsSkeleton count={5} />
      </View>
    </View>
  )
}

/**
 * The TV's (tv/detail.tsx's DetailSkeleton): the art's place across the first screen under the
 * head, the words' block at the loaded page's height with the title, the meta line, three lines,
 * the credits, the picks' line and the buttons, then the film row's.
 */
function TvFilmSkeleton({ known }: Known) {
  const theme = useTheme()
  const c = useControl()
  const media = useMedia()
  const u = theme.u
  useChromeOverlay()
  const s = FILM_TV
  return (
    <View aria-busy style={{ flex: 1, overflow: 'hidden' }}>
      {/* as the page: the art behind, the words under the head, the row a row's gap below */}
      <View>
        <TvHero source={media(known?.art.backdrop)}>
          {known ? (
            <TitleLogo
              title={known.title}
              logo={media(known.art.logo)}
              variant="heroTitle"
              numberOfLines={2}
            />
          ) : (
            <Skeleton height={s.title} width={s.titleWidth * u} radius={tv.radius.button * u} />
          )}
          <Skeleton height={s.line} width={s.metaWidth * u} />
          <SkeletonText lines={3} />
          <View style={{ gap: s.creditsGap * u }}>
            <Skeleton height={s.line} width={s.castWidth * u} />
            <Skeleton height={s.line} width={s.directorWidth * u} />
          </View>
          <Skeleton height={s.picks} width={s.picksWidth * u} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: c.rowGap,
              paddingBottom: ROUND_ACTION_ROOM * u,
            }}
          >
            <Skeleton height={c.height / u} width={tv.poster.width * u} radius={c.radius} />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={c.height / u} width={c.height} radius={radius.pill} />
            ))}
          </View>
        </TvHero>
      </View>
      <View style={{ paddingTop: TV_ROW_GAP * u }}>
        <FilmRowSkeleton />
      </View>
    </View>
  )
}

export function PersonSkeleton() {
  const input = useFormFactor().input
  if (input === 'tv') return <TvPersonSkeleton />
  return <PagePersonSkeleton />
}

function PagePersonSkeleton() {
  const measure = usePageMeasure()
  const theme = useTheme()
  const touch = useFormFactor().input === 'touch'
  const insets = useSafeAreaInsets()
  const gutter = usePageGutter()
  const hero = useHero()
  const w = useRowWidths()
  const side = !touch && hero.overlay
  const chrome = useChromeOverlay(!touch && hero.overlay)
  const portrait = touch ? PHONE_PERSON.portrait : side ? space['16'] * 3 : space['12'] * 3
  return (
    <View
      aria-busy
      style={{
        flex: 1,
        gap: touch ? PHONE_PERSON.sections : space['10'],
        paddingBottom: touch ? space['6'] : space['16'],
        backgroundColor: theme.colors.bg,
      }}
    >
      {touch ? <OverlayBack /> : null}
      <View
        style={{
          width: '100%',
          maxWidth: measure,
          alignSelf: 'center',
          flexDirection: side ? 'row' : 'column',
          alignItems: side ? 'center' : touch ? 'center' : 'flex-start',
          columnGap: space['10'],
          rowGap: touch ? PHONE_PERSON.portraitGap : space['6'],
          paddingTop: touch ? insets.top + PHONE_PERSON.top : chrome.pad + space['8'],
          paddingBottom: touch ? space['2'] : space['10'],
          paddingHorizontal: gutter,
        }}
      >
        <Skeleton width={portrait} height={portrait} radius={radius.pill} />
        <View
          style={{
            flexShrink: 1,
            width: '100%',
            maxWidth: space['16'] * 11,
            alignItems: touch ? 'center' : 'flex-start',
            gap: touch ? space['2'] : space['3'],
          }}
        >
          <Skeleton
            height={touch ? space['6'] + space['1'] : space['8'] + space['1']}
            width="60%"
          />
          <Skeleton height={space['3'] + space['0.5']} width={space['10'] * 4} />
          <SkeletonText lines={3} />
        </View>
      </View>
      {touch ? (
        <FilmRowSkeleton />
      ) : (
        <View
          style={{
            width: '100%',
            maxWidth: measure,
            alignSelf: 'center',
            gap: space['3'],
            paddingHorizontal: gutter,
          }}
        >
          <Skeleton height={space['6']} width={space['16'] * 2} />
          <View style={{ flexDirection: 'row', gap: space['4'], overflow: 'hidden' }}>
            {Array.from({ length: 6 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
              <PosterSkeleton key={i} width={w.poster} />
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

/**
 * The TV's (tv/person.tsx's loading state): under the head, the portrait's circle beside the
 * name, the line under it and three lines, then the film row's.
 */
function TvPersonSkeleton() {
  const theme = useTheme()
  const u = theme.u
  useChromeOverlay()
  const s = PERSON_TV
  return (
    <View aria-busy style={{ flex: 1, overflow: 'hidden', gap: TV_ROW_GAP * u }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s.portraitGap * u,
          paddingHorizontal: tv.safe.x * u,
          paddingTop: (TV_HEAD_HEIGHT + TV_ROW_GAP) * u,
          paddingBottom: tv.safe.y * u,
        }}
      >
        <Skeleton height={s.portrait} width={s.portrait * u} radius={radius.pill} />
        <View style={{ width: s.wordsWidth * u, gap: tv.poster.gap * u }}>
          <Skeleton height={s.nameLine} width={s.nameWidth * u} radius={tv.radius.button * u} />
          <Skeleton height={s.line} width={s.lineWidth * u} />
          <SkeletonText lines={3} />
        </View>
      </View>
      <FilmRowSkeleton />
    </View>
  )
}
