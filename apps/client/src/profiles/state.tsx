// SPDX-License-Identifier: AGPL-3.0-only
// The account's profiles in the client (prototype-gaps.md › 3.6; one-client-platform-b.md › B3),
// only when the server serves them: the contract drafts the `profiles` routes, the mock answers
// them, and a real server doesn't yet, so its public info leaves `profiles` out of `sources`
// (useServes) and this provider never asks it (it would answer 501). The shell holds the provider
// ((in)/_layout.tsx); every screen and part reads it through `useProfilesState`, which is null on
// a server without profiles, and then draws exactly what it drew at B2.
//
// The server keeps the profiles and checks their PINs (an app never sees one); the rules and words
// are @highsea-tv/client/profiles'. Whether this TV asks who's watching when highsea opens is the
// TV's own setting, kept on the device (./launch-setting.ts).
import type { Profile, ProfileTone } from '@highsea-tv/api-contract'
import { useProfiles, useServes } from '@highsea-tv/client/data'
import { createProfilesText, PIN_REST_S, profileRefusal } from '@highsea-tv/client/profiles'
import { useLocale } from '@highsea-tv/i18n/react'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { readAskOnLaunch, writeAskOnLaunch } from './launch-setting'

/** What the server said to a PIN it refused: the words to show, and how long it rests, if it does. */
export type Refused = { message: string; restS: number | null }

export type ProfilesState = {
  profiles: Profile[]
  /** The profile watching now; until the server answers, none. */
  me: Profile | undefined
  max: number
  ready: boolean
  /** Watch as a profile, with its PIN when it has one; null once it's watching, else why not. */
  switchTo: (id: string, pin?: string) => Promise<Refused | null>
  /** Adds a profile to the account and watches as it; returns its id. */
  add: (name: string, tone: ProfileTone) => Promise<string>
  /** Sets the current profile's PIN, or turns it off with null. */
  setPin: (pin: string | null) => Promise<unknown>
  /** Deletes a profile and its watch history; the server keeps the account's own. */
  remove: (id: string) => Promise<unknown>
}

const Profiles = createContext<ProfilesState | null>(null)

/** The account's profiles, or null when this server doesn't serve them. */
export const useProfilesState = () => useContext(Profiles)

/** The profile watching now, for the avatar, the account menu and You; null without profiles. */
export const useWatching = () => useContext(Profiles)?.me ?? null

export function ProfilesProvider({ children }: { children: ReactNode }) {
  // One element around the children whatever public info says: wrapping them in another once it
  // answers would mount the whole signed-in shell again (React keeps a subtree's state only while
  // the same type stays at the same position: https://react.dev/learn/preserving-and-resetting-state).
  // A server without profiles is never asked for them.
  const served = useServes('profiles')
  const p = useProfiles(served)
  const locale = useLocale()
  const text = useMemo(() => createProfilesText(locale), [locale])
  const { profiles, me, max, choose, create, update, remove } = p
  const ready = p.list.status === 'success'
  const value = useMemo<ProfilesState>(
    () => ({
      profiles,
      me,
      max,
      ready,
      switchTo: async (id, pin) => {
        try {
          await choose(id, pin)
          return null
        } catch (e) {
          const why = profileRefusal(e)
          if (!why) throw e
          const name = profiles.find((x) => x.id === id)?.name ?? ''
          return {
            message: text.refused(name, why),
            restS: why.kind === 'resting' ? why.retryAfter || PIN_REST_S : null,
          }
        }
      },
      add: async (name, tone) => {
        const made = await create(name, tone)
        await choose(made.id)
        return made.id
      },
      setPin: (pin) => (me ? update(me.id, { pin }) : Promise.resolve()),
      remove: (id) => remove(id),
    }),
    [profiles, me, max, ready, choose, create, update, remove, text],
  )
  return <Profiles.Provider value={served ? value : null}>{children}</Profiles.Provider>
}

// ---------------------------------------------------------------- asking on launch

let ask: boolean | null = null
const listeners = new Set<() => void>()
const tell = () => {
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/**
 * Whether this TV asks who's watching when highsea opens, as kept on the device (null until it's
 * read), and how to change it.
 */
export function useAskOnLaunch(): [boolean | null, (next: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => ask)
  useEffect(() => {
    if (ask !== null) return
    let live = true
    void readAskOnLaunch().then((kept) => {
      if (!live || ask !== null) return
      ask = kept
      tell()
    })
    return () => {
      live = false
    }
  }, [])
  return [
    value,
    (next) => {
      ask = next
      writeAskOnLaunch(next)
      tell()
    },
  ]
}

/** For the tests: read the device's setting again. */
export const forgetAskOnLaunch = () => {
  ask = null
}
