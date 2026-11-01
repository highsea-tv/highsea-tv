// SPDX-License-Identifier: AGPL-3.0-only
// Profiles (the owner, 2026-10-30): one account, the person the server's owner invited, holds
// profiles for the people who watch with it, each with its own name, colour, watch history and
// Home, and an optional PIN. They're the account's, kept by the server, so any client can add or
// switch them without signing in again, and every client asks for a profile's PIN. The account's
// own profile is the first, and can't be deleted. The prototype keeps all of this in memory, one
// store for every app, so switching on the web or the phone (prototype-gaps.md › 3.6) is seen on
// the TV too.
import { useSyncExternalStore } from 'react'

/** A profile's colour, from the tokens' soft pairs. */
export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger'
export const tones: Tone[] = ['accent', 'info', 'success', 'warning', 'danger']

/** Each colour's soft pair from the tokens, as literal classes so Tailwind finds them. */
export const toneClass: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent-text',
  info: 'bg-badge-info-bg text-badge-info',
  success: 'bg-badge-success-bg text-badge-success',
  warning: 'bg-badge-warning-bg text-badge-warning',
  danger: 'bg-badge-danger-bg text-badge-danger',
}

export type Profile = {
  id: string
  name: string
  tone: Tone
  /** Four digits, or none: the server keeps it, so every client asks for it. */
  pin: string | null
  /** The account's own profile. */
  main: boolean
}

/**
 * The account's profiles (Theo's PIN is 2580), the one this TV watches as, and whether this TV
 * asks who's watching when highsea opens: the TV's own setting, not the account's.
 */
type State = { profiles: Profile[]; current: string; askOnLaunch: boolean }

const seed = (): State => ({
  profiles: [
    { id: 'p-ines', name: 'Ines', tone: 'accent', pin: null, main: true },
    { id: 'p-theo', name: 'Theo', tone: 'info', pin: '2580', main: false },
    { id: 'p-ruth', name: 'Ruth', tone: 'success', pin: null, main: false },
    { id: 'p-kids', name: 'Kids', tone: 'warning', pin: null, main: false },
  ],
  current: 'p-ines',
  askOnLaunch: true,
})

/** How many profiles an account may have. */
export const MAX_PROFILES = 6

let state = seed()
let count = 0
const listeners = new Set<() => void>()
const set = (next: State) => {
  state = next
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Whether this TV asks who's watching when highsea opens. */
export const setAskOnLaunch = (askOnLaunch: boolean) => set({ ...state, askOnLaunch })

export function usePeople() {
  const s = useSyncExternalStore(subscribe, () => state)
  const me = s.profiles.find((p) => p.id === s.current) ?? s.profiles[0]
  return {
    people: s.profiles,
    me: me as Profile,
    askOnLaunch: s.askOnLaunch,
    setAskOnLaunch,
    /** Watch as another profile; its PIN, if it has one, was asked for first. */
    switchTo: (id: string) => set({ ...state, current: id }),
    /** Sets the current profile's PIN, or turns it off with null. */
    setPin: (pin: string | null) =>
      set({
        ...state,
        profiles: state.profiles.map((p) => (p.id === state.current ? { ...p, pin } : p)),
      }),
    /** Adds a profile to the account and watches as it; returns its id. */
    add: (name: string, tone: Tone) => {
      count += 1
      const id = `p-new-${count}`
      set({
        ...state,
        profiles: [...state.profiles, { id, name, tone, pin: null, main: false }],
        current: id,
      })
      return id
    },
    /** Deletes a profile and its watch history; never the account's own. */
    remove: (id: string) => {
      const p = state.profiles.find((x) => x.id === id)
      if (!p || p.main) return
      const profiles = state.profiles.filter((x) => x.id !== id)
      set({
        ...state,
        profiles,
        current: state.current === id ? (profiles[0]?.id ?? '') : state.current,
      })
    },
  }
}

/** For the tests: back to the seeded account. */
export const resetPeople = () => {
  count = 0
  set(seed())
}
