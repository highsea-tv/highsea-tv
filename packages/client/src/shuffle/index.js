/**
 * A uniform shuffle (Fisher–Yates, as Durstenfeld wrote it: Knuth, The Art of Computer
 * Programming, vol. 2, § 3.4.2, Algorithm P), into a new array. `random` returns [0, 1), as
 * Math.random does; the tests pass their own.
 */
export function shuffled(xs, random = Math.random) {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const a = out[i];
        out[i] = out[j];
        out[j] = a;
    }
    return out;
}
/**
 * A show's episodes to shuffle: every one the page lists, which are those with a file (the server
 * lists what's on disk), specials left out unless the show has only specials. Watched ones are
 * in: shuffle is mostly for watching again.
 */
export function showEpisodes(seasons) {
    const of = (special) => seasons.filter((s) => (s.number === 0) === special).flatMap((s) => s.episodes.map((e) => e.id));
    const regular = of(false);
    return regular.length ? regular : of(true);
}
/** A collection's films to shuffle: those with a file, watched or not. */
export const collectionFilms = (items) => items.filter((m) => m.playable).map((m) => m.id);
/** Whether a page offers Shuffle: two or more to play, or there's nothing to shuffle. */
export const canShuffle = (ids) => ids.length > 1;
/** A new shuffle of `ids`, at its first. */
export const makeShuffle = (kind, ids, random = Math.random) => ({ kind, ids: shuffled([...new Set(ids)], random), at: 0 });
/** The item after this one, or null at the end: it stops, it doesn't go round again. */
export const shuffleNext = (s) => s.ids[s.at + 1] ?? null;
/** The item before this one, or null at the first. */
export const shufflePrevious = (s) => (s.at > 0 ? s.ids[s.at - 1] ?? null : null);
/** The shuffle moved to `id`, or null when it isn't one of its items. */
export function shuffleAt(s, id) {
    const at = s.ids.indexOf(id);
    return at < 0 ? null : { ...s, at };
}
/** The player at an item of the shuffle: from its start, never its resume point. */
export const shufflePath = (kind, id) => `${kind === 'episode' ? `/play/episode/${id}` : `/play/${id}`}/start?shuffle=1`;
// ---------------------------------------------------------------------------------------------
// The one shuffle playing on this device, in memory: one person plays at a time on a device, and
// switching profiles leaves the player, which ends it.
let current = null;
/** Starts a shuffle and returns the player's address for its first item, or null if empty. */
export function startShuffle(kind, ids, random = Math.random) {
    const s = makeShuffle(kind, ids, random);
    const first = s.ids[0];
    if (first === undefined)
        return null;
    current = s;
    return shufflePath(kind, first);
}
/**
 * The shuffle the player at `id` is part of, moved to it: null when the player wasn't opened from
 * one (`inShuffle` false), none is playing, or `id` isn't in it.
 */
export function shuffleFor(kind, id, inShuffle) {
    if (!inShuffle || !current || current.kind !== kind)
        return null;
    const moved = shuffleAt(current, id);
    if (moved)
        current = moved;
    return moved;
}
/**
 * Hands the shuffle on to the next item's player, as a new object, so the player closing behind
 * it (`releaseShuffle`) doesn't end it.
 */
export function handOn(s) {
    current = { ...s };
}
/**
 * The player of `s`'s item closed: the shuffle ends, unless it was handed on to the next item.
 * Covers every way out of the player, the browser's Back and a swipe among them.
 */
export function releaseShuffle(s) {
    if (s && current === s)
        current = null;
}
/** Ends the shuffle: the person left the player. */
export function endShuffle() {
    current = null;
}
/** The shuffle playing now, for the tests. */
export const currentShuffle = () => current;
