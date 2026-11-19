import {
  FeaturedCardSkeleton,
  FilmRowSkeleton,
  RowSkeleton,
  tokens,
  useFormFactor,
  usePageGutter,
  usePageMeasure,
  usePosterWidth,
  useTheme,
} from '@highsea-tv/ui'
import { TV_ROW_GAP } from '@highsea-tv/ui/tv'
import { View } from 'react-native'
import { POINTER_APART } from './rows.tsx'
import { HOME } from './sizes.ts'

const { space } = tokens
const tv = tokens.tv

export function HomeSkeleton() {
  const input = useFormFactor().input
  if (input === 'tv') return <TvSkeleton />
  if (input === 'pointer') return <PointerSkeleton />
  return <TouchSkeleton />
}

function TouchSkeleton() {
  const resume = usePosterWidth(HOME.continueShare)
  const still = usePosterWidth(HOME.stillShare)
  return (
    <View aria-busy style={{ gap: space['6'] }}>
      <FeaturedCardSkeleton />
      <RowSkeleton aspect="still" resume itemWidth={resume} />
      <RowSkeleton aspect="still" itemWidth={still} />
    </View>
  )
}

function PointerSkeleton() {
  const measure = usePageMeasure()
  const gutter = usePageGutter()
  return (
    <View
      aria-busy
      style={{
        paddingTop: space['4'],
        paddingBottom: space['16'],
        gap: POINTER_APART,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          paddingHorizontal: gutter,
          width: '100%',
          maxWidth: measure,
          alignSelf: 'center',
        }}
      >
        <FeaturedCardSkeleton />
      </View>
      <View style={{ width: '100%', maxWidth: measure, alignSelf: 'center', gap: POINTER_APART }}>
        <RowSkeleton aspect="still" resume />
        <FilmRowSkeleton />
        <FilmRowSkeleton />
      </View>
    </View>
  )
}

function TvSkeleton() {
  const u = useTheme().u
  return (
    <View
      aria-busy
      style={{ flex: 1, overflow: 'hidden', paddingTop: TV_ROW_GAP * u, gap: TV_ROW_GAP * u }}
    >
      <View style={{ paddingHorizontal: tv.safe.x * u, paddingVertical: HOME.tvFeaturedPad * u }}>
        <FeaturedCardSkeleton />
      </View>
      <RowSkeleton aspect="still" resume itemWidth={HOME.tvContinueWidth} />
      <FilmRowSkeleton />
    </View>
  )
}
