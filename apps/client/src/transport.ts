// SPDX-License-Identifier: AGPL-3.0-only
// How the client reaches a server (one-client-platform.md › A): the platform's fetch, or in mock
// mode, with EXPO_PUBLIC_HIGHSEA_MOCK=1 as it's bundled, the mock server answering inside the
// bundle (@highsea-tv/mock/transport) with the prototypes' frame channel beside it
// (@highsea-tv/mock/frame). Expo inlines EXPO_PUBLIC_ variables as it bundles
// (https://docs.expo.dev/guides/environment-variables/), and in a production build Metro folds the
// condition left behind before it collects the bundle's dependencies, so a bundle built without
// the variable never carries the mock (scripts/bundles.ts checks it). The variable has to be
// written out as `process.env.EXPO_PUBLIC_…` for Expo to find it, and both requires stay inside
// the condition's branch, so they fold away with it.
// ADR 0061: the mock is an SDK transport, chosen when the client is bundled, never at run time.
import type * as Frame from '@highsea-tv/mock/frame'
import type * as Play from '@highsea-tv/mock/play'
import type { Role } from '@highsea-tv/mock/state'
import type * as Transport from '@highsea-tv/mock/transport'
import type { Fetch } from '@highsea-tv/sdk'

/** The client in mock mode: the mock transport, the frame channel, and sign-ins' role changes. */
export type MockMode = {
  transport: Transport.MockTransport
  frame: typeof Frame
  /** Hears each role a sign-in changes the toolbar to (the transport's `onRole`); returns the stop. */
  onRole(listener: (role: Role) => void): () => void
  /**
   * The toolbar's states from the address (`?data=empty&theme=oled&text=200&motion=reduced`), when
   * the page is opened on its own on the web, as the sweeps open it; already given to the
   * transport. Framed, or off the web, nothing: the chrome's states come over the channel.
   */
  query: Partial<Frame.FrameState>
}

/** The page is the top window on the web, not inside the prototypes' chrome. */
const unframed = () =>
  typeof window !== 'undefined' && typeof location !== 'undefined' && window.parent === window

function mockMode(transport: typeof Transport, frame: typeof Frame, play: typeof Play): MockMode {
  const listeners = new Set<(role: Role) => void>()
  // sign-ins and the mock's own changes are kept in the page's storage on the web; the phone and
  // the TV keep them in memory. On the prototypes' server that storage is one origin with the
  // prototypes' own screens (../README.md › Mock mode)
  const web = typeof localStorage !== 'undefined'
  const storage = web ? transport.browserStorage : transport.memoryStorage()
  const query = web && unframed() ? frame.queryState(new URLSearchParams(location.search)) : {}
  const mock = transport.createMockFetch({
    storage,
    // the page's origin, which the transport can't read itself, so a request to it by its full
    // address is same-origin and carries the session cookie; the phone and the TV have none
    origin: web && typeof location !== 'undefined' ? location.origin : undefined,
    // every film plays as Sintel's clip, which the prototypes' server keeps beside the export at
    // /web/mock-media/ (design/prototypes/mock-media.ts). The phone and the TV have no server of
    // their own: a mock build given EXPO_PUBLIC_HIGHSEA_MOCK_MEDIA (the layout check's builds, with
    // that server's /web/ on the Mac's loopback) plays it from there, and one without waits as on
    // a first transcode
    media: mediaBase(web)
      ? {
          clip: `${mediaBase(web)}${play.MOCK_CLIP.clip}`,
          subtitles: `${mediaBase(web)}${play.MOCK_CLIP.subtitles}`,
          duration: play.MOCK_CLIP.duration,
        }
      : undefined,
    onRole: (role) => {
      for (const l of [...listeners]) l(role)
    },
  })
  // before the first request, so the first answers are already the address's
  mock.setState(query)
  return {
    transport: mock,
    frame,
    query,
    onRole(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** Where the mock's clip is served from: beside the web export, or what the native build was given. */
function mediaBase(web: boolean): string | undefined {
  if (web) return '/web/'
  // written out in full for Expo to inline it as it bundles
  return process.env.EXPO_PUBLIC_HIGHSEA_MOCK_MEDIA || undefined
}

/** Mock mode, or nothing in a real build. */
export const mock: MockMode | undefined =
  process.env.EXPO_PUBLIC_HIGHSEA_MOCK === '1'
    ? mockMode(
        require('@highsea-tv/mock/transport'),
        require('@highsea-tv/mock/frame'),
        require('@highsea-tv/mock/play'),
      )
    : undefined

/** The SDK client's fetch: the mock server's in mock mode, and otherwise the platform's. */
export const transport: Fetch | undefined = mock?.transport
