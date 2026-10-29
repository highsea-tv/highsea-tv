// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's own updates (desktop-app.md › Updates; ADR 0058), through Tauri's updater
// plugin (https://v2.tauri.app/plugin/updater/), which checks each update's signature against the
// key in tauri.conf.json and can't be told not to. The app checks at start and every 6 hours and
// downloads in the background; it never interrupts: the update waits for Restart to update, or for
// the next start. Restarting reopens the page where it was. A development build doesn't check.
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { useSyncExternalStore } from 'react'
import { inApp } from '../host.ts'

const EVERY = 6 * 60 * 60_000
/** Where the page was when it restarted to update, to open there again. */
const RESUME = 'highsea:after-update'

export type AppUpdate = {
  /** This app's version. */
  current: string | null
  /** A newer version, downloaded and waiting for a restart. */
  ready: string | null
  /** When the app last asked, in ms since 1970. */
  checkedAt: number | null
}

let state: AppUpdate = { current: null, ready: null, checkedAt: null }
let waiting: Update | null = null
const listeners = new Set<() => void>()

function set(next: Partial<AppUpdate>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

async function checkNow() {
  if (waiting) return
  try {
    const update = await check()
    set({ checkedAt: Date.now() })
    if (!update) return
    await update.download()
    waiting = update
    set({ ready: update.version })
  } catch {
    // offline, or the feed isn't there yet: the next check tries again
  }
}

let started = false

/** Starts checking, once, in the app's release builds. */
export function startUpdates() {
  if (!inApp || started) return
  started = true
  getVersion().then(
    (current) => set({ current }),
    () => {},
  )
  if (import.meta.env?.DEV) return
  void checkNow()
  setInterval(() => void checkNow(), EVERY)
}

export function useAppUpdate(): AppUpdate {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}

/** Installs the waiting update and opens the app again where it was. */
export async function restartToUpdate() {
  if (!waiting) return
  try {
    localStorage.setItem(RESUME, window.location.pathname + window.location.search)
  } catch {}
  await waiting.install()
  await relaunch()
}

/** After a restart to update: back to where the page was, before the router reads the address. */
export function resumeAfterUpdate() {
  try {
    const at = localStorage.getItem(RESUME)
    if (!at) return
    localStorage.removeItem(RESUME)
    if (at.startsWith('/') && !at.startsWith('//')) window.history.replaceState(null, '', at)
  } catch {}
}
