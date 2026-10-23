// SPDX-License-Identifier: AGPL-3.0-only
// A collection's poster: the one uploaded, or a mosaic of its first four posters, as Plex draws a
// smart collection's (docs/product/collections.md#artwork). The tile around it is the apps' Library ›
// Collections grid, built like Poster's (the same lift and ring on focus), with the smart mark.
import { Badge, cn, Icon } from '@highsea-tv/ui-web'

export function CollectionArt({
  poster,
  mosaic,
  className,
}: {
  /** The uploaded poster, or a single title's. */
  poster?: string | null
  /** Up to four posters; used when there's no uploaded one. */
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
        {src && <img src={src} alt="" className="absolute inset-0 size-full object-cover" />}
      </div>
    )
  }
  return (
    <div className={cn(frame, 'grid grid-cols-2 grid-rows-2 gap-px')}>
      {[0, 1, 2, 3].map((i) => (
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

/** A collection in the apps' grid: its art, the smart mark, its name and what it holds. */
export function CollectionTile({
  href,
  name,
  caption,
  poster,
  mosaic,
  smart,
  tv = false,
}: {
  href: string
  name: string
  caption: string
  poster: string
  mosaic?: string[]
  smart: boolean
  tv?: boolean
}) {
  return (
    <a
      href={href}
      aria-label={`${name}, ${smart ? 'smart collection, ' : ''}${caption}`}
      {...(tv ? { 'data-focusable': '' } : {})}
      className={cn(
        'group/link relative block w-full cursor-pointer text-start outline-none focus-visible:z-10',
        tv ? 'rounded-(--tv-radius-poster)' : 'rounded-poster',
      )}
    >
      <div className="relative transition-lift group-hover/link:scale-(--scale-poster) group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus rounded-poster">
        <CollectionArt poster={mosaic?.length ? null : poster} mosaic={mosaic ?? []} />
        {smart && (
          <div className="absolute bottom-[7%] left-[7%] flex">
            <Badge overlay dot={false}>
              <Icon name="filter" size={12} className={tv ? 'size-[0.8cqw]' : undefined} />
              Smart
            </Badge>
          </div>
        )}
      </div>
      {tv ? (
        <>
          <span className="mt-[1cqw] block truncate font-semibold text-(length:--tv-text-meta) text-text-2 leading-[1.3] transition-lift group-focus-visible/link:text-text">
            {name}
          </span>
          <span className="block truncate text-(length:--tv-text-pill) text-text-3 leading-[1.3]">
            {caption}
          </span>
        </>
      ) : (
        <span className="mt-2 grid gap-0.5">
          <span className="line-clamp-2 text-text text-ui">{name}</span>
          <span className="text-caption text-text-3">{caption}</span>
        </span>
      )}
    </a>
  )
}
