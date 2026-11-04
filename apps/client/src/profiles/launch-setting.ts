// SPDX-License-Identifier: AGPL-3.0-only
// Whether this TV asks who's watching when highsea opens (the owner, 2026-10-30): the TV's own
// setting, kept on the device, not by the server (the contract's profiles.ts says so), in
// `profiles.json` in the app's documents through expo-file-system
// (https://docs.expo.dev/versions/latest/sdk/filesystem/), as the servers it knows are kept
// (@highsea-tv/native's server-store.ts). The web keeps it in localStorage (./launch-setting.web.ts).
// It asks unless told otherwise, and a file that can't be read asks too.
import { File, Paths } from 'expo-file-system'

const file = () => new File(Paths.document, 'profiles.json')

export async function readAskOnLaunch(): Promise<boolean> {
  try {
    const f = file()
    if (!f.exists) return true
    return (JSON.parse(await f.text()) as { askOnLaunch?: boolean }).askOnLaunch !== false
  } catch {
    return true
  }
}

export function writeAskOnLaunch(askOnLaunch: boolean) {
  try {
    const f = file()
    if (!f.exists) f.create()
    f.write(JSON.stringify({ askOnLaunch }))
  } catch {
    // kept for this run only
  }
}
