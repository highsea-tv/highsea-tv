// SPDX-License-Identifier: AGPL-3.0-only
// What the app loads by URL (artwork, trickplay, subtitles, the streams): a server path becomes
// the address in use with this device's token in a header, which expo-image and expo-video both
// send (https://docs.expo.dev/versions/latest/sdk/image/#imagesource,
// https://docs.expo.dev/versions/latest/sdk/video/#videosource). Full URLs (a TMDB image) go as
// they are.
import { useCurrent } from './servers.tsx'

export type Source = { uri: string; headers?: Record<string, string> }

export function useMedia() {
  const current = useCurrent()
  return (url: string | null | undefined): Source | undefined => {
    if (!url) return undefined
    if (!url.startsWith('/')) return { uri: url }
    const base = current.base()
    if (!base) return undefined
    return {
      uri: `${base}${url}`,
      ...(current.token ? { headers: { authorization: `Bearer ${current.token}` } } : {}),
    }
  }
}
