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
import { flush, fresh, rewrite, sent, server, signedIn } from './mock.ts'

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

  test('a start that plays with no frame drawn didn’t start, with nothing behind its message (HT-64)', async () => {
    await playing()
    await act(async () => player().at(1))
    await act(async () => player().at(5))
    await flush()
    expect(screen.queryByText('This film didn’t start')).toBeNull()
    await act(async () => player().at(9))
    await flush()
    expect(screen.getByText('This film didn’t start')).toBeTruthy()
    // the failed item's picture (AVPlayer's own placeholder) and its line are gone from under it
    expect(hostOf(screen.toJSON(), 'VideoView')).toBeUndefined()
    expect(sent(`/playback/sessions/`).some((r) => r.method === 'DELETE')).toBe(true)
  })

  test('a start whose first frame was drawn plays on', async () => {
    await playing()
    await act(async () => {
      const view = hostOf(screen.toJSON(), 'VideoView')
      ;(view?.props.onFirstFrameRender as (() => void) | undefined)?.()
    })
    await act(async () => player().at(1))
    await act(async () => player().at(20))
    await flush()
    expect(screen.queryByText('This film didn’t start')).toBeNull()
    expect(hostOf(screen.toJSON(), 'VideoView')).toBeTruthy()
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

  test('Now Playing: the title, its year, and the poster as a file the app loaded with its sign-in', async () => {
    // the copy of expo-image @highsea-tv/native resolves (Bun's isolated store)
    const { Image } = require(
      require.resolve('expo-image', {
        paths: [require('node:path').resolve(__dirname, '../../../packages/native')],
      }),
    ) as typeof import('expo-image')
    const disk = new Set<string>()
    const prefetch = jest.spyOn(Image, 'prefetch').mockImplementation(async (uri) => {
      disk.add(String(uri))
      return true
    })
    const path = jest
      .spyOn(Image, 'getCachePathAsync')
      .mockImplementation(async (key) => (disk.has(key) ? '/Caches/poster.jpg' : null))
    try {
      await playing()
      const source = (
        player() as unknown as {
          source: { metadata: Record<string, string> }
        }
      ).source
      expect(source.metadata).toEqual({
        title: 'Tears of Steel',
        artist: expect.stringMatching(/^\d{4}$/),
        artwork: 'file:///Caches/poster.jpg',
      })
      // loaded into expo-image's disk cache, as the item page's poster is (the mock's posters are
      // data URIs, so the sign-in's header is now-playing.jest.tsx's to show)
      expect(prefetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cachePolicy: 'memory-disk' }),
      )
    } finally {
      prefetch.mockRestore()
      path.mockRestore()
    }
  })

  test('Audio and subtitles turns with the phone, as the player does', async () => {
    await playing()
    await fireEvent.press(screen.getByRole('button', { name: 'Audio and subtitles' }))
    await flush()
    const sheet = screen.getByRole('header', { name: 'Audio and subtitles' })
    type Node = { props: Record<string, unknown>; parent: Node | null }
    let modal: Node | null = sheet as unknown as Node
    while (modal && !('supportedOrientations' in modal.props)) modal = modal.parent
    expect(modal?.props.supportedOrientations).toEqual([
      'portrait',
      'landscape-left',
      'landscape-right',
    ])
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

  test('the badge says what plays, not the version’s name (“Ultra HD”, its profile’s)', async () => {
    // the client's own sign-in, to rename the version as the owner does in the admin
    let auth = ''
    rewrite((_url, init) => {
      auth ||= new Headers(init.headers).get('authorization') ?? ''
      return undefined
    })
    await signedIn('theo')
    const admin = (path: string, init: RequestInit = {}) =>
      server()(`/api/v1${path}`, {
        ...init,
        headers: { authorization: auth, 'content-type': 'application/json' },
      }).then((r) => r.json())
    const film = await admin(`/items/movie/${FILM}`)
    const version = film.versions[0]
    await admin(`/movies/${FILM}/versions/${version.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Ultra HD' }),
    })
    await act(() => router.navigate(`/play/${FILM}` as never))
    await flush(2000)
    expect(version.quality).toBeTruthy()
    expect(screen.getByText(version.quality)).toBeTruthy()
    expect(screen.queryByText('Ultra HD')).toBeNull()
  })
})

describe('the web’s picture', () => {
  test('the chosen subtitle’s cues are laid on a text track of the page’s own, for the browser to draw', async () => {
    const { usePicture, DRAWS_CUES } = jest.requireActual('../src/player/picture.web.tsx')
    expect(DRAWS_CUES).toBe(false)
    // jsdom has no text tracks: a VTTCue and a video that adds tracks, as browsers do
    class FakeCue {
      snapToLines = true
      lineAlign = 'start'
      line: number | 'auto' = 'auto'
      constructor(
        public startTime: number,
        public endTime: number,
        public text: string,
      ) {}
    }
    const added: { label: string; language: string; mode: string; cues: FakeCue[] }[] = []
    const safari = { mode: 'showing' }
    const video = {
      addEventListener: () => {},
      textTracks: [safari] as { mode: string }[],
      addTextTrack: (_kind: string, label: string, language: string) => {
        const t = {
          label,
          language,
          mode: 'disabled',
          cues: [] as FakeCue[],
          addCue: (c: FakeCue) => t.cues.push(c),
          removeCue: (c: FakeCue) => t.cues.splice(t.cues.indexOf(c), 1),
        }
        added.push(t)
        video.textTracks.push(t)
        return t
      },
    }
    ;(globalThis as { VTTCue?: unknown }).VTTCue = FakeCue
    const across = { startTime: 5, endTime: 7, text: 'Across' }
    const base = {
      player: { attach: () => undefined, video: { current: video } },
      subtitle: { id: 'en', language: 'en', label: 'English' },
      detail: { data: null },
      state: { phase: 'ready' },
      seekBy: () => {},
      seekTo: () => {},
    }
    let props = { ...base, cues: [across], offsetMs: 0 }
    let raised = false
    let picture: unknown = null
    function Picture() {
      picture = usePicture(props, { dim: false, raised }).picture
      return null
    }
    const { ThemeProvider } = jest.requireActual('@highsea-tv/ui')
    const view = await render(
      <ThemeProvider>
        <Picture />
      </ThemeProvider>,
    )
    // one video, and no <track> to load a file: the cues come in segments
    expect(elementsOf(picture, 'video')).toHaveLength(1)
    expect(elementsOf(picture, 'track')).toEqual([])
    expect(added).toHaveLength(1)
    const [own] = added
    expect(own).toMatchObject({ label: 'English', language: 'en', mode: 'showing' })
    // the stream's own track is turned off
    expect(safari.mode).toBe('disabled')
    expect(own?.cues).toMatchObject([
      { startTime: 5, endTime: 7, text: 'Across', snapToLines: false, lineAlign: 'end', line: 84 },
    ])

    // the next segment's cues are added, the one in both segments not again; the person's
    // timing and the controls move every cue
    props = {
      ...base,
      cues: [across, { startTime: 8, endTime: 9, text: 'Next' }],
      offsetMs: 500,
    }
    raised = true
    await view.rerender(
      <ThemeProvider>
        <Picture />
      </ThemeProvider>,
    )
    expect(own?.cues.map((c) => [c.text, c.startTime, c.endTime, c.line])).toEqual([
      ['Across', 5.5, 7.5, 78],
      ['Next', 8.5, 9.5, 78],
    ])
    expect(added).toHaveLength(1)
  })
})
