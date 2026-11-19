// SPDX-License-Identifier: AGPL-3.0-only
// What the films screens decide, once for every app (one-client-platform-b.md › B1): Home's rows
// and its hero, a card's title and caption, the A–Z index's letters, the film page's picks of
// version, audio and subtitles, its quality and lead line, a person's header, Search's kinds and
// quick picks, a collection tile's label, the words after Mark as watched, and an announcement's
// tone. Until B1 each app and the prototype had its own copy (apps/web, the phone and TV apps,
// and design/prototypes/src/client). Pure functions, in i18n catalogs (ADR 0021).
import { createT, defineMessages } from '@highsea-tv/i18n';
import { createFormat } from '../format/index.ts';
import { letterOf, libraryMessages } from '../library/index.ts';
import { settingsPageMessages } from '../prefs/index.ts';
export const filmsMessages = defineMessages({
    new: 'New',
    play: 'Play',
    resume: 'Resume',
    episodeCaption: '{code} · {rest}',
    markUnwatched: 'Mark as unwatched',
    markedUnwatched: '{title} marked as unwatched',
    startsAgain: 'It plays from the start next time.',
    tileLabel: '{name}, {caption}',
    smartTileLabel: '{name}, smart collection, {caption}',
    smart: 'Smart',
    smartCollection: 'Smart collection',
    collection: 'Collection',
    searchField: 'Search titles, genres and people',
    searchPlaceholder: 'Titles, genres and people',
    searchMovies: 'Movies',
    searchCollections: 'Collections',
    searchPeople: 'People',
    searchShows: 'Shows',
    searchEpisodes: 'Episodes',
    searchArtists: 'Artists',
    searchAlbums: 'Albums',
    searchSongs: 'Songs',
    off: 'Off',
    noAudio: 'No sound tracks',
});
/** The hero: the first hero row with something in it (client-home.md). */
export const heroOf = (sections) => sections.find((s) => s.layout === 'hero' && s.items.length > 0);
/**
 * The hero when it leads Home: the first section with something in it is a hero. Only then does
 * Home open on it full bleed under the bar (the owner's call of 2026-11-18); a hero further down,
 * or none, leaves Home as it was.
 */
export const leadHeroOf = (sections) => {
    const first = sections.find((s) => s.items.length > 0);
    return first?.layout === 'hero' ? first : undefined;
};
/** The rows under the hero, each with something in it, in the server's order. */
export const rowsOf = (sections) => sections.filter((s) => s.layout !== 'hero' && s.items.length > 0);
/** A title added this lately says "New" on the first card of a spotlight (client-home.md). */
export const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000;
/** Whether it's new at `now`: the caller passes the clock, so a seeded screen draws the same. */
export const isNew = (item, now) => now - Date.parse(item.addedAt) < NEW_FOR_MS;
// ---------------------------------------------------------------- the film page
/** The subtitle menu's Off, and the audio menu's when there's none. */
export const OFF = 'off';
/**
 * What plays: the version picked (or the first that plays), its audio picked (or its default),
 * and its subtitle picked (or none). A version's own tracks: picks for another don't carry over.
 */
export function picksOf(versions, picks) {
    const playable = versions.filter((v) => v.playable);
    const version = playable.find((v) => v.id === picks?.versionId) ?? playable[0];
    const audio = version?.audio.find((a) => a.id === picks?.audioId) ?? version?.audio.find((a) => a.default);
    const subtitle = version?.subtitles.find((s) => s.id === picks?.subtitleId);
    return {
        playable,
        version,
        audio,
        subtitle,
        /** The menus' values: the audio's id (or the first, or Off) and the subtitle's (or Off). */
        audioValue: audio?.id ?? version?.audio[0]?.id ?? OFF,
        subtitleValue: subtitle?.id ?? OFF,
    };
}
/** A version's short name in a menu: "4K · HDR10" from its label and the last part of its detail. */
export const versionLabel = (v) => v.detail ? `${v.label} · ${v.detail.split(' · ').slice(-1)[0]}` : v.label;
/**
 * The qualities a film plays in, each once ("4K HDR", "1080p"), for the tags by its title: what
 * its files are, not the versions' names (a version named for its profile, "Ultra HD", can hold a
 * 1080p file).
 */
export const qualitiesOf = (versions) => [
    ...new Set(versions.flatMap((v) => (v.playable && v.quality ? [v.quality] : []))),
];
/** A person's films here, the best rated (whose art is the page's backdrop), and how many. */
export function personHeaderOf(credits) {
    const films = credits.filter((c) => c.inLibrary);
    const best = [...films].sort((a, b) => b.rating - a.rating)[0];
    return { films, best, count: new Set(films.map((c) => c.id)).size };
}
// ---------------------------------------------------------------- Search
/**
 * The kinds the apps show, in the server's order of best match: the films' kinds, then shows and
 * episodes (B3), which only a server that serves shows sends, and artists, albums and songs (B3),
 * which only a server that serves music sends.
 */
export const SEARCH_KINDS = [
    'movies',
    'collections',
    'people',
    'shows',
    'episodes',
    'artists',
    'albums',
    'songs',
];
/** Quick picks for an empty search, as the prototype has them (design/prototypes/src/client/data.ts). */
export const SEARCH_SUGGESTIONS = [
    'Comedy',
    'Animation',
    'Science fiction',
    'Fritz Lang',
    'Saltmarsh',
    'Jazz',
    'Jan Morgenstern',
];
/** Whether the apps show a section of results: `discover` waits for requests. */
export const isShownKind = (s) => SEARCH_KINDS.includes(s.kind);
/** The search kinds that need shows or music served; the films' kinds need nothing. */
const KIND_NEEDS = {
    shows: 'shows',
    episodes: 'shows',
    artists: 'music',
    albums: 'music',
    songs: 'music',
};
/** Whether a kind of results is shown on a server that serves these (B3). */
export const servedSearchKind = (kind, serves) => {
    const need = KIND_NEEDS[kind];
    return !need || serves[need];
};
// ---------------------------------------------------------------- announcements
/** A banner's tone: a warning or worse is a warning; everything else an announcement. */
export const toneOf = (severity) => severity === 'warning' || severity === 'critical'
    ? 'warning'
    : 'announcement';
// ---------------------------------------------------------------- words
export function createFilmsText(locale = 'en') {
    const t = createT(filmsMessages, locale);
    // the words other subpaths already have: Home's own rows (Settings › Home names them too) and
    // Mark as watched (Continue watching's menu)
    const library = createT(libraryMessages, locale);
    const settings = createT(settingsPageMessages, locale);
    const format = createFormat(locale);
    return {
        /** A row's name: the server's, or this app's for a built-in row. */
        rowTitle: (s) => s.title ??
            (s.id === 'continue'
                ? settings('row.continue')
                : s.id === 'recent'
                    ? settings('row.recent')
                    : ''),
        /** A spotlight card's kicker: "New · 2010 · Fantasy", "New" only on the first and only lately. */
        kicker: (item, first, now) => [first && isNew(item, now) ? t('new') : null, item.year, item.genres[0]]
            .filter(Boolean)
            .join(' · '),
        /**
         * A card, the same on every app: the poster with the title and year under it, or Home's still;
         * on Continue watching the bar and the time left. An episode's card is its show and "S2, E6".
         */
        card(item, { wide = false, resume = false } = {}) {
            const still = wide || resume;
            const { show } = item;
            const rest = resume && item.progress !== null ? format.left(item) : null;
            const after = rest ?? show?.episode;
            return {
                title: show ? show.title : item.title,
                src: still ? (item.art.still ?? item.art.backdrop ?? null) : item.art.poster,
                aspect: still ? 'still' : 'poster',
                caption: show
                    ? after
                        ? t('episodeCaption', { code: show.code, rest: after })
                        : show.code
                    : (rest ?? (item.year ? String(item.year) : '')),
                progress: resume ? (item.progress ?? 0) : null,
                progressBelow: resume,
            };
        },
        /** The page's lead line: "2012 · 12m". */
        leadOf: (item) => [item.year ? String(item.year) : '', format.runtime(item.runtimeMinutes)]
            .filter(Boolean)
            .join(' · '),
        /** The toggle's label, and the toast after it. */
        markWatched(item) {
            const watched = !item.watched;
            return {
                label: item.watched ? t('markUnwatched') : library('markWatched'),
                /** The words once it's done: `watched` is what it became. */
                toast: (became = watched) => ({
                    title: became
                        ? library('marked', { name: item.title })
                        : t('markedUnwatched', { title: item.title }),
                    description: became ? undefined : t('startsAgain'),
                }),
            };
        },
        /** A collection's tile, as a screen reader names it, and its kind's word. */
        /**
         * The server's own collections carry `smart`; its `words` are null for one picked by hand (no
         * rules, the contract's LibraryCollection). Only a collection with rules in words is drawn as
         * smart: the Smart badge and "smart collection" in its label. One picked by hand is drawn as
         * any other collection, with no badge.
         */
        tileOf(c) {
            const caption = format.caption(c);
            const smart = !!c.smart?.words;
            return {
                caption,
                smart,
                label: t(smart ? 'smartTileLabel' : 'tileLabel', { name: c.name, caption }),
                badge: smart ? t('smart') : null,
                kind: smart ? t('smartCollection') : t('collection'),
            };
        },
        search: {
            field: t('searchField'),
            placeholder: t('searchPlaceholder'),
            kind: (k) => k === 'movies'
                ? t('searchMovies')
                : k === 'collections'
                    ? t('searchCollections')
                    : k === 'shows'
                        ? t('searchShows')
                        : k === 'episodes'
                            ? t('searchEpisodes')
                            : k === 'artists'
                                ? t('searchArtists')
                                : k === 'albums'
                                    ? t('searchAlbums')
                                    : k === 'songs'
                                        ? t('searchSongs')
                                        : t('searchPeople'),
        },
        /** The menus' words for Off and for a version with no sound. */
        off: t('off'),
        noAudio: t('noAudio'),
    };
}
/** The A–Z index's letters present in a list sorted by title, and the first title of each. */
export function lettersOf(items) {
    const present = new Set(items.map((m) => letterOf(m.title)));
    const firsts = new Set();
    items.forEach((m, i) => {
        if (i === 0 || letterOf(items[i - 1]?.title ?? '') !== letterOf(m.title))
            firsts.add(m.id);
    });
    return { present, firsts };
}
