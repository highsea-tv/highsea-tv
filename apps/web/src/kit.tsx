// SPDX-License-Identifier: AGPL-3.0-only
// Small pieces the prototype keeps in its kit (design/prototypes/src/kit), as the admin ports them
// (apps/server/src/admin/inline.tsx, collection-art.tsx): announcement bodies' inline markdown and
// their call to action, and a collection's poster or mosaic with its tile.
import { Badge, Button, cn, Icon } from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'

const TOKENS = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/

function Part({ part }: { part: string }): ReactNode {
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
    return <strong className="font-semibold text-text">{part.slice(2, -2)}</strong>
  if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    return <em>{part.slice(1, -1)}</em>
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
  if (link)
    return (
      <a
        href={link[2]}
        target="_blank"
        rel="noreferrer"
        className="text-text underline underline-offset-2 hover:text-accent-text"
      >
        {link[1]}
      </a>
    )
  return part
}

/** **bold**, _italic_ and [links](https://…); links open in a new tab, away from the app. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKENS).map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the split is stable for a given text
        <Part key={i} part={part} />
      ))}
    </>
  )
}

/** An announcement's call to action, as a secondary button that opens the link. */
export function Cta({
  cta,
  className,
}: {
  cta: { label: string; url: string } | null
  className?: string
}) {
  if (!cta) return null
  return (
    <Button size="sm" icon="external" asChild className={className}>
      <a href={cta.url} target="_blank" rel="noreferrer">
        {cta.label}
      </a>
    </Button>
  )
}

/** The chosen poster, or a mosaic of the first four (collections.md#artwork). */
export function CollectionArt({
  poster,
  mosaic,
  className,
}: {
  poster?: string | null
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

/** A collection in Library › Collections: its art, the smart mark, its name and what it holds. */
export function CollectionTile({
  href,
  label,
  name,
  caption,
  poster,
  mosaic,
  smart,
}: {
  href: string
  label: string
  name: string
  caption: string
  poster: string | null
  mosaic?: string[]
  smart: string | null
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className="group/link relative block w-full cursor-pointer rounded-poster text-start outline-none focus-visible:z-10"
    >
      <div className="relative rounded-poster transition-lift group-hover/link:scale-(--scale-poster) group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus">
        <CollectionArt poster={mosaic?.length ? null : poster} mosaic={mosaic ?? []} />
        {smart && (
          <div className="absolute bottom-[7%] left-[7%] flex">
            <Badge overlay dot={false}>
              <Icon name="filter" size={12} />
              {smart}
            </Badge>
          </div>
        )}
      </div>
      <span className="mt-2 grid gap-0.5">
        <span className="line-clamp-2 text-text text-ui">{name}</span>
        <span className="text-caption text-text-3">{caption}</span>
      </span>
    </a>
  )
}
