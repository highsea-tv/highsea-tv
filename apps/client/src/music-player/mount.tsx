// SPDX-License-Identifier: AGPL-3.0-only
// The music player above the routes (one-client-platform-b.md › B3): the shell mounts it once, so
// music goes on playing as the app moves from page to page. Only a server that serves music has it
// (`useServes('music')`, the foundation's): on any other the store stays empty and nothing of the
// player is drawn, so a real server's client is as it was at B2. Moving to another server stops
// the music. In mock mode the toolbar's Music (`music=playing`) queues Sintel's score at its
// fourth cue, a minute in, so any page can be reviewed with the player showing, as the
// prototype's SeedMusic did; "Nothing playing" stops it. On the TV, Play/Pause on the remote
// plays and pauses the music from anywhere but the film player (the prototype's useMusicKeys).
// On a real server the music is heard (HT-108, ./audio.ts): the store's clock gives way to the
// audio's, and a song paused on its own (stopped from Now playing, no ffmpeg) says why in a note.
// The mock has no songs to hear, so its clock runs as the prototype's did.
import { useMusicQueue, useServes } from '@highsea-tv/client/data'
import { createMusicAudio, type MusicNotice } from '@highsea-tv/client/music-player'
import { useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import { useCurrent } from '@highsea-tv/native/servers'
import { useWebHost } from '@highsea-tv/native/web-host'
import { useClient } from '@highsea-tv/sdk/react'
import { useFormFactor } from '@highsea-tv/ui'
import { focusedPlay, useRemote } from '@highsea-tv/ui/tv'
import { usePathname } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { useFrameState } from '../frame-channel.ts'
import { useNote } from '../kit.tsx'
import { mock } from '../transport.ts'
import { musicOutput, musicProfile, musicServer } from './audio.ts'
import { musicPlayerScreenMessages as messages } from './messages.ts'
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

  return (
    <>
      {serves && !mock ? <MusicAudio /> : null}
      {tv ? <RemoteKeys serves={serves} /> : null}
    </>
  )
}

/**
 * The music heard, on a server that serves it: one expo-audio player (./audio.ts) driven by the
 * store through the engine, made once per server and let go when the server changes.
 */
function MusicAudio() {
  const client = useClient()
  const current = useCurrent()
  const host = useWebHost()
  const native = useMedia()
  const note = useNote()
  const t = useT(messages)
  // the latest of each, read when they're needed, so the engine isn't made again for a new function
  const latest = useRef({ host, native, note, t })
  latest.current = { host, native, note, t }
  const server = current.server.id

  // biome-ignore lint/correctness/useExhaustiveDependencies: another server makes the engine again
  useEffect(() => {
    const media = (path: string) =>
      Platform.OS === 'web' ? { uri: latest.current.host.media(path) } : latest.current.native(path)
    const say = (n: MusicNotice) => {
      const { t, note } = latest.current
      if (n.kind === 'stopped')
        note(
          {
            title: t('stoppedBy', { name: n.by }),
            body: n.message ? `“${n.message}” ${t('stoppedByBody')}` : t('stoppedByBody'),
          },
          null,
        )
      else if (n.kind === 'no-ffmpeg') note({ title: t('noFfmpeg'), body: t('noFfmpegBody') }, null)
      else note({ title: t('failed'), body: t('failedBody') }, null)
    }
    musicPlayer.setClock(false)
    const audio = createMusicAudio({
      player: musicPlayer,
      output: musicOutput(media),
      server: musicServer(client, media, () => musicProfile(latest.current.host)),
      info: (song) => ({
        title: song.title,
        artist: song.album.artist.name,
        album: song.album.title,
        artwork: song.album.cover,
      }),
      notice: say,
    })
    // stopped from Now playing: a report at once hears who stopped it (the film player's
    // useStoppedEvent)
    const off = client.events.subscribe((e) => {
      if (e.topic === 'playback.stopped' && e.ids) audio.stoppedEvent(e.ids)
    })
    return () => {
      off()
      audio.release()
      musicPlayer.setClock(true)
    }
  }, [client, server])
  return null
}

/**
 * Play/Pause on the remote, but not over a film (the player has its own): music playing pauses
 * (player.md › The music player); otherwise the focused card's title plays, without opening its
 * page (design-language/platforms/tv.md › the remote, tiles.tsx's focusedPlay); otherwise music
 * queued goes on. Music playing comes first so the key that started it stops it wherever focus is.
 */
function RemoteKeys({ serves }: { serves: boolean }) {
  const pathname = usePathname()
  const onEvent = useCallback(
    (e: { eventType: string }) => {
      if (e.eventType !== 'playPause' || pathname.startsWith('/play/')) return
      const music = serves ? musicPlayer.get() : null
      if (music?.playing) musicPlayer.toggle()
      else if (focusedPlay.current) focusedPlay.current()
      else if (music && music.queue.length > 0) musicPlayer.toggle()
    },
    [pathname, serves],
  )
  useRemote(onEvent)
  return null
}
