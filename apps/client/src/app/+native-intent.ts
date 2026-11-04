// SPDX-License-Identifier: AGPL-3.0-only
// Every link the app is opened by, before expo-router follows it (https://docs.expo.dev/router/advanced/native-intent/,
// which it awaits): a sheet or dialog that's up is closed first, and iOS has dismissed it before
// the link's screen is presented, since a screen presented while one is going away never shows
// (@highsea-tv/ui's yieldToLink). Who's watching's sheet over You, then a film's player, was the case.
import { yieldToLink } from '@highsea-tv/ui'

export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  await yieldToLink()
  return path
}
