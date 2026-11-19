// SPDX-License-Identifier: AGPL-3.0-only
// Profiles on every client (the owner, 2026-10-30; prototype-gaps.md › 3.6; one-client-platform-b.md
// › B3), moved from the prototype's design/prototypes/src/client/profiles.ts and who.tsx less its
// store: the server keeps an account's profiles and checks their PINs (the contract's drafted
// `profiles` routes; `useProfiles` in @highsea-tv/client/data), so what's here is what every app
// decides and says around them. Whether a TV asks who's watching when highsea opens is the TV's own
// setting, kept on the device. React without the DOM.
import { PROFILE_TONES } from '@highsea-tv/api-contract';
import { createT, defineMessages } from '@highsea-tv/i18n';
export { MAX_PROFILES, PROFILE_TONES } from '@highsea-tv/api-contract';
/** Wrong PINs in a row before the server rests a profile, and for how long (its 429's Retry-After). */
export const PIN_TRIES = 5;
export const PIN_REST_S = 60;
/** Four digits. */
export const PIN_LENGTH = 4;
/** Whether choosing `p` asks for its PIN first: not the one watching now, nor one without a PIN. */
export const needsPin = (p, current) => p.hasPin && p.id !== current;
/** The digits typed so far, kept to four: what a PIN field or pad holds. */
export const pinDigits = (typed) => typed.replace(/\D/g, '').slice(0, PIN_LENGTH);
/** Whether another profile can be added. */
export const canAdd = (count, max) => count < max;
/** A profile that can be deleted: never the account's own. */
export const canDelete = (p) => !p.main;
/** The next tone for a new profile: the first no profile has yet, else round again. */
export const nextTone = (taken) => PROFILE_TONES.find((t) => !taken.includes(t)) ??
    PROFILE_TONES[taken.length % PROFILE_TONES.length] ??
    'accent';
/**
 * Why the server refused a choice, from the error the SDK threw (the contract: 403 with
 * `reason: 'wrong-pin'`, 429 with `reason: 'rate-limited'` and `retryAfter` in seconds); null for
 * anything else, which the screen shows as it shows any error.
 */
export function profileRefusal(e) {
    if (!e || typeof e !== 'object')
        return null;
    const { code, status, details } = e;
    const d = (details ?? {});
    if ((code === 'forbidden' || status === 403) && d.reason === 'wrong-pin')
        return { kind: 'wrong-pin' };
    if (code === 'rate-limited' || status === 429)
        return {
            kind: 'resting',
            retryAfter: typeof d.retryAfter === 'number' ? d.retryAfter : PIN_REST_S,
        };
    return null;
}
export const profilesMessages = defineMessages({
    whoIsWatching: 'Who’s watching?',
    profiles: 'Profiles',
    watchingNow: 'Watching now',
    hasPin: '{name}, has a PIN',
    hasPinWatching: '{name}, has a PIN, watching now',
    watching: '{name}, watching now',
    enterPin: 'Enter {name}’s PIN',
    pinField: '{name}’s PIN, four digits',
    wrongPin: 'That isn’t {name}’s PIN. Try again.',
    resting: 'Too many tries. Try again in a minute.',
    someoneElse: 'Someone else',
    addProfile: 'Add a profile',
    switchProfile: 'Switch profile',
    cancel: 'Cancel',
});
export function createProfilesText(locale = 'en') {
    const t = createT(profilesMessages, locale);
    return {
        whoIsWatching: t('whoIsWatching'),
        profiles: t('profiles'),
        watchingNow: t('watchingNow'),
        someoneElse: t('someoneElse'),
        addProfile: t('addProfile'),
        switchProfile: t('switchProfile'),
        cancel: t('cancel'),
        /** A profile's name for screen readers: whether it has a PIN, and whether it's watching now. */
        label: (p, current = false) => p.hasPin
            ? t(current ? 'hasPinWatching' : 'hasPin', { name: p.name })
            : current
                ? t('watching', { name: p.name })
                : p.name,
        enterPin: (name) => t('enterPin', { name }),
        pinField: (name) => t('pinField', { name }),
        /** What a refused PIN says: wrong, or resting after the fifth in a row. */
        refused: (name, why) => why.kind === 'wrong-pin' ? t('wrongPin', { name }) : t('resting'),
    };
}
