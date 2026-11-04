// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./launch-setting.ts: the TV's frame in the prototypes, and a browser, keep
// whether to ask who's watching in localStorage, which may be missing or refuse (a private window),
// so each read and write is guarded and the default is to ask.
import type {
  readAskOnLaunch as nativeRead,
  writeAskOnLaunch as nativeWrite,
} from './launch-setting.ts'

const KEY = 'highsea.profiles.askOnLaunch'

export const readAskOnLaunch: typeof nativeRead = async () => {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

export const writeAskOnLaunch: typeof nativeWrite = (askOnLaunch) => {
  try {
    globalThis.localStorage?.setItem(KEY, String(askOnLaunch))
  } catch {
    // kept for this run only
  }
}
