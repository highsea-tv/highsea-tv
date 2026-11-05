// SPDX-License-Identifier: AGPL-3.0-only
// `@highsea-tv/auth/codes`: what a TV's sign-in code is, without Node: how it's typed, how long it
// lasts and how often the TV asks (pairing.ts). The prototypes' mock answers by the same rules.

export const PAIRING_TTL = 10 * 60_000
/** How often the TV should ask (RFC 8628 § 3.2's `interval`, which defaults to 5 seconds). */
export const PAIRING_INTERVAL = 5

/** Normalizes a typed code: case, spaces and dashes don't matter. */
export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '')
