// SPDX-License-Identifier: AGPL-3.0-only
// What the system's Now Playing shows while a film or an episode plays on the phone (the Lock
// Screen, Control Center, the Dynamic Island, CarPlay and AirPlay; Android's media notification):
// the title, a second line, and the poster. expo-video publishes it from the source's `metadata`
// (https://docs.expo.dev/versions/latest/sdk/video/#videometadata) to MPNowPlayingInfoCenter, and
// fetches `artwork` itself with a plain request (expo-video's ios/NowPlayingManager.swift,
// `fetchArtwork`: `URLSession.shared.dataTask(with: url)`), with none of the source's headers. The
// server's artwork answers only a signed-in request, so the poster never came (HT-58). So the app
// loads the poster the way it loads every image, expo-image with this device's token in a header,
// into expo-image's disk cache (`Image.prefetch`, https://docs.expo.dev/versions/latest/sdk/image/#prefetchurls-cachepolicy),
// and hands expo-video the cached file's `file://` URL (`Image.getCachePathAsync`), which
// URLSession reads as it reads any URL, and Media3 on Android likewise; no token goes into a URL.
// MPMediaItemArtwork is then made from the image at its own size
// (https://developer.apple.com/documentation/mediaplayer/mpmediaitemartwork/init(boundssize:requesthandler:)).
import { titleLines } from '@highsea-tv/client/player'
import { Image } from 'expo-image'
import type { Source } from './media.ts'

/** expo-video's `VideoMetadata`, as far as highsea fills it. */
export type NowPlayingText = { title?: string; artist?: string }

/** What the player knows of the title: the film's year, or the episode's show and code. */
export type NowPlayingDetail = Parameters<typeof titleLines>[0] & {
  item: { year?: number | null }
}

/**
 * The title and the line under it: a film's title and its year; an episode's show and
 * "S1, E1 · Pilot", as the player's own top bar has them (`titleLines`). The second line goes in
 * `artist`, the line Now Playing shows under the title (MPMediaItemPropertyArtist; Media3's
 * `setArtist`).
 */
export function nowPlayingText(d: NowPlayingDetail | undefined): NowPlayingText {
  if (!d) return {}
  const { title, line } = titleLines(d)
  const artist = line ?? (d.item.year ? String(d.item.year) : undefined)
  return { title: title || undefined, ...(artist ? { artist } : {}) }
}

/** The image cache the artwork is loaded into: expo-image's, or a test's. */
export type ArtworkCache = {
  /** Loads the image into the disk cache; false when it couldn't. */
  prefetch: (uri: string, headers: Record<string, string> | undefined) => Promise<boolean>
  /** The cached file's path, or null when it isn't on disk. */
  path: (uri: string) => Promise<string | null>
}

const expoImage: ArtworkCache = {
  // memory-disk is the default; the disk is what's needed, since Now Playing reads a file
  prefetch: (uri, headers) => Image.prefetch(uri, { cachePolicy: 'memory-disk', headers }),
  path: (uri) => Image.getCachePathAsync(uri),
}

const fileUrl = (path: string) => (path.startsWith('file://') ? path : `file://${path}`)

/**
 * The poster as a local file's URL for Now Playing, loaded with the app's own signed-in image
 * loading and cache: from the disk cache when it's there (the item page drew it), otherwise
 * fetched into it first. Undefined when there's no poster or it couldn't be loaded, so Now Playing
 * shows no picture rather than none at all.
 */
export async function artworkFile(
  src: Source | undefined,
  cache: ArtworkCache = expoImage,
): Promise<string | undefined> {
  if (!src) return undefined
  try {
    const cached = await cache.path(src.uri)
    if (cached) return fileUrl(cached)
    if (!(await cache.prefetch(src.uri, src.headers))) return undefined
    const path = await cache.path(src.uri)
    return path ? fileUrl(path) : undefined
  } catch {
    return undefined
  }
}

/** The longest a stream waits for its poster before it plays without one, in ms. */
export const ARTWORK_WAIT_MS = 1500

/** `artwork`, or undefined once `ms` have passed: the film never waits long for a picture. */
export async function within<T>(artwork: Promise<T | undefined>, ms = ARTWORK_WAIT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      artwork,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
