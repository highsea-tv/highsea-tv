'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Posters, stills and covers. Hover (pointer) and keyboard focus lift the art with spring.base
// to `--scale-poster` (1.02 on web, 1.05 on TV). docs/design-language/platforms/desktop-web.md
import { type ReactNode, useState } from 'react'
import { cn } from '../lib/cn.ts'
import { QualityTag } from './badge.tsx'

export type PosterAspect = 'poster' | 'still' | 'square' | 'book'

const aspects: Record<PosterAspect, string> = {
  poster: 'aspect-poster',
  still: 'aspect-still',
  square: 'aspect-square',
  book: 'aspect-book',
}

export type PosterProps = {
  title: string
  src?: string
  srcSet?: string
  sizes?: string
  aspect?: PosterAspect
  /** Renders a link. */
  href?: string
  /** Renders a button. */
  onClick?: () => void
  /** Quality markers on the art (4K, HDR). */
  quality?: string[]
  /** A status on the art, bottom left (an overlay `Badge`), so captions keep one height. */
  status?: ReactNode
  /** 0–100: a continue-watching bar, 7% in from the edges. */
  progress?: number
  /** Shows the title (two lines, then an ellipsis) and `caption` under the art. */
  showTitle?: boolean
  caption?: ReactNode
  /** Quick actions over the art, shown on hover and focus (Play, Add to list, More). */
  actions?: ReactNode
  /** Marks the poster for the spatial focus engine (TV). */
  focusable?: boolean
  className?: string
}

export function Poster({
  title,
  src,
  srcSet,
  sizes,
  aspect = 'poster',
  href,
  onClick,
  quality,
  status,
  progress,
  showTitle = false,
  caption,
  actions,
  focusable,
  className,
}: PosterProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed

  const art = (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-poster bg-s2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.04)] transition-lift',
        'group-hover/poster:scale-(--scale-poster) group-focus-visible/link:scale-(--scale-poster) group-focus-visible/link:ring-focus',
        aspects[aspect],
      )}
    >
      {showImage ? (
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          // the link is named by the visible title when there is one
          alt={showTitle ? '' : title}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 size-full transition-tint',
            aspect === 'book' ? 'object-contain' : 'object-cover',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <div className="absolute inset-0 flex items-end bg-[linear-gradient(160deg,var(--color-s3),var(--color-s1))] p-[9%]">
          <span className="line-clamp-3 font-semibold text-text-2 text-ui leading-[1.15]">
            {showTitle ? null : title}
          </span>
        </div>
      )}
      {quality && quality.length > 0 && (
        <div className="absolute top-[7%] left-[7%] flex gap-1">
          {quality.map((q) => (
            <QualityTag key={q} overlay>
              {q}
            </QualityTag>
          ))}
        </div>
      )}
      {status && (
        <div
          className={cn(
            'absolute right-[7%] left-[7%] flex',
            progress === undefined ? 'bottom-[7%]' : 'bottom-[calc(7%+0.75rem)]',
          )}
        >
          {status}
        </div>
      )}
      {progress !== undefined && (
        <div
          role="progressbar"
          aria-label="Watched"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="absolute inset-x-[7%] bottom-[7%] h-1 overflow-hidden rounded-full bg-text/25"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )

  const label = showTitle && (
    <div className="mt-2 grid gap-0.5 text-start">
      <span className="line-clamp-2 text-text text-ui">{title}</span>
      {caption && <span className="text-caption text-text-3">{caption}</span>}
    </div>
  )

  const linkClass =
    'group/link relative block w-full cursor-pointer rounded-poster text-start outline-none focus-visible:z-10'
  const focusProps = focusable ? { 'data-focusable': '' } : {}
  const target = href ? (
    <a href={href} className={linkClass} {...focusProps}>
      {art}
      {label}
    </a>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={linkClass} {...focusProps}>
      {art}
      {label}
    </button>
  ) : (
    <div className="relative block w-full">
      {art}
      {label}
    </div>
  )

  return (
    <div className={cn('group/poster relative min-w-0 hover:z-10', className)}>
      {target}
      {actions && (
        // each action fades itself: an ancestor with opacity below 1 is a backdrop root, so a glass
        // action would blur nothing until the fade ended (Filter Effects 2 § 3.1, Backdrop Root).
        // The row lets clicks through to the poster; only the actions take them.
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1 p-2 *:opacity-0 *:transition-tint group-focus-within/poster:*:pointer-events-auto group-focus-within/poster:*:opacity-100 group-hover/poster:*:pointer-events-auto group-hover/poster:*:opacity-100">
          {actions}
        </div>
      )}
    </div>
  )
}
