// SPDX-License-Identifier: AGPL-3.0-only
// Page furniture shared by every admin page and the web client: the top row (admin.md#main-area)
// and the empty and error states that stand in for content (accessibility.md#understandable).
import type { ReactNode } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { Kbd } from './kbd.tsx'
import { ModKey } from './mod-key.tsx'

export type SearchTriggerProps = {
  onClick: () => void
  /** What the palette searches. Default "Search library, TMDB, actions". */
  label?: string
  className?: string
}

/**
 * Looks like a search field and opens the command palette, with the ⌘K hint. Below medium it
 * folds to an icon button with the same name.
 */
export function SearchTrigger({
  onClick,
  label = 'Search library, TMDB, actions',
  className,
}: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        'flex h-(--size-control) shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-line bg-s1 text-start text-text-3 text-ui transition-tint hover:border-line-strong hover:text-text-2',
        'w-(--size-control) justify-center medium:w-[min(20rem,32vw)] medium:justify-start medium:px-3',
        className,
      )}
    >
      <Icon name="search" size={16} className="shrink-0" />
      <span className="hidden min-w-0 flex-1 truncate medium:block">{label}</span>
      {/* the shortcut is announced through aria-keyshortcuts; the hint is visual only. ModKey
          renders the same on the server and while hydrating, then the browser's own (mod-key.tsx) */}
      <span aria-hidden className="hidden medium:inline-flex">
        <Kbd>
          <ModKey />K
        </Kbd>
      </span>
    </button>
  )
}

export type PageHeaderProps = {
  title: ReactNode
  /** A short line under the title. */
  description?: ReactNode
  /** Usually a `SearchTrigger`. */
  search?: ReactNode
  /** Secondary actions (Customize), then the primary one last. */
  actions?: ReactNode
  /** Before the title: the compact menu button. */
  start?: ReactNode
  className?: string
}

/** The page's top row: Heading title, search with the ⌘K hint, actions. Wraps rather than squeezes. */
export function PageHeader({
  title,
  description,
  search,
  actions,
  start,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {start}
      {/* a 10rem basis: actions wrap to a second row before the title truncates */}
      <div className="min-w-0 flex-1 basis-40">
        <h1 className="truncate text-heading">{title}</h1>
        {description && <p className="mt-1 text-caption text-text-3">{description}</p>}
      </div>
      {search}
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export type EmptyStateProps = {
  title: ReactNode
  /** What it means and what to do next, in a sentence or two. */
  children?: ReactNode
  icon?: IconName
  /** One action, usually a primary Button. */
  action?: ReactNode
  /** `error` for a failed load: the danger icon, and announced as an alert. */
  tone?: 'neutral' | 'error'
  /** `sm` inside widgets and table bodies; `md` for a page. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Stands in for content that isn't there: nothing yet, nothing matches, or it failed to load.
 * Always says what happened and offers the next step.
 */
export function EmptyState({
  title,
  children,
  icon,
  action,
  tone = 'neutral',
  size = 'md',
  className,
}: EmptyStateProps) {
  const error = tone === 'error'
  return (
    <div
      role={error ? 'alert' : undefined}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)] justify-items-center text-center',
        size === 'md' ? 'gap-3 px-6 py-12' : 'gap-2 px-3 py-5',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-full',
          size === 'md' ? 'size-11' : 'size-8',
          error ? 'bg-badge-danger-bg text-danger' : 'bg-s2 text-text-3',
        )}
      >
        <Icon name={icon ?? (error ? 'error' : 'inbox')} size={size === 'md' ? 20 : 16} />
      </span>
      <div className="grid max-w-[min(44ch,100%)] gap-1 [overflow-wrap:anywhere]">
        <p className={cn('text-text', size === 'md' ? 'text-title' : 'font-semibold text-ui')}>
          {title}
        </p>
        {children && (
          <div className={cn('text-text-2', size === 'md' ? 'text-body' : 'text-caption')}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
