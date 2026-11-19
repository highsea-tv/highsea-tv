// SPDX-License-Identifier: AGPL-3.0-only
// The music player's sound (HT-108): the store (`@highsea-tv/client/music-player`) driving a fake
// audio output and a fake server through the engine, `createMusicAudio`. No network, no
// expo-audio: what the engine asks of each, and what it does with their answers. Play, pause,
// seek, the end of a song and the next one, a skip, Repeat one, the owner stopping it from Now
// playing (the report's 404 `stopped`), a transcode on a server without ffmpeg (503 `no-ffmpeg`),
// the lock screen's own pause, and Stop.
import type { MusicPlay } from '@highsea-tv/api-contract'
import {
  type AudioOutput,
  type AudioOutputEvent,
  createMusicAudio,
  createMusicPlayer,
  type MusicNotice,
  type MusicServer,
} from '@highsea-tv/client/music-player'

type Song = {
  id: string
  title: string
  duration: number
  album: { id: string; title: string; artist: { name: string } }
}

const album = { id: 'al1', title: 'Sintel', artist: { name: 'Jan Morgenstern' } }
const songs: Song[] = [
  { id: 't1', title: 'One', duration: 100, album },
  { id: 't2', title: 'Two', duration: 120, album },
  { id: 't3', title: 'Three', duration: 90, album },
]

/** Lets the engine's awaited answers through. */
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r))
}

function fakeOutput() {
  const calls: string[] = []
  const listeners = new Set<(e: AudioOutputEvent) => void>()
  const output: AudioOutput = {
    load: (url, info) => calls.push(`load ${url} ${info.title}`),
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    seekTo: (s) => calls.push(`seek ${s}`),
    setVolume: (v, m) => calls.push(`volume ${v}${m ? ' muted' : ''}`),
    unload: () => calls.push('unload'),
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  const emit = (e: AudioOutputEvent) => {
    for (const l of listeners) l(e)
  }
  return { output, calls, emit }
}

type Fail = { status: number; details?: unknown; message?: string }

function fakeServer() {
  let n = 0
  const calls: string[] = []
  const reports: { id: string; position: number; paused: boolean }[] = []
  const o = {
    method: 'direct-play' as MusicPlay['method'],
    progressFails: null as Fail | null,
    readyFails: null as Fail | null,
  }
  const server: MusicServer = {
    async play(trackId) {
      n += 1
      calls.push(`play ${trackId} mp${n}`)
      return {
        id: `mp${n}`,
        url: `/stream/music/tok${n}`,
        method: o.method,
        contentType: 'audio/flac',
        reasons: [],
        duration: 100,
        expiresAt: '2026-11-19T00:00:00.000Z',
      }
    },
    async progress(id, r) {
      reports.push({ id, ...r })
      if (o.progressFails) throw Object.assign(new Error('fail'), o.progressFails)
    },
    async stop(id) {
      calls.push(`stop ${id}`)
    },
    async ready(url) {
      calls.push(`ready ${url}`)
      if (o.readyFails) throw Object.assign(new Error('fail'), o.readyFails)
    },
  }
  return { server, calls, reports, o }
}

function setup() {
  const player = createMusicPlayer<Song>({ clock: false })
  const out = fakeOutput()
  const srv = fakeServer()
  const notices: MusicNotice[] = []
  let tick: (() => void) | null = null
  const audio = createMusicAudio({
    player,
    output: out.output,
    server: srv.server,
    info: (s) => ({ title: s.title, artist: s.album.artist.name, album: s.album.title, artwork: null }),
    notice: (n) => notices.push(n),
    setInterval: (fn) => {
      tick = fn
      return 1
    },
    clearInterval: () => {
      tick = null
    },
  })
  return { player, out, srv, notices, audio, tick: () => tick?.() }
}

afterEach(() => jest.restoreAllMocks())

test('a song plays: a play with its id, the address loaded, played, and its place reported', async () => {
  const { player, out, srv, tick } = setup()
  player.load(songs, 0)
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1'])
  expect(out.calls).toEqual(['load /stream/music/tok1 One', 'volume 0.8', 'play'])
  // the output's clock moves the store, with no seek back
  out.emit({ type: 'playing', playing: true })
  out.emit({ type: 'time', position: 12.5 })
  expect(player.get().position).toBe(12.5)
  expect(out.calls).not.toContain('seek 12.5')
  tick()
  expect(srv.reports.at(-1)).toEqual({ id: 'mp1', position: 12.5, paused: false })
})

test('pause and play go to the output and are reported at once; a seek goes to the output', async () => {
  const { player, out, srv } = setup()
  player.load(songs, 0)
  await flush()
  out.emit({ type: 'playing', playing: true })
  out.emit({ type: 'time', position: 20 })
  player.toggle()
  expect(out.calls.at(-1)).toBe('pause')
  expect(srv.reports.at(-1)).toEqual({ id: 'mp1', position: 20, paused: true })
  player.seekTo(60)
  expect(out.calls.at(-1)).toBe('seek 60')
  player.toggle()
  expect(out.calls.at(-1)).toBe('play')
  expect(srv.reports.at(-1)).toEqual({ id: 'mp1', position: 60, paused: false })
})

test('a song starts at the place it was queued from', async () => {
  const { player, out } = setup()
  player.load(songs, 1, 64)
  await flush()
  expect(out.calls).toEqual(['load /stream/music/tok1 Two', 'volume 0.8', 'seek 64', 'play'])
})

test('at the end of a song its play ends (and counts) and the next song plays as a new play', async () => {
  const { player, out, srv } = setup()
  player.load(songs, 0)
  await flush()
  out.emit({ type: 'playing', playing: true })
  out.emit({ type: 'time', position: 99.9 })
  // the output pauses at the end before it says it ended: that pause isn't the person's
  out.emit({ type: 'playing', playing: false })
  expect(player.get().playing).toBe(true)
  out.emit({ type: 'ended' })
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1', 'play t2 mp2'])
  expect(player.get().index).toBe(1)
  expect(out.calls.slice(-3)).toEqual(['load /stream/music/tok2 Two', 'volume 0.8', 'play'])
})

test('after the last song the queue stops at its start, with no play open', async () => {
  const { player, out, srv, audio } = setup()
  player.load(songs, 2)
  await flush()
  out.emit({ type: 'ended' })
  await flush()
  expect(srv.calls).toEqual(['play t3 mp1', 'stop mp1'])
  expect(player.get()).toMatchObject({ index: 0, playing: false })
  expect(audio.playId()).toBeNull()
})

test('Repeat one plays the song again as a new play, so each time counts', async () => {
  const { player, out, srv } = setup()
  player.load(songs, 0)
  player.cycleRepeat()
  player.cycleRepeat()
  await flush()
  out.emit({ type: 'ended' })
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1', 'play t1 mp2'])
  expect(player.get().index).toBe(0)
})

test('Next ends the play and starts the next song’s; Previous early in a song goes back', async () => {
  const { player, srv } = setup()
  player.load(songs, 0)
  await flush()
  player.next()
  await flush()
  player.previous()
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1', 'play t2 mp2', 'stop mp2', 'play t1 mp3'])
})

test('a skip before the server answers ends that play rather than playing it', async () => {
  const { player, out, srv } = setup()
  player.load(songs, 0)
  player.next()
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'play t2 mp2', 'stop mp1'])
  expect(out.calls.filter((c) => c.startsWith('load'))).toEqual(['load /stream/music/tok2 Two'])
})

test('stopped from Now playing: the music pauses, says who, and plays again as a new play', async () => {
  const { player, out, srv, notices, tick } = setup()
  player.load(songs, 0)
  await flush()
  out.emit({ type: 'playing', playing: true })
  out.emit({ type: 'time', position: 30 })
  srv.o.progressFails = {
    status: 404,
    details: { reason: 'stopped', by: 'Sam', message: 'Bedtime' },
  }
  tick()
  await flush()
  expect(notices).toEqual([{ kind: 'stopped', by: 'Sam', message: 'Bedtime' }])
  expect(player.get().playing).toBe(false)
  expect(out.calls.at(-1)).toBe('unload')
  // the server ended it already: no DELETE
  expect(srv.calls).toEqual(['play t1 mp1'])
  srv.o.progressFails = null
  player.toggle()
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'play t1 mp2'])
  expect(out.calls.slice(-4)).toEqual(['load /stream/music/tok2 One', 'volume 0.8', 'seek 30', 'play'])
})

test('the server’s stopped event asks at once, so the note comes without waiting for the timer', async () => {
  const { player, srv, notices, audio } = setup()
  player.load(songs, 0)
  await flush()
  srv.o.progressFails = { status: 404, details: { reason: 'stopped', by: 'Sam', message: null } }
  audio.stoppedEvent(['mp1'])
  await flush()
  expect(notices).toEqual([{ kind: 'stopped', by: 'Sam', message: null }])
})

test('a play gone quiet (404 with no reason) starts again without a note', async () => {
  const { player, srv, notices, tick } = setup()
  player.load(songs, 0)
  await flush()
  srv.o.progressFails = { status: 404 }
  tick()
  srv.o.progressFails = null
  await flush()
  expect(notices).toEqual([])
  expect(srv.calls).toEqual(['play t1 mp1', 'play t1 mp2'])
  expect(player.get().playing).toBe(true)
})

test('a report the network drops leaves the music playing', async () => {
  const { player, srv, notices, tick } = setup()
  player.load(songs, 0)
  await flush()
  srv.o.progressFails = { status: 0, message: 'Can’t reach the server.' }
  tick()
  await flush()
  expect(notices).toEqual([])
  expect(player.get().playing).toBe(true)
  expect(srv.calls).toEqual(['play t1 mp1'])
})

test('a transcode on a server without ffmpeg: the music pauses and says why', async () => {
  const { player, out, srv, notices } = setup()
  srv.o.method = 'transcode'
  srv.o.readyFails = { status: 503, details: { reason: 'no-ffmpeg' } }
  player.load(songs, 0)
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'ready /stream/music/tok1', 'stop mp1'])
  expect(notices).toEqual([{ kind: 'no-ffmpeg' }])
  expect(player.get().playing).toBe(false)
  expect(out.calls.filter((c) => c.startsWith('load'))).toEqual([])
})

test('a transcode that’s ready plays', async () => {
  const { player, out, srv } = setup()
  srv.o.method = 'transcode'
  player.load(songs, 0)
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'ready /stream/music/tok1'])
  expect(out.calls.at(-1)).toBe('play')
})

test('the lock screen’s pause and play, and a media key’s Next, reach the store', async () => {
  const { player, out, srv } = setup()
  player.load(songs, 0)
  await flush()
  out.emit({ type: 'playing', playing: true })
  out.emit({ type: 'time', position: 10 })
  out.emit({ type: 'playing', playing: false })
  expect(player.get().playing).toBe(false)
  expect(srv.reports.at(-1)).toEqual({ id: 'mp1', position: 10, paused: true })
  out.emit({ type: 'playing', playing: true })
  expect(player.get().playing).toBe(true)
  out.emit({ type: 'next' })
  await flush()
  expect(player.get().index).toBe(1)
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1', 'play t2 mp2'])
})

test('an output that can’t play the file says the song didn’t start', async () => {
  const { player, out, srv, notices } = setup()
  player.load(songs, 0)
  await flush()
  out.emit({ type: 'error', message: 'Playback error (code 4)' })
  expect(notices).toEqual([{ kind: 'failed', message: 'Playback error (code 4)' }])
  expect(player.get().playing).toBe(false)
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1'])
})

test('volume and mute go to the output; Stop ends the play and empties it', async () => {
  const { player, out, srv } = setup()
  player.load(songs, 0)
  await flush()
  player.setVolume(0.5)
  expect(out.calls.at(-1)).toBe('volume 0.5')
  player.toggleMute()
  expect(out.calls.at(-1)).toBe('volume 0.5 muted')
  player.stop()
  expect(out.calls.at(-1)).toBe('unload')
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1'])
})

test('a song queued paused has no play until it plays; release ends the open play', async () => {
  const { player, srv, audio, out } = setup()
  player.load(songs, 0)
  player.toggle()
  await flush()
  // the answer came after the pause: it loads, paused
  expect(out.calls).not.toContain('play')
  player.next()
  await flush()
  expect(srv.calls).toEqual(['play t1 mp1', 'stop mp1'])
  player.toggle()
  await flush()
  expect(srv.calls.at(-1)).toBe('play t2 mp2')
  audio.release()
  expect(srv.calls.at(-1)).toBe('stop mp2')
})
