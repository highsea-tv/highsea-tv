// SPDX-License-Identifier: AGPL-3.0-only
// Where the phone and the TV keep the servers they know (ADR 0058, ADR 0059): names and addresses
// in `servers.json` in the app's documents, each device token in the keychain through
// expo-secure-store (https://docs.expo.dev/versions/latest/sdk/securestore/), never in the file.
// Requests go through Expo's streaming fetch, so the event stream works
// (https://docs.expo.dev/versions/latest/sdk/expo/#expofetch-api). The web keeps its own
// (./server-store.web.ts): the page's server and its session cookie.
import type { Known } from '@highsea-tv/client/servers'
import { tokenKey } from '@highsea-tv/client/servers'
import type { Fetch } from '@highsea-tv/sdk'
import { fetch as expoFetch } from 'expo/fetch'
import { File, Paths } from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'

export type Stored = { current: string | null; servers: Known[] }

const file = () => new File(Paths.document, 'servers.json')

export async function loadStored(): Promise<Stored> {
  try {
    const f = file()
    if (!f.exists) return { current: null, servers: [] }
    return JSON.parse(await f.text()) as Stored
  } catch {
    return { current: null, servers: [] }
  }
}

export function saveStored(stored: Stored) {
  const f = file()
  if (!f.exists) f.create()
  f.write(JSON.stringify(stored))
}

export const readToken = (id: string) => SecureStore.getItemAsync(tokenKey(id))

/** Keeps a device token; the native apps always sign in as a device, so there is one. */
export async function writeToken(id: string, token: string | undefined): Promise<string> {
  if (!token) throw new Error('No device token to keep')
  await SecureStore.setItemAsync(tokenKey(id), token)
  return token
}

export const dropToken = (id: string) => SecureStore.deleteItemAsync(tokenKey(id))

/** Whether sign-in is a session cookie, so no token goes with requests: never on the phone or TV. */
export const COOKIE: boolean = false

// Expo's fetch takes the platform's RequestInit; the SDK's Fetch is the DOM's
export const platformFetch = expoFetch as unknown as Fetch
