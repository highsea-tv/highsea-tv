// SPDX-License-Identifier: AGPL-3.0-only
// The music player's state, the same on every app (the universal player, one-client-platform-b.md
// › B3), moved from the prototype's design/prototypes/src/client/music-player.ts: what's queued,
// which song, whether it's playing, where in it, the volume, Shuffle and Repeat. A store made once
// above the routes (`createMusicPlayer`), so music goes on playing as the app moves from page to
// page, as Plex's, Emby's, Apple Music's and Spotify's players do, read with React's
// useSyncExternalStore (react.dev/reference/react/useSyncExternalStore).
//
// There's no audio here: the position runs on a timer, as the prototype's did. An app with sound
// drives the same store from its player's own clock instead (`clock: false`, then `setPosition`
// and `ended`). React without the DOM.
import { createT, defineMessages } from '@highsea-tv/i18n';
import { useSyncExternalStore } from 'react';
/** Previous restarts the song after this many seconds of it, as every music app's does. */
export const RESTART_S = 3;
/** Left and Right on the scrubber, in seconds. */
export const MUSIC_SEEK_S = 5;
/** How often the timer moves the position, in ms: often enough for a waveform to fill smoothly. */
export const TICK_MS = 250;
const EMPTY = {
    queue: [],
    index: 0,
    playing: false,
    position: 0,
    volume: 0.8,
    muted: false,
    shuffle: false,
    repeat: 'off',
    from: null,
};
/** A string's hash, for a shuffle that's the same every time (the prototype's reviews, the tests). */
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
export function createMusicPlayer(options = {}) {
    const clock = options.clock ?? true;
    const tickMs = options.tickMs ?? TICK_MS;
    const every = options.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    const stopEvery = options.clearInterval ?? ((id) => clearInterval(id));
    const empty = EMPTY;
    let state = empty;
    /** The queue's order before Shuffle, so turning it off puts the songs back. */
    let unshuffled = [];
    let keys = 0;
    const entries = (songs) => songs.map((s) => ({ ...s, key: `q${++keys}` }));
    const listeners = new Set();
    let timer;
    function set(next) {
        state = { ...state, ...next };
        for (const l of listeners)
            l();
        if (!clock)
            return;
        // the clock runs only while a song plays
        if (state.playing && state.queue.length > 0 && timer === undefined)
            timer = every(() => player.setPosition(state.position + tickMs / 1000), tickMs);
        if ((!state.playing || state.queue.length === 0) && timer !== undefined) {
            stopEvery(timer);
            timer = undefined;
        }
    }
    /** At the song's end: Repeat one plays it again, else the next; after the last, Repeat all goes round, otherwise the queue stops at its start. */
    function ended() {
        if (state.repeat === 'one')
            set({ position: 0 });
        else if (state.index + 1 < state.queue.length)
            set({ index: state.index + 1, position: 0 });
        else
            set({ index: 0, position: 0, playing: state.repeat === 'all' });
    }
    const player = {
        get: () => state,
        subscribe(l) {
            listeners.add(l);
            return () => {
                listeners.delete(l);
            };
        },
        load(queue, start = 0, position = 0, shuffle = false, from = null) {
            const q = entries(queue);
            unshuffled = q;
            set({
                queue: q,
                index: Math.min(start, q.length - 1),
                position,
                playing: true,
                shuffle,
                from,
            });
        },
        toggle: () => set({ playing: !state.playing }),
        /** The position from the clock or a real player; past the song's end it ends. */
        setPosition(position) {
            const song = state.queue[state.index];
            if (!song)
                return;
            if (position < song.duration)
                set({ position });
            else
                ended();
        },
        ended,
        next() {
            if (state.index + 1 < state.queue.length)
                set({ index: state.index + 1, position: 0 });
            else if (state.repeat === 'all' && state.queue.length > 0)
                set({ index: 0, position: 0 });
        },
        previous() {
            if (state.position > RESTART_S || (state.index === 0 && state.repeat !== 'all'))
                set({ position: 0 });
            else
                set({ index: (state.index || state.queue.length) - 1, position: 0 });
        },
        seekTo(seconds) {
            const song = state.queue[state.index];
            if (song)
                set({ position: Math.max(0, Math.min(song.duration - 0.5, seconds)) });
        },
        seekBy: (seconds) => player.seekTo(state.position + seconds),
        /** A song in the queue, from its start. */
        jump: (index) => set({ index, position: 0, playing: true }),
        setVolume: (volume) => set({ volume, muted: volume === 0 }),
        toggleMute: () => set({ muted: !state.muted }),
        /** Off, all, one, off. */
        cycleRepeat: () => set({ repeat: state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off' }),
        /**
         * Shuffle on keeps the song playing and shuffles what's after it; off puts the queue back in
         * its order, at the same song.
         */
        toggleShuffle() {
            const current = state.queue[state.index];
            if (!current)
                return set({ shuffle: !state.shuffle });
            if (state.shuffle) {
                const index = unshuffled.findIndex((e) => e.key === current.key);
                return set({ shuffle: false, queue: unshuffled, index: Math.max(0, index) });
            }
            unshuffled = state.queue;
            const rest = state.queue
                .filter((e) => e.key !== current.key)
                .sort((a, b) => hash(`shuffle:${a.id}`) - hash(`shuffle:${b.id}`));
            set({ shuffle: true, queue: [current, ...rest], index: 0 });
        },
        /** Songs after the one playing; with nothing playing, they play. */
        playNext(songs, from) {
            if (state.queue.length === 0)
                return player.load(songs, 0, 0, false, from);
            const added = entries(songs);
            const at = state.index + 1;
            unshuffled = [...unshuffled, ...added];
            set({ queue: [...state.queue.slice(0, at), ...added, ...state.queue.slice(at)] });
        },
        /** Songs at the end of the queue; with nothing playing, they play. */
        add(songs, from) {
            if (state.queue.length === 0)
                return player.load(songs, 0, 0, false, from);
            const added = entries(songs);
            unshuffled = [...unshuffled, ...added];
            set({ queue: [...state.queue, ...added] });
        },
        /** Takes a song out of Up next. The one playing isn't removed: Next or Stop does that. */
        remove(key) {
            const at = state.queue.findIndex((e) => e.key === key);
            if (at < 0 || at === state.index)
                return;
            unshuffled = unshuffled.filter((e) => e.key !== key);
            set({
                queue: state.queue.filter((e) => e.key !== key),
                index: at < state.index ? state.index - 1 : state.index,
            });
        },
        /** Moves a song in Up next to another place there, by the keys' new order. */
        reorder(upNext) {
            const by = new Map(state.queue.map((e) => [e.key, e]));
            const after = upNext.flatMap((k) => by.get(k) ?? []);
            const queue = [...state.queue.slice(0, state.index + 1), ...after];
            if (!state.shuffle)
                unshuffled = queue;
            set({ queue });
        },
        /** Clears what's after the song playing. */
        clearUpNext() {
            const queue = state.queue.slice(0, state.index + 1);
            unshuffled = unshuffled.filter((e) => queue.includes(e));
            set({ queue });
        },
        /** Stops the music: the queue is cleared and the bar or the mini player goes. */
        stop() {
            unshuffled = [];
            set({ ...empty, volume: state.volume, muted: state.muted });
        },
    };
    return player;
}
/** The song, Up next, and whether Previous and Next can go, for the bar and Now playing. */
export function nowPlaying(s) {
    const looping = s.repeat === 'all' && s.queue.length > 0;
    return {
        song: s.queue[s.index] ?? null,
        /** The songs after this one, for Up next. */
        upNext: s.queue.slice(s.index + 1),
        hasPrevious: s.index > 0 || s.position > RESTART_S || looping,
        hasNext: s.index + 1 < s.queue.length || looping,
    };
}
/** Is a song from this album playing? Its row has the playing mark while it is. */
export const albumPlaying = (s, album) => s.queue[s.index]?.album.id === album ? s : null;
/**
 * Is this album, artist or playlist what's playing, in its order, by the page `from` names? Its
 * Play button shows Pause while it is, as Apple Music's does; a song from it played on its own
 * (Play next, Search) leaves Play as it is.
 */
export const playingFrom = (s, to) => s.queue.length > 0 && s.from?.to === to && s.from.kind !== 'songs' && !s.shuffle ? s : null;
/** The player's state in a component. */
export const useMusicPlayerState = (player) => useSyncExternalStore(player.subscribe, player.get, player.get);
export const musicPlayerMessages = defineMessages({
    playlist: 'Playlist',
    songs: 'Songs',
    fromSearch: 'Playing from your search for “{name}”',
    from: 'Playing from {name}',
    repeatOff: 'Repeat: off',
    repeatAll: 'Repeat: the queue',
    repeatOne: 'Repeat: this song',
});
export function createMusicPlayerText(locale = 'en') {
    const t = createT(musicPlayerMessages, locale);
    return {
        /** "Playing from" for what a source names, read from the queue it gave. */
        fromOf(source, queue) {
            const first = queue[0];
            if (!first)
                return null;
            if ('album' in source)
                return { kind: 'album', name: first.album.title, to: `/music/albums/${source.album}` };
            if ('artist' in source)
                return {
                    kind: 'artist',
                    name: first.album.artist.name,
                    to: `/music/artists/${source.artist}`,
                };
            if ('playlist' in source)
                return { kind: 'playlist', name: t('playlist'), to: `/music/playlists/${source.playlist}` };
            return { kind: 'songs', name: t('songs'), to: '/music/songs' };
        },
        /** "Playing from" in words: "Playing from Sintel (Original Score)". */
        playingFromLabel: (from) => t(from.kind === 'search' ? 'fromSearch' : 'from', { name: from.name }),
        /** Repeat's name and icon in each of its states, for its button on every Now playing. */
        repeatButton: {
            off: { label: t('repeatOff'), icon: 'repeat' },
            all: { label: t('repeatAll'), icon: 'repeat' },
            one: { label: t('repeatOne'), icon: 'repeat-one' },
        },
    };
}
