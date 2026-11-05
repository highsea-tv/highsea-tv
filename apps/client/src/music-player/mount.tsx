// SPDX-License-Identifier: AGPL-3.0-only
// The music player above the routes (one-client-platform-b.md › B3): the shell mounts it once, so
// music goes on playing as the app moves from page to page. Only a server that serves music has it
// (`useServes('music')`, the foundation's): on any other the store stays empty and nothing of the
// player is drawn, so a real server's client is as it was at B2. Moving to another server stops
// the music. In mock mode the toolbar's Music (`music=playing`) queues Sintel's score at its
// fourth cue, a minute in, so any page can be reviewed with the player showing, as the
// prototype's SeedMusic did; "Nothing playing" stops it. On the TV, Play/Pause on the remote
// plays and pauses the music from anywhere but the film player (the prototype's useMusicKeys).
import { useMusicQueue, useServes } from '@highsea-tv/client/data'
import { useCurrent } from '@highsea-tv/native/servers'
import { useFormFactor } from '@highsea-tv/ui'
import { useRemote } from '@highsea-tv/ui/tv'
import { usePathname } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { useFrameState } from '../frame-channel.ts'
import { musicPlayer, useMusicPlayer } from './store.ts'

/** The album the toolbar's Music plays from: the mock's Sintel score (the prototype's). */
const SEED_ALBUM = 'jan-morgenstern-sintel-original-score'
/** Its fourth cue, a minute in. */
const SEED_AT = { index: 3, position: 64 }

/** Whether the shell draws the player: the server serves music and a song is queued. */
export function useMusicShown(): boolean {
  const serves = useServes('music')
  return useMusicPlayer().song !== null && serves
}

/**
 * The toolbar's Music as last acted on, for the app as a whole as the store is: the shell may mount
 * the player again (another form factor's shell), and that mustn't queue the music again.
 */
const toolbar = { acted: null as string | null, turn: 0, server: null as string | null }

/** Forgets the toolbar's last choice, for tests that start the app again. */
export function forgetToolbar() {
  toolbar.acted = null
  toolbar.server = null
  toolbar.turn++
}

export function MusicPlayerMount() {
  const serves = useServes('music')
  const server = useCurrent().server.id
  const music = useFrameState().music
  const { queue } = useMusicQueue()
  // the latest, so a new function from the hook doesn't ask for the queue again
  const queueRef = useRef(queue)
  queueRef.current = queue
  const tv = useFormFactor().input === 'tv'

  // another server, or one without music: nothing plays. Kept app-wide, since the shell may mount
  // the player again without the server changing
  useEffect(() => {
    if (!serves) musicPlayer.stop()
    if (toolbar.server !== null && toolbar.server !== server) musicPlayer.stop()
    toolbar.server = server
  }, [serves, server])

  useEffect(() => {
    if (!serves || music === undefined || toolbar.acted === music) return
    // acted on once as it's chosen, so Close or Stop isn't undone after; the latest choice wins
    toolbar.acted = music
    const turn = ++toolbar.turn
    if (music === 'none') return musicPlayer.stop()
    queueRef.current({ album: SEED_ALBUM }, false).then(
      (songs) => {
        if (turn === toolbar.turn && musicPlayer.get().queue.length === 0)
          musicPlayer.load(songs, SEED_AT.index, SEED_AT.position)
      },
      () => {},
    )
  }, [serves, music])

  return tv && serves ? <RemoteKeys /> : null
}

/** Play/Pause on the remote plays and pauses the music, but not over a film. */
function RemoteKeys() {
  const pathname = usePathname()
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (e.eventType !== 'playPause' || pathname.startsWith('/play/')) return
      if (musicPlayer.get().queue.length > 0) musicPlayer.toggle()
    },
    [pathname],
  )
  useRemote(onEvent)
  return null
}
