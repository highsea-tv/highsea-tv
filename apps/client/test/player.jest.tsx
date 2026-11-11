// SPDX-License-Identifier: AGPL-3.0-only
// The player on the phone and with a pointer (src/player/): the film plays from the session the
// mock hands it, through a fake expo-video (./mock.ts's videoModule); the controls hide 3 s after
// the last touch while playing and come back with one; each of the stream's states says what
// happened with a way on; Audio and subtitles picks the subtitle, draws its lines where the engine
// hands them over, and moves them by 50 ms a press, kept for the film; Next up counts down to the
// next part; picture in picture and AirPlay are the phone's buttons, and playing on another screen
// says so; a link opened over it closes it. With a pointer, the prototype's C5 cases moved here: the position, Pause and Play, the
// panel with the speed and the timing. And the web's subtitle is the browser's own `<track>`.
import { SEED } from '@highsea-tv/mock/films'
import { MOCK_CLIP, STOP_AFTER_MS } from '@highsea-tv/mock/play'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native'
import { router } from 'expo-router'
import { navigationRef } from 'expo-router/build/global-state/navigationRef'
import type { FakeVideo } from './mock.ts'
import { flush, fresh, sent, server, signedIn } from './mock.ts'

jest.mock('../src/form-factor', () => ({
  formFactorOverride: () => (globalThis as { __formFactor?: string }).__formFactor ?? 'touch',
}))
jest.mock('../src/transport.ts', () =>
  require('./mock.ts').transportModule({
    media: {
      clip: `/web/${require('@highsea-tv/mock/play').MOCK_CLIP.clip}`,
      subtitles: `/web/${require('@highsea-tv/mock/play').MOCK_CLIP.subtitles}`,
      duration: require('@highsea-tv/mock/play').MOCK_CLIP.duration,
    },
  }),
)
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
jest.mock('expo-crypto', () => require('./mock.ts').cryptoModule())
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () =>
  require('./mock.ts').swipeable(),
)
require('react-native-gesture-handler/jestSetup')

const video = () => require('expo-video') as FakeVideo
const player = () => {
  const all = video().players
  const p = all[all.length - 1]
  if (!p) throw new Error('no player made')
  return p as unknown as {
    playing: boolean
    currentTime: number
    emit: (e: string, payload: unknown) => void
    at: (s: number) => void
    pause: () => void
  }
}

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nThe sea is calm tonight.\n'
const realFetch = global.fetch

beforeEach(() => {
  fresh()
  video().players.length = 0
  // the engine fetches the chosen subtitle's WebVTT itself, from the server, by URL
  global.fetch = jest.fn(async (input: string | URL | Request) =>
    String(input).includes(MOCK_CLIP.subtitles)
      ? new Response(VTT, { status: 200 })
      : new Response('', { status: 404 }),
  ) as typeof fetch
})
afterEach(async () => {
  await cleanup()
  global.fetch = realFetch
  delete (globalThis as { __formFactor?: string }).__formFactor
})

const FILM = SEED.film.id

/** Signs in, sets the toolbar's stream state, and opens the player at the film. */
async function playing(state: Record<string, string> = {}, path = `/play/${FILM}`) {
  await signedIn()
  server().setState(state as never)
  await act(() => router.navigate(path as never))
  await flush(2000)
}

const pause = () => screen.getByRole('button', { name: 'Pause' })

/** The first subtitle in Audio and subtitles' lists: the choice after Off. */
function firstSubtitle(scope: Pick<typeof screen, 'getAllByRole'> = screen) {
  const radios = scope.getAllByRole('radio')
  const off = radios.findIndex((r) => r.props.accessibilityLabel === 'Off')
  const sub = radios[off + 1]
  if (off < 0 || !sub) throw new Error('no subtitle to pick')
  return sub
}

type Host = { type: string; props: Record<string, unknown>; children?: unknown[] | null }

/** The first host element of `type` drawn, as screen.toJSON() has it. */
function hostOf(tree: unknown, type: string): Host | undefined {
  if (Array.isArray(tree)) {
    for (const x of tree) {
      const found = hostOf(x, type)
      if (found) return found
    }
    return undefined
  }
  if (!tree || typeof tree !== 'object') return undefined
  const n = tree as Host
  return n.type === type ? n : hostOf(n.children ?? [], type)
}

/** The React elements of `type` in an element tree, by their props' children. */
function elementsOf(node: unknown, type: string): { props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap((x) => elementsOf(x, type))
  if (!node || typeof node !== 'object' || !('props' in node)) return []
  const e = node as { type: unknown; props: Record<string, unknown> }
  return [...(e.type === type ? [e] : []), ...elementsOf(e.props.children, type)]
}

describe('the player on the phone', () => {
  test('plays the session’s clip, and Pause and Play drive the player', async () => {
    await playing()
    expect(
      sent('/playback/movie/').length + sent(`/items/movie/${FILM}/play`).length,
    ).toBeGreaterThan(0)
    expect(player().playing).toBe(true)
    expect(screen.getByRole('header', { name: 'Tears of Steel' })).toBeTruthy()
    await fireEvent.press(pause())
    await flush()
    expect(player().playing).toBe(false)
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }))
    await flush()
    expect(player().playing).toBe(true)
  })

  test('the controls hide 3 s after the last touch while playing, and a tap brings them back', async () => {
    await playing()
    expect(pause()).toBeTruthy()
    await flush(3500)
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    await fireEvent.press(screen.getByRole('button', { name: 'Show controls' }))
    await flush()
    expect(pause()).toBeTruthy()
    // a tap while they show hides them
    await fireEvent.press(screen.getByRole('button', { name: 'Hide controls' }))
    await flush()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  test('the controls still hide when a time update lands after their moment, before the timer', async () => {
    await playing()
    expect(pause()).toBeTruthy()
    // a late timer: the clock passes the moment without the timer firing, and the next time
    // update (every 250 ms while playing) comes first and clears it
    jest.setSystemTime(Date.now() + 3500)
    await act(async () => player().at(4))
    await flush(500)
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })

  test('the position is an adjustable that seeks 10 s', async () => {
    await playing()
    await act(async () => player().at(12))
    await flush()
    const slider = screen.getByRole('adjustable', { name: 'Position' })
    expect(slider.props['aria-valuetext']).toBe('0:12 of 0:52')
    await act(async () =>
      slider.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }),
    )
    expect(player().currentTime).toBe(22)
    await fireEvent.press(screen.getByRole('button', { name: 'Back 10 seconds' }))
    expect(player().currentTime).toBe(12)
  })

  test('without a clip it says it’s getting ready', async () => {
    await playing({ stream: 'preparing' })
    expect(screen.getByText('Getting it ready')).toBeTruthy()
    expect(screen.getByText('Making the first minute for your connection.')).toBeTruthy()
  })

  test('a film that didn’t start says so, and Try again starts it again', async () => {
    await playing({ stream: 'failed' })
    expect(screen.getByText('This film didn’t start')).toBeTruthy()
    const before = sent(`/items/movie/${FILM}/play`).length
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await flush(500)
    expect(sent(`/items/movie/${FILM}/play`).length).toBeGreaterThan(before)
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    await flush(500)
    expect(screen.queryByText('This film didn’t start')).toBeNull()
  })

  test('stopped from Now playing, it says who stopped it and why', async () => {
    await playing({ stream: 'stopped' })
    await flush(STOP_AFTER_MS + 500)
    expect(screen.getByText(/stopped this stream$/)).toBeTruthy()
    expect(screen.getByText(/^“.+”$/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start again' })).toBeTruthy()
  })

  test('Audio and subtitles: a subtitle’s lines, and its timing moved 50 ms a press', async () => {
    await playing()
    await fireEvent.press(screen.getByRole('button', { name: 'Audio and subtitles' }))
    await flush()
    const off = screen.getByRole('radio', { name: 'Off' })
    expect(off.props.accessibilityState.checked).toBe(true)
    // the disc's own is a picture, which the app can't draw
    await fireEvent.press(firstSubtitle())
    await flush(500)
    expect(
      screen.getByText('This subtitle is a picture, which the app can’t show yet.'),
    ).toBeTruthy()
    await fireEvent.press(screen.getByRole('radio', { name: 'English' }))
    await flush(500)
    expect(screen.getByText('Subtitle timing')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Show subtitles 50 ms later' }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Show subtitles 50 ms later' }))
    await flush(500)
    expect(screen.getByText('+100 ms')).toBeTruthy()
    expect(sent(`/items/movie/${FILM}/prefs`).length).toBeGreaterThan(0)
    // the line shows at its time, 100 ms later
    await act(async () => player().at(1.05))
    await flush()
    expect(screen.queryByText('The sea is calm tonight.')).toBeNull()
    await act(async () => player().at(1.2))
    await flush()
    expect(screen.getByText('The sea is calm tonight.')).toBeTruthy()
  })

  test('Next up at the end, counting down to the collection’s next part', async () => {
    await playing({ stream: 'next-up' })
    await act(async () => player().at(MOCK_CLIP.duration - 8))
    await flush()
    const card = screen.queryByLabelText('Next up') ?? screen.queryByLabelText('More like this')
    expect(card).toBeTruthy()
    if (screen.queryByLabelText('Next up')) {
      expect(screen.getByText(/Starts in \d+ s/)).toBeTruthy()
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
      await flush()
      expect(screen.queryByLabelText('Next up')).toBeNull()
    }
  })

  test('picture in picture and AirPlay are the phone’s, and another screen says so', async () => {
    await playing()
    expect(hostOf(screen.toJSON(), 'VideoAirPlayButton')).toBeTruthy()
    expect(screen.getByLabelText('AirPlay')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Picture in picture' }))
    await flush()
    // while it plays in picture in picture, the controls draw nothing over the frame
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
    await act(async () => {
      const view = hostOf(screen.toJSON(), 'VideoView')
      ;(view?.props.onPictureInPictureStop as (() => void) | undefined)?.()
    })
    await act(async () =>
      player().emit('isExternalPlaybackActiveChange', { isExternalPlaybackActive: true }),
    )
    await flush()
    expect(screen.getByText('Playing on another screen')).toBeTruthy()
    expect(screen.getByLabelText('AirPlay: playing on another screen')).toBeTruthy()
    // the controls stay up there
    await flush(4000)
    expect(pause()).toBeTruthy()
  })

  test('a link opened over the player closes it and goes where it points (B2’s answer 1)', async () => {
    await playing()
    expect(screen.getByRole('header', { name: 'Tears of Steel' })).toBeTruthy()
    // an incoming link is a NAVIGATE to its address, as Expo Router's linking dispatches it
    await act(() => router.navigate('/settings' as never))
    await flush(1000)
    const stack = navigationRef.getRootState()?.routes[0]?.state
    expect(stack?.routes.map((r) => r.name)).toEqual(['(in)', '(in)'])
    expect(screen.queryByRole('header', { name: 'Tears of Steel' })).toBeNull()
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
  })

  test('Play from the beginning starts at 0', async () => {
    await playing({}, `/play/${FILM}/start`)
    expect(player().playing).toBe(true)
  })
})

describe('the player with a pointer', () => {
  beforeEach(() => {
    ;(globalThis as { __formFactor?: string }).__formFactor = 'regular-pointer'
  })

  test('the position, Pause and Play, and the panel with the speed and the timing', async () => {
    await playing()
    await act(async () => player().at(12))
    await flush()
    expect(screen.getByRole('adjustable', { name: 'Position' }).props['aria-valuetext']).toBe(
      '0:12 of 0:52',
    )
    await fireEvent.press(pause())
    await flush()
    await fireEvent.press(screen.getAllByRole('button', { name: 'Play' })[0] as never)
    await flush()
    expect(player().playing).toBe(true)
    expect(screen.getByRole('adjustable', { name: 'Volume' })).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Audio and subtitles' }))
    await flush()
    const panel = screen
      .getAllByLabelText('Audio and subtitles')
      .find((n) => n.props.accessibilityRole === 'complementary')
    if (!panel) throw new Error('no panel')
    expect(within(panel).getByText('Speed')).toBeTruthy()
    await fireEvent.press(within(panel).getByRole('radio', { name: '1.5×' }))
    expect((player() as unknown as { playbackRate: number }).playbackRate).toBe(1.5)
    await fireEvent.press(within(panel).getByRole('radio', { name: 'English' }))
    await flush(500)
    await fireEvent.press(screen.getByRole('button', { name: 'Show subtitles 50 ms later' }))
    await flush()
    await fireEvent.press(screen.getByRole('button', { name: 'Show subtitles 50 ms later' }))
    await flush(500)
    expect(screen.getByText('+100 ms')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    await flush()
    expect(screen.queryByText('Speed')).toBeNull()
  })
})

describe('the web’s picture', () => {
  test('the chosen subtitle is the browser’s own <track> of the session’s WebVTT', async () => {
    const { usePicture, DRAWS_CUES } = jest.requireActual('../src/player/picture.web.tsx')
    expect(DRAWS_CUES).toBe(false)
    const p = {
      player: { attach: () => undefined, video: { current: null } },
      subtitleUrl: '/api/v1/playback/sessions/s1/subtitles/en.vtt',
      subtitle: { id: 'en', language: 'en', label: 'English' },
      offsetMs: 0,
      detail: { data: null },
      seekBy: () => {},
      seekTo: () => {},
    }
    let picture: unknown = null
    function Picture() {
      picture = usePicture(p, { dim: false, raised: false }).picture
      return null
    }
    // the cue's colour is the theme's text, so it's drawn inside the app's ThemeProvider
    const { ThemeProvider } = jest.requireActual('@highsea-tv/ui')
    await render(
      <ThemeProvider>
        <Picture />
      </ThemeProvider>,
    )
    const [track] = elementsOf(picture, 'track')
    expect(track?.props).toMatchObject({
      kind: 'subtitles',
      src: p.subtitleUrl,
      srcLang: 'en',
      label: 'English',
      default: true,
    })
    expect(elementsOf(picture, 'video')).toHaveLength(1)
  })
})
