// SPDX-License-Identifier: AGPL-3.0-only
// Who the server's emails are from (docs/product/emails.md), handed to notifications so it imports
// neither personalization nor metadata (ADR 0036): the server's name, its external URL, General's
// language and time zone, its logo, and a movie's poster.
//
// - The logo is the mark from Settings › Appearance when it's a PNG. A mark can also be SVG, which
//   most email clients don't show (Gmail and Outlook among them: https://www.caniemail.com/features/image-svg/),
//   and rasterising it would take a native renderer, so an SVG mark gives highsea's app icon
//   instead (notifications' fallback).
// - The poster comes from the metadata image cache at w185, near twice the 96px the email shows it
//   at, as a JPEG from TMDB; a movie with no cached poster has none.
import { readFile } from 'node:fs/promises'
import type { CachedImage } from '@highsea/metadata'
import { parseImageUrl } from '@highsea/metadata'
import type { MailBrand } from '@highsea/notifications/channels'

const POSTER_SIZE = 'w185'

export function createMailBrand(deps: {
  serverName(): string
  externalUrl(): string | null
  general(): { language: string; timeZone: string }
  /** Settings › Appearance's mark, if one is set. */
  mark(): { type: string; data: Uint8Array } | null
  /** A movie's cached poster: the server's image path. */
  poster(tmdbId: number): string | null
  image(parts: {
    owner: string
    ownerId: number
    kind: string
    size: string
    file: string
  }): Promise<CachedImage>
}): () => MailBrand {
  return () => {
    const general = deps.general()
    return {
      server: deps.serverName(),
      externalUrl: deps.externalUrl(),
      locale: general.language,
      timeZone: general.timeZone,
      logo() {
        const mark = deps.mark()
        return mark?.type === 'image/png'
          ? { content: mark.data, contentType: 'image/png', filename: 'logo.png' }
          : null
      },
      async poster(tmdbId) {
        const path = deps.poster(tmdbId)
        const ref = path ? parseImageUrl(path) : null
        if (!ref) return null
        const image = await deps.image({ ...ref, size: POSTER_SIZE })
        return {
          content: await readFile(image.path),
          contentType: image.contentType,
          filename: `poster${ref.file.slice(ref.file.lastIndexOf('.'))}`,
        }
      },
    }
  }
}
