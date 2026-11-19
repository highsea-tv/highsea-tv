import { bytes } from '@highsea-tv/core/format';
import { defineMessages } from '@highsea-tv/i18n';
import { useSyncExternalStore } from 'react';
/** A download plays offline this long; then it needs its server once to carry on. */
export const OFFLINE_DAYS = 30;
/** How long the simulation waits between steps, in ms: a download moves once a second. */
export const TICK_MS = 1000;
/** The quick speed a download runs at in the simulation, bytes a second. */
const SPEED = 6.2e6;
export const QUALITIES = [
    { id: 'original', perMinute: 140e6 },
    { id: 'high', perMinute: 30e6 },
    { id: 'saver', perMinute: 12e6 },
];
/** A song's bytes a minute at each quality: lossless, 320 and 160 kbit/s. */
const AUDIO_PER_MINUTE = {
    original: 7.5e6,
    high: 2.4e6,
    saver: 1.2e6,
};
export const sizeOf = (x, quality) => x.minutes *
    (x.kind === 'song'
        ? AUDIO_PER_MINUTE[quality]
        : (QUALITIES.find((q) => q.id === quality)?.perMinute ?? 30e6));
/** A film as a download's source. Its still is its backdrop: `Art` has no still of its own. */
export const filmSource = (m) => ({
    id: String(m.id),
    kind: 'film',
    title: m.title,
    still: m.art.backdrop,
    minutes: m.runtimeMinutes ?? 0,
    caption: null,
    group: null,
});
/** What an album's songs are kept under (the prototype's client/downloads.ts). */
export const albumGroup = (a) => ({
    kind: 'album',
    id: a.id,
    title: a.title,
    artist: a.artist.name,
    cover: a.cover,
});
/** A season of a show, which its episodes are kept under (the prototype's seasonGroup). */
export const seasonGroup = (show, season) => ({
    kind: 'season',
    id: `${show.id}:${season.number}`,
    show: { id: String(show.id), title: show.title },
    season: season.number,
    title: season.title,
    poster: season.poster,
});
/**
 * An episode in its season as a download's source: its still, and its place ("S2, E3", the shows'
 * words' episodeCode, which the caller gives in its language) as the caption.
 */
export const episodeSource = (e, group, code) => ({
    id: String(e.id),
    kind: 'episode',
    title: e.title,
    still: e.still,
    minutes: e.runtimeMinutes ?? 0,
    caption: code,
    group,
});
/** A song on its album as a download's source: the cover is its art, its number its caption. */
export const songSource = (song, a) => ({
    id: song.id,
    kind: 'song',
    title: song.title,
    still: a.cover,
    minutes: song.duration / 60,
    caption: String(song.number),
    group: albumGroup(a),
});
export const offlineOf = (x, state, extra = {}) => ({
    ...x,
    state,
    progress: state === 'done' || state === 'expired' ? 1 : 0,
    bytes: sizeOf(x, extra.quality ?? 'high'),
    speed: 0,
    quality: 'high',
    daysLeft: OFFLINE_DAYS,
    ...extra,
});
/**
 * What a mock device downloaded earlier: one in each state, from the library's films after the
 * first (which Home features), as the prototype's review sees them all. The phone waits for Wi-Fi
 * where the desktop app has paused.
 */
export function seedFilms(app, films) {
    const [, a, b, c, d, e, f] = films.map(filmSource);
    const list = [
        a ? offlineOf(a, 'done', { daysLeft: 26 }) : null,
        b ? offlineOf(b, 'downloading', { progress: 0.42, speed: SPEED }) : null,
        c ? offlineOf(c, 'queued') : null,
        d ? offlineOf(d, app === 'mobile' ? 'waiting-wifi' : 'paused', { progress: 0.18 }) : null,
        e ? offlineOf(e, 'failed', { progress: 0.63 }) : null,
        f ? offlineOf(f, 'expired', { daysLeft: 0 }) : null,
    ];
    return list.filter((x) => x !== null);
}
export function entriesOf(items) {
    const out = [];
    const groups = new Map();
    for (const x of items) {
        if (!x.group) {
            out.push({ kind: 'item', item: x });
            continue;
        }
        const g = groups.get(x.group.id);
        if (g)
            g.items.push(x);
        else {
            const entry = { kind: 'group', group: x.group, items: [x] };
            groups.set(x.group.id, entry);
            out.push(entry);
        }
    }
    for (const g of groups.values())
        g.items.sort((a, b) => (a.caption ?? '').localeCompare(b.caption ?? '', 'en', { numeric: true }));
    return out;
}
/** Every item of a group downloaded, part of it, or none; and where the part still going is. */
export function groupState(items) {
    const kept = items.filter((x) => x !== undefined);
    const done = kept.filter((x) => x.state === 'done').length;
    const going = kept.filter((x) => x.state !== 'done' && x.state !== 'expired');
    return {
        kept,
        done,
        all: items.length > 0 && kept.length === items.length,
        none: kept.length === 0,
        going: going.length > 0,
        progress: kept.length === 0
            ? 0
            : kept.reduce((s, x) => s + x.bytes * x.progress, 0) /
                kept.reduce((s, x) => s + x.bytes, 0),
    };
}
/** What a download has on the device so far. */
export const keptBytes = (x) => x.bytes * x.progress;
/** Kept for good: it plays, or would once the server sees it again. */
export const isKept = (x) => x.state === 'done' || x.state === 'expired';
/** On its way: the bar shows where it's got to. */
export const isMoving = (x) => x.state === 'downloading' || x.state === 'paused';
/**
 * A device's downloads. The clock runs while anything listens (every `TICK_MS`), as the
 * prototype's did; `timers` lets a test drive it.
 */
export function createDownloads(options = {}) {
    const timers = options.timers ?? {
        set: (f, ms) => setInterval(f, ms),
        clear: (h) => clearInterval(h),
    };
    let items = [];
    let quality = 'high';
    let seeded = false;
    let snap = { items, quality };
    let clock;
    const listeners = new Set();
    const emit = () => {
        snap = { items, quality };
        for (const l of [...listeners])
            l();
    };
    const startNext = () => {
        if (items.some((x) => x.state === 'downloading'))
            return;
        const i = items.findIndex((x) => x.state === 'queued');
        const next = items[i];
        if (next)
            items[i] = { ...next, state: 'downloading', speed: SPEED };
    };
    const change = (id, patch) => {
        if (!items.some((x) => x.id === id))
            return;
        items = items.map((x) => (x.id === id ? { ...x, ...patch } : x));
        startNext();
        emit();
    };
    const tick = () => {
        if (!items.some((x) => x.state === 'downloading'))
            return;
        items = items.map((x) => {
            if (x.state !== 'downloading')
                return x;
            const progress = Math.min(1, x.progress + x.speed / x.bytes);
            return progress >= 1
                ? { ...x, progress: 1, state: 'done', speed: 0, daysLeft: OFFLINE_DAYS }
                : { ...x, progress };
        });
        startNext();
        emit();
    };
    return {
        snapshot: () => snap,
        subscribe(listener) {
            listeners.add(listener);
            clock ??= timers.set(tick, TICK_MS);
            return () => {
                listeners.delete(listener);
                if (listeners.size === 0 && clock !== undefined) {
                    timers.clear(clock);
                    clock = undefined;
                }
            };
        },
        get: (id) => items.find((x) => x.id === id),
        seeded: () => seeded,
        seed(list) {
            if (seeded)
                return;
            seeded = true;
            const started = items;
            items = [...list.filter((x) => !started.some((y) => y.id === x.id)), ...started];
            emit();
        },
        setQuality(q) {
            quality = q;
            emit();
        },
        start(x) {
            const list = Array.isArray(x) ? x : [x];
            for (const m of list) {
                if (items.some((y) => y.id === m.id && y.state !== 'failed'))
                    continue;
                items = [
                    ...items.filter((y) => y.id !== m.id),
                    offlineOf(m, 'queued', { quality, bytes: sizeOf(m, quality) }),
                ];
            }
            startNext();
            emit();
        },
        pause: (id) => change(id, { state: 'paused', speed: 0 }),
        resume: (id) => change(id, { state: 'queued' }),
        retry: (id) => change(id, { state: 'queued' }),
        renew: (id) => change(id, { state: 'done', daysLeft: OFFLINE_DAYS }),
        remove(id) {
            const ids = new Set(typeof id === 'string' ? [id] : id);
            items = items.filter((x) => !ids.has(x.id));
            startNext();
            emit();
        },
        tick,
    };
}
/** A store's list and quality, kept current. */
export const useDownloadsSnapshot = (store) => useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
// ---------------------------------------------------------------- words
export const downloadsMessages = defineMessages({
    title: 'Downloads',
    offline: 'Offline',
    // the list
    spaceUsed: 'Space used by downloads',
    space: '{ready} · {used} · {free} free on {where}',
    thisPhone: 'this phone',
    thisComputer: 'this computer',
    films: '{count, plural, one {# film} other {# films}}',
    episodes: '{count, plural, one {# episode} other {# episodes}}',
    songs: '{count, plural, one {# song} other {# songs}}',
    listOf: '{list} and {last}',
    ready: '{list} ready',
    nothingReady: 'Nothing ready yet',
    emptyTitle: 'Nothing downloaded',
    emptyTouch: 'Tap Download on a film, an episode or an album to keep it on {where}. It plays without the server.',
    emptyPointer: 'Choose Download on a film, an episode or an album to keep it on {where}. It plays without the server.',
    list: 'Downloads',
    settings: 'Download settings',
    quality: 'Quality',
    qualityHint: 'For new downloads. Higher looks better and takes more room.',
    wifiOnly: 'Download on Wi-Fi only',
    original: 'Original (largest)',
    high: 'High · 1080p',
    saver: 'Data saver · 720p',
    originalShort: 'Original',
    highShort: '1080p',
    saverShort: '720p',
    lossless: 'Lossless',
    kbit320: '320 kbit/s',
    kbit160: '160 kbit/s',
    // each download
    downloadingLine: '{speed}/s · {left} to go',
    pausedLine: 'Paused · {done} of {size}',
    queuedLine: 'Waiting to download · {size}',
    wifiLine: 'Waiting for Wi-Fi · {size}',
    failedLine: 'The download stopped when {server} couldn’t be reached.',
    doneLine: '{size} · plays offline for {days} more days',
    expiredWatch: 'Connect to {server} to keep watching it.',
    expiredListen: 'Connect to {server} to keep listening to it.',
    size: '{size} · {quality}',
    stopped: 'Stopped',
    expired: 'Expired',
    downloadingOf: 'Downloading {title}',
    pause: 'Pause',
    resume: 'Resume',
    useData: 'Use mobile data',
    tryAgain: 'Try again',
    cancel: 'Cancel',
    remove: 'Remove',
    removed: '{title} removed',
    cancelled: 'Download cancelled',
    stillPlays: 'It still plays from {server}.',
    groupSize: '{count} · {size}',
    // the film page's Download
    download: 'Download',
    downloadingTo: 'Downloading {title}',
    to: 'To {where}.',
    downloadingButton: 'Downloading · {speed}/s · {left} to go',
    waiting: 'Waiting to download',
    waitingWifi: 'Waiting for Wi-Fi',
    stoppedButton: 'The download stopped',
    downloaded: 'Downloaded · plays offline for {days} more days',
    downloadedExpired: 'Downloaded · connect to {server} to keep watching it',
    // a season's or an album's Download (the prototype's GroupDownload)
    groupDone: '{done} of {count}',
    groupKept: 'Downloaded · {size}',
    groupRest: '{label} the rest',
    groupTo: '{count} to {where}.',
    // until downloads are built (client-settings.md#offline)
    laterPhone: 'Downloading films to this phone comes in the next update of the app.',
    laterComputer: 'Downloading films to this computer comes in the next update of the app.',
    // a browser (client-settings.md: Downloads live in the desktop app)
    browserTitle: 'Downloads live in the desktop app',
    browserBody: 'To keep films for offline, use the highsea app for macOS, Windows or Linux. They play on a plane, a train, or anywhere the server can’t be reached.',
    getDesktop: 'Get the desktop app',
});
/** "2 films, 3 episodes and 12 songs ready", leaving out what's none. */
export function readyLine(items, t) {
    const parts = [
        ['film', 'films'],
        ['episode', 'episodes'],
        ['song', 'songs'],
    ].flatMap(([kind, key]) => {
        const count = items.filter((x) => x.kind === kind && x.state === 'done').length;
        return count === 0 ? [] : [t(key, { count })];
    });
    if (parts.length === 0)
        return t('nothingReady');
    const last = parts.pop();
    return t('ready', {
        list: parts.length > 0 ? t('listOf', { list: parts.join(', '), last }) : last,
    });
}
/** The quality a row names: a film's resolution, or a song's bit rate. */
export function qualityName(x, t) {
    if (x.kind === 'song')
        return t(x.quality === 'original' ? 'lossless' : x.quality === 'high' ? 'kbit320' : 'kbit160');
    return t(`${x.quality}Short`);
}
/** The Quality select's choices. */
export const qualityOptions = (t) => QUALITIES.map((q) => ({ value: q.id, label: t(q.id) }));
/** Where the downloads are kept, in the words' "on {where}". */
export const whereOf = (app, t) => t(app === 'mobile' ? 'thisPhone' : 'thisComputer');
/** The space a device has, as the prototype draws it (a device's own free space comes with 4.6). */
export const DISK = { mobile: 64e9, desktop: 512e9 };
/** The line under the space bar. */
export function spaceLine(app, items, t) {
    const used = items.reduce((s, x) => s + keptBytes(x), 0);
    return {
        used,
        fraction: used / DISK[app],
        line: t('space', {
            ready: readyLine(items, t),
            used: bytes(used),
            free: bytes(DISK[app] - used),
            where: whereOf(app, t),
        }),
    };
}
/** A row's words for its state: the line under its title, in the list or under Download. */
export function stateLine(x, server, t) {
    const size = t('size', { size: bytes(x.bytes), quality: qualityName(x, t) });
    switch (x.state) {
        case 'downloading':
            return t('downloadingLine', { speed: bytes(x.speed), left: bytes(x.bytes - keptBytes(x)) });
        case 'paused':
            return t('pausedLine', { done: bytes(keptBytes(x)), size: bytes(x.bytes) });
        case 'queued':
            return t('queuedLine', { size });
        case 'waiting-wifi':
            return t('wifiLine', { size });
        case 'failed':
            return t('failedLine', { server });
        case 'done':
            return t('doneLine', { size, days: x.daysLeft });
        case 'expired':
            return t(x.kind === 'song' ? 'expiredListen' : 'expiredWatch', { server });
    }
}
/** The size line of a kept row inside a group. */
export const sizeLine = (x, t) => t('size', { size: bytes(x.bytes), quality: qualityName(x, t) });
/** "3 episodes · 2.1 GB" under a group's name. */
export function groupLine(group, items, t) {
    const count = t(group.kind === 'season' ? 'episodes' : 'songs', { count: items.length });
    return t('groupSize', { count, size: bytes(items.reduce((s, x) => s + x.bytes, 0)) });
}
