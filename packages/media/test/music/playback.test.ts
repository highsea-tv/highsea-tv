// SPDX-License-Identifier: AGPL-3.0-only
// Playing a song (HT-101): direct play when the device plays the codec in that container, AAC made
// whole otherwise; the address works only while the play lives; and a play kept when it ends,
// counted for Most played past half its length or four minutes. The transcoder is a stand-in.
import { afterEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { silentLogger } from '@highsea-tv/core'
import { schema } from '@highsea-tv/db'
import {
  createMusicPlayback,
  decideMusic,
  ffmpegMusicTranscoder,
  MUSIC_IDLE_MS,
  type MusicTranscoder,
} from '../../src/music/index.ts'
import { cleanup, parklife, person, setup } from './fixture.ts'

afterEach(cleanup)

// the built-in profiles' audio (packages/stream's profiles, from MDN's audio codec guide)
const chrome = {
  audio: ['aac', 'mp3', 'flac', 'opus', 'vorbis'].map((codec) => ({ codec, maxChannels: 8 })),
}
const safari = {
  audio: ['aac', 'mp3', 'flac', 'alac'].map((codec) => ({ codec, maxChannels: 8 })),
}

describe('the decision', () => {
  const track = (path: string, codec: string, format: string, channels = 2) => ({
    path,
    codec,
    format,
    channels,
  })
  test('FLAC, MP3, AAC and Opus play as they are where the profile lists them', () => {
    expect(decideMusic(track('/a.flac', 'flac', 'FLAC'), chrome)).toMatchObject({
      method: 'direct-play',
      contentType: 'audio/flac',
    })
    expect(decideMusic(track('/a.mp3', 'mp3', 'MP3'), safari).contentType).toBe('audio/mpeg')
    expect(decideMusic(track('/a.m4a', 'aac', 'AAC'), chrome).contentType).toBe('audio/mp4')
    expect(decideMusic(track('/a.opus', 'opus', 'Opus'), chrome).contentType).toBe('audio/ogg')
  })

  test('ALAC plays in Safari and is made AAC for Chrome; WMA everywhere', () => {
    const alac = track('/a.m4a', 'alac', 'ALAC')
    expect(decideMusic(alac, safari).method).toBe('direct-play')
    const made = decideMusic(alac, chrome)
    expect(made).toMatchObject({ method: 'transcode', contentType: 'audio/mp4', channels: 2 })
    expect(made.reasons).toEqual(['This device doesn’t play ALAC audio.'])
    const wma = decideMusic(track('/a.wma', 'wmav2', 'WMA'), safari)
    expect(wma.method).toBe('transcode')
    expect(wma.reasons).toHaveLength(2)
  })

  test('more channels than the device takes are made stereo', () => {
    const d = decideMusic(track('/a.flac', 'flac', 'FLAC', 6), {
      audio: [
        { codec: 'flac', maxChannels: 2 },
        { codec: 'aac', maxChannels: 8 },
      ],
    })
    expect(d).toMatchObject({ method: 'transcode', channels: 2 })
  })
})

async function playing(opts: { transcode?: MusicTranscoder; profile?: typeof chrome } = {}) {
  const t = await setup()
  t.put('Blur/Parklife (1994)/01.flac', parklife(1, 'Girls & Boys'))
  t.put('Blur/Parklife (1994)/02.mp3', parklife(2, 'Tracy Jacks', { format: 'mp3' }))
  await t.music.libraryScan.scan()
  const who = person(t)
  const allowed = { yes: true }
  const playback = createMusicPlayback(
    {
      db: t.db,
      jobs: t.jobs,
      clock: t.clock,
      events: t.events,
      logger: silentLogger,
      metadata: t.metadata,
    },
    {
      dir: join(t.dir, 'transcodes-music'),
      transcode: opts.transcode,
      profileFor: () => opts.profile ?? chrome,
      away: (address) => address !== '192.168.1.20',
      displayName: () => 'Ines',
      profileName: () => 'Main',
      device: () => null,
      allowed: () => allowed.yes,
    },
  )
  const tracks = t.rows().tracks
  return { t, who, playback, tracks, allowed }
}

describe('a play', () => {
  test('direct play: the file itself, on Now playing with its artist and album, then kept', async () => {
    const { t, who, playback, tracks } = await playing()
    const track = tracks[0] as (typeof tracks)[number]
    const play = playback.play(who, track.id, {}, { address: '192.168.1.20' })
    expect(play).toMatchObject({ method: 'direct-play', contentType: 'audio/flac', reasons: [] })
    expect(play.url).toMatch(/^\/stream\/music\/[\w-]{20,}$/)
    const token = play.url.slice('/stream/music/'.length)
    expect(await playback.open(token)).toEqual({ path: track.path, contentType: 'audio/flac' })
    expect(await playback.open('nope')).toBeNull()
    const [live] = playback.sessions()
    expect(live).toMatchObject({
      state: 'playing',
      network: 'lan',
      method: 'direct-play',
      item: {
        title: 'Girls & Boys',
        tmdbId: null,
        song: { artist: { name: 'Blur' }, album: { title: 'Parklife' } },
      },
    })
    playback.progress(who, play.id, { position: 100, paused: false })
    playback.stop(who, play.id)
    expect(await playback.open(token)).toBeNull()
    expect(playback.sessions()).toEqual([])
    const [row] = t.db.select().from(schema.musicPlays).all()
    expect(row).toMatchObject({
      trackId: track.id,
      played: 100,
      finished: true,
      method: 'direct-play',
    })
    const [history] = playback.history()
    expect(history).toMatchObject({ watched: 100, finished: true, item: { title: 'Girls & Boys' } })
    // Songs' Most played counts it
    expect(t.music.client.songs().find((s) => s.id === track.id)?.plays).toBe(1)
  })

  test('a skip early on is kept but not counted; nothing heard keeps nothing', async () => {
    const { t, who, playback, tracks } = await playing()
    const id = tracks[0]?.id as string
    const first = playback.play(who, id, {}, { address: '10.0.0.2' })
    playback.progress(who, first.id, { position: 20, paused: false })
    playback.stop(who, first.id)
    const second = playback.play(who, id, {}, { address: '10.0.0.2' })
    playback.stop(who, second.id)
    const rows = t.db.select().from(schema.musicPlays).all()
    expect(rows.map((r) => [r.played, r.finished])).toEqual([[20, false]])
    expect(t.music.client.songs().find((s) => s.id === id)?.plays).toBe(0)
  })

  test('someone else’s play is a 404; a play left five minutes ends', async () => {
    const { t, who, playback, tracks } = await playing()
    const play = playback.play(who, tracks[0]?.id as string, {}, { address: '10.0.0.2' })
    expect(() =>
      playback.progress({ ...who, userId: 'u9' }, play.id, { position: 1, paused: false }),
    ).toThrow(expect.objectContaining({ code: 'not-found' }))
    playback.progress(who, play.id, { position: 30, paused: true })
    expect(playback.sessions()[0]?.state).toBe('paused')
    t.clock.advance(MUSIC_IDLE_MS + 1)
    expect(playback.sessions()).toEqual([])
    expect(t.db.select().from(schema.musicPlays).all()).toHaveLength(1)
  })

  test('a song asked for ahead: open at once, off Now playing and counted only once it starts', async () => {
    const { t, who, playback, tracks } = await playing()
    const [one, two] = tracks
    const now = playback.play(who, one?.id as string, {}, { address: '10.0.0.2' })
    t.seen.length = 0
    const next = playback.play(who, two?.id as string, { ahead: true }, { address: '10.0.0.2' })
    // its address works already, so the player can open it before the hand-over
    expect(await playback.open(next.url.slice('/stream/music/'.length))).not.toBeNull()
    expect(playback.sessions().map((s) => s.id)).toEqual([now.id])
    expect(t.seen.filter((e) => e.topic === 'sessions.updated')).toHaveLength(0)
    // a quiet ahead play isn't swept as a left one is (the song before may be long)
    for (const at of [100, 200]) {
      t.clock.advance(MUSIC_IDLE_MS / 2 + 1)
      playback.progress(who, now.id, { position: at, paused: false })
    }
    expect(await playback.open(next.url.slice('/stream/music/'.length))).not.toBeNull()
    // the hand-over: the first ends, the next's first report starts it
    playback.stop(who, now.id)
    const startedAt = t.clock.now()
    playback.progress(who, next.id, { position: 0, paused: false })
    expect(playback.sessions().map((s) => [s.id, s.startedAt])).toEqual([
      [next.id, new Date(startedAt).toISOString()],
    ])
    playback.progress(who, next.id, { position: 120, paused: false })
    playback.stop(who, next.id)
    expect(
      t.db
        .select()
        .from(schema.musicPlays)
        .all()
        .map((r) => r.trackId),
    ).toEqual([one?.id ?? null, two?.id ?? null])
  })

  test('a song asked for ahead and let go unheard leaves nothing', async () => {
    const { t, who, playback, tracks } = await playing()
    const next = playback.play(
      who,
      tracks[1]?.id as string,
      { ahead: true },
      { address: '10.0.0.2' },
    )
    playback.stop(who, next.id)
    expect(t.db.select().from(schema.musicPlays).all()).toEqual([])
    expect(playback.sessions()).toEqual([])
  })

  test('losing the music library ends the play', async () => {
    const { who, playback, tracks, allowed } = await playing()
    const play = playback.play(who, tracks[0]?.id as string, {}, { address: '10.0.0.2' })
    allowed.yes = false
    expect(await playback.open(play.url.slice('/stream/music/'.length))).toBeNull()
  })

  test('Now playing’s Stop: the player hears who stopped it', async () => {
    const { who, playback, tracks } = await playing()
    const play = playback.play(who, tracks[0]?.id as string, {}, { address: '10.0.0.2' })
    expect(playback.stopFor(play.id, { name: 'Ines' }, 'Bedtime')).toBe(true)
    expect(playback.sessions()[0]?.stopped).toMatchObject({ by: 'Ines', message: 'Bedtime' })
    expect(() => playback.progress(who, play.id, { position: 5, paused: false })).toThrow(
      expect.objectContaining({
        code: 'not-found',
        details: expect.objectContaining({ reason: 'stopped' }),
      }),
    )
    expect(playback.stopFor('mp_nope', { name: 'Ines' }, '')).toBe(false)
  })

  test('a transcode: made once as AAC and kept for the next play; without ffmpeg, a 503', async () => {
    const made: string[] = []
    const transcode: MusicTranscoder = async (input, output, channels) => {
      made.push(`${input}:${channels}`)
      writeFileSync(output, 'aac')
    }
    const opus = { ...chrome, audio: chrome.audio.filter((a) => a.codec !== 'flac') }
    const { who, playback, tracks } = await playing({ transcode, profile: opus })
    const id = tracks[0]?.id as string
    const play = playback.play(who, id, {}, { address: '10.0.0.2' })
    expect(play).toMatchObject({ method: 'transcode', contentType: 'audio/mp4' })
    expect(play.reasons).toEqual(['This device doesn’t play FLAC audio.'])
    const file = await playback.open(play.url.slice('/stream/music/'.length))
    expect(file?.contentType).toBe('audio/mp4')
    expect(existsSync(file?.path as string)).toBe(true)
    expect(readFileSync(file?.path as string, 'utf8')).toBe('aac')
    playback.stop(who, play.id)
    const again = playback.play(who, id, {}, { address: '10.0.0.2' })
    await playback.open(again.url.slice('/stream/music/'.length))
    expect(made).toHaveLength(1)
    // the MP3 plays as it is
    expect(playback.play(who, tracks[1]?.id as string, {}, { address: '10.0.0.2' }).method).toBe(
      'direct-play',
    )

    const bare = await playing({ profile: opus })
    const p = bare.playback.play(
      bare.who,
      bare.tracks[0]?.id as string,
      {},
      { address: '10.0.0.2' },
    )
    await expect(bare.playback.open(p.url.slice('/stream/music/'.length))).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'no-ffmpeg' },
    })
  })

  test('ffmpeg missing from the machine is a 503 saying so, not a file it couldn’t read', async () => {
    const missing = ffmpegMusicTranscoder('/nonexistent/highsea-ffmpeg')
    const opus = { ...chrome, audio: chrome.audio.filter((a) => a.codec !== 'flac') }
    const { who, playback, tracks } = await playing({ transcode: missing, profile: opus })
    const p = playback.play(who, tracks[0]?.id as string, {}, { address: '10.0.0.2' })
    await expect(playback.open(p.url.slice('/stream/music/'.length))).rejects.toMatchObject({
      code: 'unavailable',
      details: { reason: 'no-ffmpeg' },
    })
  })
})
