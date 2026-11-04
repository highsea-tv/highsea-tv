// SPDX-License-Identifier: AGPL-3.0-only
// A film's page and a person's page while they load, at every form factor, as the prototypes draw
// them (mobile/detail.tsx, web/detail.tsx and tv/detail.tsx's DetailSkeleton; mobile/person.tsx,
// web/person.tsx and tv/person.tsx's loading state): the art's place and fade, the lines of words
// and the buttons in the library's Skeleton and SkeletonText, then a row, each laid out as the
// loaded page lays it out, so nothing moves as it arrives. By touch Back stands over it, as it
// does over the page; with a pointer and on the TV the chrome lies over it as over the page. Each
// is `aria-busy`.
import { web } from '@highsea-tv/tokens'
import {
  FilmRowSkeleton,
  PosterSkeleton,
  ROUND_ACTION_ROOM,
  Skeleton,
  SkeletonText,
  TitleBackdrop,
  tokens,
  useControl,
  useFormFactor,
  usePageGutter,
  useTheme,
} from '@highsea-tv/ui'
import { TV_HEAD_HEIGHT, TV_ROW_GAP } from '@highsea-tv/ui/tv'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChromeOverlay } from '../kit.tsx'
import { OverlayBack } from './back.tsx'
import { FILM_TV, PERSON_TV, PHONE_PERSON } from './layout.ts'
import { useHero, useRowWidths } from './parts.tsx'

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

export function FilmSkeleton() {
  const input = useFormFactor().input
  if (input === 'tv') return <TvFilmSkeleton />
  if (input === 'pointer') return <PointerFilmSkeleton />
  return <TouchFilmSkeleton />
}

function TouchFilmSkeleton() {
  const theme = useTheme()
  const gutter = usePageGutter()
  const m = useControl()
  return (
    <View aria-busy style={{ flex: 1, gap: space['5'], backgroundColor: theme.colors.bg }}>
      <OverlayBack />
      <TitleBackdrop source={undefined} />
      <View style={{ marginTop: -space['16'], paddingHorizontal: gutter, gap: space['3'] }}>
        <Skeleton height={space['12']} width="60%" />
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
      </View>
    </View>
  )
}

function PointerFilmSkeleton() {
  const theme = useTheme()
  const gutter = usePageGutter()
  const m = useControl()
  const hero = useHero()
  // the hero lies under the top bar as the loaded page's does, so the bar doesn't move as it loads
  const chrome = useChromeOverlay(hero.overlay)
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
      <View style={{ minHeight: hero.minHeight, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <TitleBackdrop source={undefined} />
        <View
          style={{
            width: '100%',
            maxWidth: web.maxWidth,
            alignSelf: 'center',
            gap: space['4'],
            paddingTop: chrome.pad + space['8'],
            paddingBottom: space['10'],
            paddingHorizontal: gutter,
          }}
        >
          <View style={{ maxWidth: space['16'] * 10, gap: space['3'] }}>
            <Skeleton height={space['12']} width="80%" />
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
        </View>
      </View>
      <View style={{ width: '100%', maxWidth: web.maxWidth, alignSelf: 'center' }}>
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
function TvFilmSkeleton() {
  const theme = useTheme()
  const c = useControl()
  const u = theme.u
  useChromeOverlay()
  const s = FILM_TV
  return (
    <View aria-busy style={{ flex: 1, overflow: 'hidden' }}>
      {/* as the page: the art behind, the words under the head, the row a row's gap below */}
      <View>
        <TitleBackdrop source={undefined} />
        <View
          style={{
            height: (s.top + s.words) * u,
            paddingTop: s.top * u,
            maxWidth: '50%',
            justifyContent: 'flex-end',
            gap: tv.poster.gap * u,
            paddingHorizontal: tv.safe.x * u,
          }}
        >
          <Skeleton height={s.title} width={s.titleWidth * u} radius={tv.radius.button * u} />
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
        </View>
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
          maxWidth: web.maxWidth,
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
            maxWidth: web.maxWidth,
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
