import { letterOfSorted } from '@highsea-tv/core/letters';
import { createT, defineMessages } from '@highsea-tv/i18n';
import { languageName } from '@highsea-tv/i18n/languages';
import { createFormat } from '../format/index.ts';
export const SORTS = ['title', 'added', 'year', 'rating'];
export const ALL = 'all';
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
/** "The Matrix" files under M, as the admin's sort title does. */
export const sortTitle = (title) => title.replace(/^(the|a|an)\s+/i, '');
export function arrange(items, genre, sort, unwatched = false) {
    const shown = items.filter((m) => (genre === ALL || m.genres.includes(genre)) && !(unwatched && m.watched));
    return [...shown].sort((a, b) => sort === 'added'
        ? Date.parse(b.addedAt) - Date.parse(a.addedAt)
        : sort === 'year'
            ? (b.year ?? 0) - (a.year ?? 0)
            : sort === 'rating'
                ? b.rating - a.rating
                : collator.compare(sortTitle(a.title), sortTitle(b.title)));
}
export const genresOf = (items) => [...new Set(items.flatMap((m) => m.genres))].sort((a, b) => collator.compare(a, b));
/** The A–Z index beside a library sorted by title, as the admin's (@highsea-tv/core/letters). */
export { LETTERS } from '@highsea-tv/core/letters';
/** The letter a title files under, by its sort title ("The Matrix" under M). */
export const letterOf = (title) => letterOfSorted(sortTitle(title));
// ---------------------------------------------------------------------------------------------
// Continue watching's menu (client-home.md › Continue watching), the same on every app: ⋯ on the
// card on the web and desktop, a long press on the phone, OK held on the TV. Go to the film (or
// the show at the episode, once shows come), Mark as watched, and Remove from Continue watching,
// which forgets the place without marking the title watched (prototype-gaps.md › 2.4).
/** How long a press is held before it opens a card's menu: the film page's hold of OK. */
export const LONG_PRESS_MS = 600;
/** The film's page, or the show's opened at the episode (@highsea-tv/client/shows' showPath). */
export const cardPage = (c) => c.show ? `/shows/${c.show.id}?episode=${c.id}` : `/movies/${c.id}`;
/** The player at a title (Play, Resume, Continue watching's cards); `start` plays from the start. */
export const playPath = (id, start = false) => `/play/${id}${start ? '/start' : ''}`;
/** A card's player: a film's, or an episode's (`/play/episode/{id}`, as episodePlayPath has it). */
export const cardPlayPath = (c, start = false) => c.show ? `/play/episode/${c.id}${start ? '/start' : ''}` : playPath(c.id, start);
export const libraryMessages = defineMessages({
    sortByTitle: 'Title',
    sortByAdded: 'Recently added',
    sortByYear: 'Newest first',
    sortByRating: 'Highest rated',
    allMovies: 'All movies',
    unwatched: 'Unwatched',
    goToFilm: 'Go to the film',
    goToShow: 'Go to the show',
    markWatched: 'Mark as watched',
    remove: 'Remove from Continue watching',
    marked: '{name} marked as watched',
    removed: '{name} removed from Continue watching',
    removedDetail: 'It isn’t marked as watched.',
    episodeName: '{show}, {code}',
    released: 'Released',
    runtime: 'Runtime',
    rated: 'Rated',
    notRated: 'Not rated',
    genres: 'Genres',
    directedBy: 'Directed by',
    writtenBy: 'Written by',
    studio: 'Studio',
    originalTitle: 'Original title',
    soundtrack: 'Soundtrack',
    versions: 'Versions',
    audio: 'Audio',
    subtitles: 'Subtitles',
    noneListed: 'None listed',
    none: 'None',
    roleWriter: 'Writer',
    roleMusic: 'Music',
    roleCamera: 'Cinematography',
    deptActing: 'Acting',
    deptDirecting: 'Directing',
    deptWriting: 'Writing',
    deptProduction: 'Producing',
    deptSound: 'Music and sound',
    deptCamera: 'Cinematography',
    deptEditing: 'Editing',
    movies: '{count, plural, one {# movie} other {# movies}}',
    shows: '{count, plural, one {# show} other {# shows}}',
    albums: '{count, plural, one {# album} other {# albums}}',
    and: '{list} and {last}',
    here: '{list} here',
    born: 'Born {date}',
    bornIn: 'Born {date} in {place}',
    died: 'Died {date}',
    // a show's Information (the prototype's web/show.tsx informationOf)
    createdBy: 'Created by',
    firstAired: 'First aired',
    status: 'Status',
    stillAiring: 'Still airing',
    endedIn: 'Ended in {year}',
    showHere: 'Here',
    showHereIs: '{seasons, plural, one {# season} other {# seasons}} · {episodes, plural, one {# episode} other {# episodes}}',
    episodeLength: 'Episodes',
    aboutMinutes: 'About {minutes} min each',
});
/** The order a person's rows come in after the one they're known for: TMDB's departments'. */
const DEPARTMENT_ORDER = [
    'Acting',
    'Directing',
    'Writing',
    'Production',
    'Sound',
    'Camera',
    'Editing',
];
/** A biography this long or longer is cut, with More to show the rest (client-people.md). */
export const LONG_BIO = 240;
/**
 * A person's films here, a row per department (client-people.md): the one they're known for first,
 * then TMDB's order, each newest first, a film's roles in one department joined ("Director,
 * Writer"). Credits for films not here are left out; a department with none is too. Its title is
 * `departmentTitle`'s.
 */
export function filmographyOf(credits, knownFor) {
    const here = credits.filter((c) => c.inLibrary);
    // TMDB's other departments (Art, Lighting, Crew) come last, as they first appear
    const known = DEPARTMENT_ORDER;
    const others = [...new Set(here.map((c) => c.department))].filter((d) => !known.includes(d));
    const order = [knownFor, ...known, ...others].filter((d, i, all) => !!d && all.indexOf(d) === i);
    return order.flatMap((department) => {
        const films = new Map();
        for (const c of here) {
            if (c.department !== department)
                continue;
            const had = films.get(c.id);
            films.set(c.id, had ? { item: had.item, role: `${had.role}, ${c.role}` } : { item: c, role: c.role });
        }
        const list = [...films.values()].sort((a, b) => (b.item.year ?? 0) - (a.item.year ?? 0));
        return list.length > 0 ? [{ department, credits: list }] : [];
    });
}
/** The trailer the page's Trailer button plays: the first trailer, or a teaser before release. */
export const previewOf = (d) => d.videos.find((x) => x.kind === 'Trailer' || x.kind === 'Teaser');
/** Cast and crew in one row: the cast in billing order, the directors, then the rest of the crew. */
export const peopleOf = (d) => [
    ...d.cast,
    ...d.directors,
    ...(d.crew ?? []).filter((c) => !d.directors.some((x) => x.personId === c.personId)),
];
/** "2:04". */
export const videoLength = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export function createLibraryText(locale = 'en') {
    const t = createT(libraryMessages, locale);
    const format = createFormat(locale);
    const longDate = (iso) => new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
    const list = (parts) => parts.length > 1
        ? t('and', { list: parts.slice(0, -1).join(', '), last: parts.at(-1) ?? '' })
        : (parts[0] ?? '');
    /** A crew member's job as the page names it: plainer than TMDB's titles. */
    const roles = {
        Screenplay: t('roleWriter'),
        'Original Music Composer': t('roleMusic'),
        'Director of Photography': t('roleCamera'),
    };
    const names = (people) => people.map((x) => x.name).join(', ');
    const departments = {
        Acting: t('deptActing'),
        Directing: t('deptDirecting'),
        Writing: t('deptWriting'),
        Production: t('deptProduction'),
        Sound: t('deptSound'),
        Camera: t('deptCamera'),
        Editing: t('deptEditing'),
    };
    const sortWords = {
        title: t('sortByTitle'),
        added: t('sortByAdded'),
        year: t('sortByYear'),
        rating: t('sortByRating'),
    };
    return {
        /** The library's sorts, in the order its menu lists them. */
        sorts: SORTS.map((value) => ({ value, label: sortWords[value] })),
        /** All, or only what the person hasn't watched (client-library.md#unwatched). */
        shows: [
            { value: 'all', label: t('allMovies') },
            { value: 'unwatched', label: t('unwatched') },
        ],
        /** A language by name, from the catalog (Hermes has no Intl.DisplayNames). */
        languageName,
        names,
        /** Who they play, or their job in plain words. */
        role: (c) => c.character ?? (c.job ? (roles[c.job] ?? c.job) : ''),
        /** A person's roles in one film, as the page names them ("Director, Writer"). */
        roleNames: (joined) => joined
            .split(', ')
            .map((x) => roles[x] ?? x)
            .join(', '),
        /** Each department's row on a person's page, named by what they did. */
        departmentTitle: (d) => departments[d] ?? d,
        /** Information: when, how long, the rating, the genres and who made it. */
        informationOf(d) {
            const m = d.item;
            const crew = d.crew ?? [];
            const writers = crew.filter((c) => c.job === 'Screenplay');
            const facts = [
                !!m.releaseDate && [t('released'), longDate(m.releaseDate)],
                !!m.runtimeMinutes && [t('runtime'), format.runtime(m.runtimeMinutes)],
                [t('rated'), d.certification ?? t('notRated')],
                m.genres.length > 0 && [t('genres'), m.genres.join(', ')],
                d.directors.length > 0 && [t('directedBy'), names(d.directors)],
                writers.length > 0 && [t('writtenBy'), names(writers)],
                d.studios.length > 0 && [t('studio'), d.studios.join(', ')],
                d.originalTitle !== m.title && [t('originalTitle'), d.originalTitle],
                !!d.soundtrack && [t('soundtrack'), d.soundtrack.title, `/music/albums/${d.soundtrack.id}`],
            ];
            return facts.filter((x) => x !== false);
        },
        /**
         * A show's Information: who created it, when it first aired (its first episode, else its
         * year), whether it's still airing, how much of it is here, an episode's length, its rating
         * and its genres.
         */
        showInformationOf(d) {
            const s = d.show;
            const first = d.seasons.find((x) => x.number === 1)?.episodes[0];
            const facts = [
                d.creators.length > 0 && [t('createdBy'), names(d.creators)],
                [t('firstAired'), first ? longDate(`${first.aired}T12:00:00Z`) : String(s.year)],
                [t('status'), s.endYear === null ? t('stillAiring') : t('endedIn', { year: s.endYear })],
                [t('showHere'), t('showHereIs', { seasons: s.seasons, episodes: s.episodes })],
                s.runtimeMinutes > 0 && [
                    t('episodeLength'),
                    t('aboutMinutes', { minutes: s.runtimeMinutes }),
                ],
                [t('rated'), s.certification || t('notRated')],
                s.genres.length > 0 && [t('genres'), s.genres.join(', ')],
            ];
            return facts.filter((x) => x !== false);
        },
        /** Languages and quality: each language once, by name, whichever versions it comes in. */
        languagesOf(d) {
            const spoken = (tracks) => [...new Set(tracks.filter((x) => x.language).map((x) => languageName(x.language)))].join(', ');
            return [
                [t('versions'), d.versions.map((v) => v.label).join(', ')],
                [t('audio'), spoken(d.versions.flatMap((v) => v.audio)) || t('noneListed')],
                [t('subtitles'), spoken(d.versions.flatMap((v) => v.subtitles)) || t('none')],
            ];
        },
        /** "3 movies, 2 shows and 4 albums here": what a person's page has, leaving out what's none. */
        hereOf(counts) {
            const parts = [
                counts.films > 0 && t('movies', { count: counts.films }),
                !!counts.shows && t('shows', { count: counts.shows }),
                !!counts.albums && t('albums', { count: counts.albums }),
            ].filter((x) => typeof x === 'string');
            return t('here', { list: list(parts) });
        },
        /** "Born 4 October 1895 in Piqua, Kansas, USA · Died 1 February 1966", as much as is known. */
        lifeOf(p) {
            const parts = [
                p.born?.date &&
                    (p.born.place
                        ? t('bornIn', { date: longDate(p.born.date), place: p.born.place })
                        : t('born', { date: longDate(p.born.date) })),
                p.died && t('died', { date: longDate(p.died.date) }),
            ].filter((x) => !!x);
            return parts.length > 0 ? parts.join(' · ') : null;
        },
        /** Continue watching's menu for a card: where Go to opens, and the toasts' words. */
        continueMenu(c) {
            const name = c.show ? t('episodeName', { show: c.show.title, code: c.show.code }) : c.title;
            return {
                goTo: { label: c.show ? t('goToShow') : t('goToFilm'), path: cardPage(c) },
                markWatched: t('markWatched'),
                remove: t('remove'),
                marked: t('marked', { name }),
                removed: { title: t('removed', { name }), description: t('removedDetail') },
            };
        },
    };
}
