// SPDX-License-Identifier: AGPL-3.0-only
// Each account's profiles (the owner, 2026-10-30; prototype-gaps.md › 3.6), kept by the mock
// server as the real one will keep them (the contract's drafted `profiles` routes): one account
// holds profiles for the people who watch with it, each with a name, a colour and an optional
// four-digit PIN that never leaves the server. Every account starts with the four the prototype
// seeded (Theo's PIN is 2580), the account's own first, and the one watching now is the account's,
// so switching on one app is seen on every other. A wrong PIN counts against the profile; the
// fifth in a row rests it for a minute, as the sign-in's limiter rests an account
// (packages/auth's sign-in.ts).
//
// Moved here from the prototype's in-memory store (design/prototypes/src/client/profiles.ts) with
// B3 of the one client platform. Whether a TV asks who's watching when it opens is the TV's own
// setting, kept on the device, not here.
import type { MockServer } from './server.ts'

export const PROFILE_TONES = ['accent', 'info', 'success', 'warning', 'danger'] as const
export type ProfileTone = (typeof PROFILE_TONES)[number]

/** How many profiles an account may have (the contract's MAX_PROFILES). */
export const MAX_PROFILES = 6
/** Wrong PINs in a row before a profile rests, and for how long. */
export const PIN_TRIES = 5
export const PIN_REST_MS = 60_000

/** A profile as the apps see it: whether it has a PIN, never the PIN. */
export type Profile = {
  id: string
  name: string
  tone: ProfileTone
  hasPin: boolean
  main: boolean
}
export type Profiles = { profiles: Profile[]; current: string; max: number }

type Kept = Omit<Profile, 'hasPin'> & { pin: string | null }
type Book = {
  profiles: Kept[]
  current: string
  /** Wrong PINs in a row, and when a resting profile may be tried again, by profile. */
  wrong: Map<string, number>
  restUntil: Map<string, number>
}

const seed = (): Book => ({
  profiles: [
    { id: 'p-ines', name: 'Ines', tone: 'accent', pin: null, main: true },
    { id: 'p-theo', name: 'Theo', tone: 'info', pin: '2580', main: false },
    { id: 'p-ruth', name: 'Ruth', tone: 'success', pin: null, main: false },
    { id: 'p-kids', name: 'Kids', tone: 'warning', pin: null, main: false },
  ],
  current: 'p-ines',
  wrong: new Map(),
  restUntil: new Map(),
})

/** What a profile call refuses, for the server's answer: the transport and the prototype word it. */
export type ProfileRefusal =
  | { kind: 'not-found' }
  | { kind: 'full' }
  | { kind: 'main' }
  | { kind: 'invalid'; field: 'name' | 'pin' }
  | { kind: 'wrong-pin'; name: string }
  | { kind: 'resting'; retryAfter: number }

export class ProfileRefused extends Error {
  readonly refusal: ProfileRefusal
  constructor(refusal: ProfileRefusal) {
    super(refusal.kind)
    this.refusal = refusal
  }
}

/** Every account's profiles, per mock server, so each app on the server sees the same. */
const books = new WeakMap<MockServer, Map<string, Book>>()
let made = 0

const PIN = /^\d{4}$/

/** The profiles of `accountId` on `srv`: listed, added, changed, deleted and chosen. */
export function profilesOf(srv: MockServer, accountId: string) {
  let all = books.get(srv)
  if (!all) {
    all = new Map()
    books.set(srv, all)
  }
  let book = all.get(accountId)
  if (!book) {
    book = seed()
    all.set(accountId, book)
  }
  const b = book
  const changed = () => srv.events.emit({ type: 'profiles.updated' })
  const shown = (p: Kept): Profile => ({
    id: p.id,
    name: p.name,
    tone: p.tone,
    hasPin: p.pin !== null,
    main: p.main,
  })
  const find = (id: string) => {
    const p = b.profiles.find((x) => x.id === id)
    if (!p) throw new ProfileRefused({ kind: 'not-found' })
    return p
  }
  const named = (name: string) => {
    const n = name.trim()
    if (!n || n.length > 40) throw new ProfileRefused({ kind: 'invalid', field: 'name' })
    return n
  }
  const list = (): Profiles => ({
    profiles: b.profiles.map(shown),
    current: b.current,
    max: MAX_PROFILES,
  })

  return {
    list,
    /** Adds a profile without a PIN; the app chooses it next, as the prototype's Add did. */
    create(name: string, tone: ProfileTone): Profile {
      if (b.profiles.length >= MAX_PROFILES) throw new ProfileRefused({ kind: 'full' })
      const p: Kept = { id: `p-new-${++made}`, name: named(name), tone, pin: null, main: false }
      b.profiles.push(p)
      changed()
      return shown(p)
    },
    /** Its name, its colour, or its PIN (null turns it off). */
    update(id: string, patch: { name?: string; tone?: ProfileTone; pin?: string | null }) {
      const p = find(id)
      if (patch.pin != null && !PIN.test(patch.pin))
        throw new ProfileRefused({ kind: 'invalid', field: 'pin' })
      if (patch.name !== undefined) p.name = named(patch.name)
      if (patch.tone !== undefined) p.tone = patch.tone
      if (patch.pin !== undefined) {
        p.pin = patch.pin
        b.wrong.delete(id)
        b.restUntil.delete(id)
      }
      changed()
      return shown(p)
    },
    /** Deletes a profile and its watch history; never the account's own. */
    delete(id: string) {
      const p = find(id)
      if (p.main) throw new ProfileRefused({ kind: 'main' })
      b.profiles = b.profiles.filter((x) => x.id !== id)
      if (b.current === id) b.current = b.profiles[0]?.id ?? ''
      changed()
    },
    /**
     * Watch as a profile. The one watching now, and one without a PIN, need none; a wrong PIN is
     * refused, and the fifth in a row rests the profile for PIN_REST_MS.
     */
    choose(id: string, pin: string | undefined, now: number): Profiles {
      const p = find(id)
      if (p.pin !== null && p.id !== b.current) {
        const until = b.restUntil.get(id) ?? 0
        if (until > now)
          throw new ProfileRefused({ kind: 'resting', retryAfter: Math.ceil((until - now) / 1000) })
        if (pin !== p.pin) {
          const tries = (b.wrong.get(id) ?? 0) + 1
          if (tries >= PIN_TRIES) {
            b.wrong.delete(id)
            b.restUntil.set(id, now + PIN_REST_MS)
            throw new ProfileRefused({ kind: 'resting', retryAfter: PIN_REST_MS / 1000 })
          }
          b.wrong.set(id, tries)
          throw new ProfileRefused({ kind: 'wrong-pin', name: p.name })
        }
      }
      b.wrong.delete(id)
      b.current = id
      changed()
      return list()
    },
  }
}

/** For the tests: every account back to the seed. */
export const resetProfiles = (srv: MockServer) => books.delete(srv)
