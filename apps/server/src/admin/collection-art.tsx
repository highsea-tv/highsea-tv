'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A collection's poster (collections.md#artwork), ported from the prototype's kit/collection-art.tsx:
// the one chosen, or a mosaic of its first four posters, as Plex draws a smart collection's.
import { cn } from '@highsea-tv/ui-web'

export function CollectionArt({
  poster,
  mosaic,
  className,
}: {
  /** The chosen poster. */
  poster?: string | null
  /** Up to four posters; used when there's no chosen one. */
  mosaic: string[]
  className?: string
}) {
  const frame = cn(
    'relative isolate aspect-poster overflow-hidden rounded-poster bg-s2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)]',
    className,
  )
  if (poster || mosaic.length < 2) {
    const src = poster ?? mosaic[0]
    return (
      <div className={frame}>
        {src && (
          // biome-ignore lint/performance/noImgElement: the server's image cache serves TMDB's sizes already (checkpoint 4, decision 4), as Poster does
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        )}
      </div>
    )
  }
  return (
    <div className={cn(frame, 'grid grid-cols-2 grid-rows-2 gap-px')}>
      {[0, 1, 2, 3].map((i) => (
        // biome-ignore lint/performance/noImgElement: as above
        <img
          key={i}
          src={mosaic[i % mosaic.length]}
          alt=""
          className="size-full min-h-0 object-cover"
        />
      ))}
    </div>
  )
}
