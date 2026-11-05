// SPDX-License-Identifier: AGPL-3.0-only
// The player on the TV (src/player/tv.tsx), as ./player.jest.tsx runs it on the phone, through the
// same fake expo-video: the scrubber takes the focus and is a Position adjustable; the remote's OK
// and Play/Pause play and pause, Left and Right on the scrubber seek 10 s; the legend says so; any
// key shows the controls, which hide while playing; Back closes Audio and subtitles, then hides the
// controls, then leaves; Audio and subtitles stays open on a subtitle, for its timing, which Left
// and Right on its row move by 50 ms; and a stream that didn't start asks, taking the focus.
import { SEED } from '@highsea-tv/mock/films'
import { act, cleanup, fireEvent, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { BackHandler } from 'react-native'
import type { FakeVideo } from './mock.ts'
import { flush, fresh, server, tvSignedIn } from './mock.ts'

jest.mock('../src/form-factor', () => ({ formFactorOverride: () => 'tv' }))
jest.mock('../src/transport.ts', () =>
  require('./mock.ts').transportModule({
    media: {
      clip: `/web/${require('@highsea-tv/mock/play').MOCK_CLIP.clip}`,
      subtitles: `/web/${require('@highsea-tv/mock/play').MOCK_CLIP.subtitles}`,
      duration: require('@highsea-tv/mock/play').MOCK_CLIP.duration,
    },
  }),
)
// where the screen sends focus, and the remote's presses it hears (react-native-tvos's
// useTVEventHandler, which a test can't press)
const focused: unknown[] = []
const mockRemotes = new Set<(e: { eventType: string }) => void>()
jest.mock('@highsea-tv/ui/tv', () => {
  const actual = jest.requireActual('@highsea-tv/ui/tv')
  const { useEffect, useRef } = require('react')
  return {
    ...actual,
    focusOn: (h: unknown) => {
      focused.push(h)
      actual.focusOn(h)
    },
    useRemote: (handler: (e: { eventType: string }) => void) => {
      const latest = useRef(handler)
      latest.current = handler
      useEffect(() => {
        const hear = (e: { eventType: string }) => latest.current(e)
        mockRemotes.add(hear)
        return () => void mockRemotes.delete(hear)
      }, [])
      actual.useRemote(handler)
    },
  }
})
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/discovery.ts'),
  () => ({ browse: () => () => {} }),
)
jest.mock(
  require('node:path').resolve(__dirname, '../../../packages/native/src/server-store.ts'),
  () => require('./mock.ts').serverStore(),
)
jest.mock(
  require.resolve('expo-crypto', {
    paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
  }),
  () => require('./mock.ts').cryptoModule(),
)
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

const video = () => require('expo-video') as FakeVideo
const player = () => {
  const p = video().players.at(-1)
  if (!p) throw new Error('no player made')
  return p as unknown as { playing: boolean; currentTime: number; at: (s: number) => void }
}

beforeEach(() => {
  fresh()
  video().players.length = 0
  focused.length = 0
  jest.spyOn(BackHandler, 'addEventListener')
})
afterEach(async () => {
  await cleanup()
  jest.restoreAllMocks()
})

const FILM = SEED.film.id

async function playing(state: Record<string, string> = {}) {
  await tvSignedIn()
  server().setState(state as never)
  await act(() => router.navigate(`/play/${FILM}` as never))
  await flush(2000)
}

/** The remote's press, as the screen hears it. */
const press = async (eventType: string) => {
  await act(() => {
    for (const hear of mockRemotes) hear({ eventType })
  })
  await flush(50)
}

/** The remote's Back, as react-native-tvos hands it to BackHandler's latest listener. */
const back = async () => {
  const listener = jest.mocked(BackHandler.addEventListener).mock.calls.at(-1)?.[1] as
    | (() => boolean | null | undefined)
    | undefined
  await act(() => void listener?.())
  await flush()
}

const scrubber = () => screen.getByRole('adjustable', { name: 'Position' })
const focus = async (el: unknown) => {
  await fireEvent(el as never, 'focus')
  await flush()
}
// the legend is hidden from assistive tech (the scrubber speaks for itself), so look past that
const hidden = { includeHiddenElements: true }
const legend = () => screen.queryByText('◀ ▶ Seek 10 s', hidden)

describe('the player on the TV', () => {
  test('the scrubber, its legend, and the remote’s keys', async () => {
    await playing()
    expect(player().playing).toBe(true)
    expect(scrubber()).toBeTruthy()
    expect(legend()).toBeTruthy()
    expect(screen.getByText('OK Pause', hidden)).toBeTruthy()
    expect(focused.length).toBeGreaterThan(0)

    await press('playPause')
    expect(player().playing).toBe(false)
    expect(screen.getByText('OK Play', hidden)).toBeTruthy()
    // OK on the scrubber plays
    await fireEvent.press(scrubber())
    await flush()
    expect(player().playing).toBe(true)

    // Left and Right seek on the scrubber, and only there
    await act(async () => player().at(20))
    await press('right')
    expect(player().currentTime).toBe(20)
    await focus(scrubber())
    await press('right')
    expect(player().currentTime).toBe(30)
    await press('left')
    expect(player().currentTime).toBe(20)
  })

  test('Back hides the controls while playing, then leaves', async () => {
    await playing()
    const before = screen.getByText('OK Pause', hidden)
    expect(before).toBeTruthy()
    await back()
    // hidden by fading: the scrubber stays for the focus, its row faded out
    const row = screen.getByRole('button', { name: 'Audio and subtitles' })
    type Node = { props: { style?: unknown }; parent: Node | null }
    let n: Node | null = row as unknown as Node
    let faded = false
    while (n) {
      const style = [n.props.style].flat(Infinity) as ({ opacity?: number } | undefined)[]
      if (style.some((s) => s?.opacity === 0)) faded = true
      n = n.parent
    }
    expect(faded).toBe(true)
    await back()
    await flush(500)
    expect(screen.queryByRole('adjustable', { name: 'Position' })).toBeNull()
  })

  // react-native-tvos hands focus moving to the same handler as `focus` and `blur`; focusing the
  // scrubber as the chrome hides isn't a key, so the controls stay hidden (found on the simulator)
  test('focus moving isn’t a key: the controls stay hidden', async () => {
    await playing()
    await back()
    const faded = () => {
      type Node = { props: { style?: unknown }; parent: Node | null }
      let n: Node | null = screen.getByRole('button', {
        name: 'Audio and subtitles',
      }) as unknown as Node
      while (n) {
        const style = [n.props.style].flat(Infinity) as ({ opacity?: number } | undefined)[]
        if (style.some((x) => x?.opacity === 0)) return true
        n = n.parent
      }
      return false
    }
    expect(faded()).toBe(true)
    await press('focus')
    await press('blur')
    expect(faded()).toBe(true)
    await press('down')
    expect(faded()).toBe(false)
  })

  test('Audio and subtitles stays open on a subtitle, for its timing, and Back closes it', async () => {
    await playing()
    await fireEvent.press(screen.getByRole('button', { name: 'Audio and subtitles' }))
    await flush()
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))
    await flush(500)
    const timing = screen.getByRole('adjustable', { name: 'Subtitle timing, in 50 ms steps' })
    expect(timing).toBeTruthy()
    await focus(timing)
    await press('right')
    await press('right')
    await flush(500)
    expect(screen.getByText('+100 ms')).toBeTruthy()
    await back()
    expect(screen.queryByRole('adjustable', { name: 'Subtitle timing, in 50 ms steps' })).toBeNull()
    // the player is still there, its controls up
    expect(scrubber()).toBeTruthy()
  })

  test('a stream that didn’t start asks what to do, taking the focus', async () => {
    await playing({ stream: 'failed' })
    expect(screen.getByText('This film didn’t start')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    // the controls are gone under it
    expect(legend()).toBeNull()
  })

  test('without a clip it says it’s getting ready', async () => {
    await playing({ stream: 'preparing' })
    expect(screen.getByText('Getting it ready')).toBeTruthy()
  })
})
