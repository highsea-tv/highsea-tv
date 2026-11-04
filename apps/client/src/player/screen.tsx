// SPDX-License-Identifier: AGPL-3.0-only
// C5, the player (docs/product/player.md), once for every client: the web and the desktop app's
// webview, the phone and the TV, at /play/{id} and /play/{id}/start (from the beginning). The
// engine is @highsea-tv/native/playback (expo-video on the phone and the TV, hls.js or the
// browser's own HLS on the web); what the screen decides is ./parts.tsx's usePlayerModel. It's
// laid out three ways by the form factor's input, since each is driven differently: a pointer
// (./pointer.tsx), touch (./touch.tsx) and the TV's remote (./tv.tsx). Drawn in the default theme
// whatever the person chose, since it's on black, as the prototype's is. In mock mode on the web,
// the player's own requests on leaving (keepalive fetches outside the SDK) go to the mock too.
import { usePlayback } from '@highsea-tv/native/playback'
import { useServers } from '@highsea-tv/native/servers'
import { type WebHost, WebHostProvider } from '@highsea-tv/native/web-host'
import { ThemeProvider, tokens, useFormFactor } from '@highsea-tv/ui'
import { type ReactNode, useMemo, useState } from 'react'
import { Platform } from 'react-native'
import { FilmMissing } from '../detail/parts.tsx'
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

function Player({ id, fromStart }: { id: number; fromStart: boolean }) {
  const input = useFormFactor().input
  const p = usePlayback(id, fromStart)
  const [panel, setPanel] = useState(false)
  const m = usePlayerModel(id, p, panel)
  if (p.detail.status === 'error') return <FilmMissing error={p.detail.error} />
  const props = { id, p, m, panel, setPanel }
  if (input === 'tv') return <TvPlayer {...props} />
  if (input === 'pointer') return <PointerPlayer {...props} />
  return <TouchPlayer {...props} />
}

export function PlayerScreen({ id, fromStart }: { id: string | undefined; fromStart: boolean }) {
  return (
    <ThemeProvider theme={tokens.themes.default}>
      <MockHost>
        {/* a new film is a new player: Next up moves from one to the next */}
        <Player key={id} id={Number(id)} fromStart={fromStart} />
      </MockHost>
    </ThemeProvider>
  )
}
