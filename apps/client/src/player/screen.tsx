// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player (docs/product/player.md), once for every client: the web and the desktop app's
// webview, the phone and the TV, at /play/{id} and /play/{id}/start (from the beginning), and an
// episode at /play/episode/{id} and /play/episode/{id}/start; with `?shuffle=1`, an item of a
// shuffle (@highsea-tv/client/shuffle). The
// engine is @highsea-tv/native/playback (expo-video on the phone and the TV, hls.js or the
// browser's own HLS on the web); what the screen decides is ./parts.tsx's usePlayerModel. It's
// laid out three ways by the form factor's input, since each is driven differently: a pointer
// (./pointer.tsx), touch (./touch.tsx) and the TV's remote (./tv.tsx). Drawn in the default theme
// whatever the person chose, since it's on black, as the prototype's is. In mock mode on the web,
// the player's own requests on leaving (keepalive fetches outside the SDK) go to the mock too.
import type { TitleType } from '@highsea-tv/client/data'
import { releaseShuffle, shuffleFor } from '@highsea-tv/client/shuffle'
import { usePlayback } from '@highsea-tv/native/playback'
import { useServers } from '@highsea-tv/native/servers'
import { type WebHost, WebHostProvider } from '@highsea-tv/native/web-host'
import { ThemeProvider, tokens, useFormFactor } from '@highsea-tv/ui'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { FilmMissing } from '../detail/parts.tsx'
import { pauseMusic } from '../music-player/store.ts'
import { useReportFailedPlay } from '../shell/reports.tsx'
import { mock } from '../transport.ts'
import { usePlayerModel } from './parts.tsx'
import { PointerPlayer } from './pointer.tsx'
import { TouchPlayer } from './touch.tsx'
import { TvPlayer } from './tv.tsx'

function MockHost({ children }: { children: ReactNode }) {
  const { current } = useServers()
  const host = useMemo<WebHost | null>(
    () =>
      mock
        ? {
            media: (url) => url,
            fetch: (path, init) =>
              mock?.transport((current?.base() ?? '') + path, init) as Promise<Response>,
          }
        : null,
    [current],
  )
  if (!host || Platform.OS !== 'web') return children
  return <WebHostProvider value={host}>{children}</WebHostProvider>
}

function Player({
  id,
  fromStart,
  type,
  inShuffle,
}: {
  id: number
  fromStart: boolean
  type: TitleType
  inShuffle: boolean
}) {
  const input = useFormFactor().input
  const p = usePlayback(id, fromStart, type)
  const [panel, setPanel] = useState(false)
  // the shuffle this item is part of, read once as it opens: each item is a new player
  const [shuffle] = useState(() =>
    shuffleFor(type === 'episode' ? 'episode' : 'movie', id, inShuffle),
  )
  // closing the player ends the shuffle, unless it handed it on to the next item
  useEffect(() => () => releaseShuffle(shuffle), [shuffle])
  const m = usePlayerModel(id, p, panel, type, shuffle)
  // a play that fails is reported to the server with its profile and decision (ADR 0066)
  useReportFailedPlay(p, id, type)
  if (p.detail.status === 'error') return <FilmMissing error={p.detail.error} />
  const props = { id, p, m, panel, setPanel }
  if (input === 'tv') return <TvPlayer {...props} />
  if (input === 'pointer') return <PointerPlayer {...props} />
  return <TouchPlayer {...props} />
}

export function PlayerScreen({
  id,
  fromStart,
  type = 'movie',
  shuffle = false,
}: {
  id: string | undefined
  fromStart: boolean
  /** Opened as an item of a shuffle (`?shuffle=1`): Next up, Next and Previous follow it. */
  shuffle?: boolean
  /** An episode plays at /play/episode/{id} (../app/play/episode/), a film at /play/{id}. */
  type?: TitleType
}) {
  // a film starting pauses the music, as the prototype's player did (B3)
  useEffect(() => pauseMusic(), [])
  // the player is a full-screen modal that turns while the screens under it stay upright, so it
  // measures its own safe area: "You may need to add it in other places like the root of modals
  // and routes when using react-native-screens"
  // (https://appandflow.github.io/react-native-safe-area-context/api/safe-area-provider); the
  // app's provider would keep the upright insets (HT-58)
  return (
    <SafeAreaProvider>
      <ThemeProvider theme={tokens.themes.default}>
        <MockHost>
          {/* a new film is a new player: Next up moves from one to the next */}
          <Player
            key={`${type}:${id}`}
            id={Number(id)}
            fromStart={fromStart}
            type={type}
            inShuffle={shuffle}
          />
        </MockHost>
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
