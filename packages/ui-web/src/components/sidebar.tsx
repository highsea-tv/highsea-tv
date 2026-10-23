'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The admin sidebar: docs/design-language/platforms/admin.md#sidebar. Full at expanded and wide,
// a 64px icon rail with tooltips at medium, and a menu sheet behind a top-bar button at compact.
import { Slot } from 'radix-ui'
import { type ComponentProps, createContext, type ReactNode, useContext } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { useBreakpoint } from '../lib/hooks.ts'
import { Tooltip } from './tooltip.tsx'

export type SidebarMode = 'full' | 'rail'
const ModeContext = createContext<SidebarMode>('full')

/** `full` at expanded and up, `rail` at medium, `null` at compact (use a sheet). */
export function useSidebarMode(): SidebarMode | null {
  const bp = useBreakpoint()
  return bp === 'compact' ? null : bp === 'medium' ? 'rail' : 'full'
}

export type SidebarProps = ComponentProps<'nav'> & {
  /** Forces a mode. By default it follows the breakpoint; in a sheet, pass `full`. */
  mode?: SidebarMode
  /** The lockup, or the server's name and mark when branding is set. */
  header?: ReactNode
  /** Pinned to the bottom: the server card. */
  footer?: ReactNode
}

export function Sidebar({
  mode: forced,
  header,
  footer,
  className,
  children,
  'aria-label': label = 'Main',
  ...props
}: SidebarProps) {
  const auto = useSidebarMode()
  const mode = forced ?? auto ?? 'full'
  return (
    <ModeContext.Provider value={mode}>
      <nav
        aria-label={label}
        data-mode={mode}
        className={cn(
          'flex h-full shrink-0 flex-col gap-0.5 overflow-y-auto border-line border-e bg-s1 py-4 text-ui',
          mode === 'full'
            ? 'w-(--size-sidebar) px-2.5'
            : 'w-(--size-sidebar-rail) items-center px-2',
          !forced && 'max-medium:hidden',
          className,
        )}
        {...props}
      >
        {header && (
          <div className={cn('pb-4.5', mode === 'full' ? 'px-2 pt-0.5' : 'flex justify-center')}>
            {header}
          </div>
        )}
        {children}
        {footer && <div className="mt-auto w-full pt-4">{footer}</div>}
      </nav>
    </ModeContext.Provider>
  )
}

export function useSidebarContext(): SidebarMode {
  return useContext(ModeContext)
}

/** A group of nav items; groups are separated by hairlines. */
export function NavGroup({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'grid w-full gap-0.5 [&+&]:mt-2.5 [&+&]:border-line [&+&]:border-t [&+&]:pt-2.5',
        className,
      )}
      {...props}
    />
  )
}

export type NavItemProps = {
  icon: IconName
  label: string
  /** A count on the right, in mono `text-3` (Movies 412, Activity 5). */
  count?: ReactNode
  active?: boolean
  href?: string
  onClick?: () => void
  /** Renders your router's link as the item. */
  asChild?: boolean
  children?: ReactNode
}

/**
 * A nav item: a 16px icon and a 13px label. Active: a 6% white wash, `text` label and the icon
 * in `accent`, plus `aria-current="page"`.
 */
export function NavItem({
  icon,
  label,
  count,
  active,
  href,
  onClick,
  asChild,
  children,
}: NavItemProps) {
  const mode = useContext(ModeContext)
  const rail = mode === 'rail'
  const Comp = asChild ? Slot.Root : href ? 'a' : 'button'
  const content = (
    <Comp
      href={asChild ? undefined : href}
      onClick={onClick}
      type={!asChild && !href ? 'button' : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? label : undefined}
      className={cn(
        'group/nav flex w-full cursor-pointer items-center gap-2.5 rounded-sm text-text-2 transition-tint hover:bg-s2 hover:text-text',
        rail ? 'size-11 justify-center' : 'min-h-8 px-2.5 py-[7px]',
        active && 'bg-text/6 text-text hover:bg-text/6',
      )}
    >
      {asChild ? (
        children
      ) : (
        <>
          <Icon
            name={icon}
            size={16}
            className={cn('shrink-0', active ? 'text-accent' : 'opacity-85')}
          />
          {!rail && <span className="min-w-0 flex-1 truncate text-start">{label}</span>}
          {!rail && count != null && (
            <span className="font-mono text-[11px] text-text-3">{count}</span>
          )}
        </>
      )}
    </Comp>
  )
  return (
    <li className="w-full">
      {rail ? (
        <Tooltip content={label} side="right">
          {content}
        </Tooltip>
      ) : (
        content
      )}
    </li>
  )
}

export type ServerCardProps = {
  name: string
  /** "v1.0 · 4 clients" */
  detail?: ReactNode
  status?: 'online' | 'degraded' | 'offline'
  /** Opens server details (the System page). */
  onClick?: () => void
  className?: string
}

const dots = {
  online: 'bg-success shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-success)_25%,transparent)]',
  degraded:
    'bg-warning shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-warning)_25%,transparent)]',
  offline: 'bg-danger shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-danger)_25%,transparent)]',
}
const statusText = { online: 'Online', degraded: 'Degraded', offline: 'Offline' }

/** The server card pinned to the sidebar's bottom: status, name, version and clients. */
export function ServerCard({
  name,
  detail,
  status = 'online',
  onClick,
  className,
}: ServerCardProps) {
  const mode = useContext(ModeContext)
  const dot = <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dots[status])} />
  if (mode === 'rail')
    return (
      <Tooltip content={`${name} · ${statusText[status]}`} side="right">
        <button
          type="button"
          onClick={onClick}
          aria-label={`${name}: ${statusText[status]}`}
          className={cn(
            'mx-auto grid size-11 cursor-pointer place-items-center rounded-md border border-line bg-s2 transition-tint hover:bg-s3',
            className,
          )}
        >
          {dot}
        </button>
      </Tooltip>
    )
  const body = (
    <>
      {dot}
      <div className="min-w-0">
        <div className="truncate font-medium text-text">
          {name}
          <span className="sr-only">: {statusText[status]}</span>
        </div>
        {detail && <div className="truncate text-[11px] text-text-3">{detail}</div>}
      </div>
    </>
  )
  const card =
    'flex w-full items-center gap-2.5 rounded-md border border-line bg-s2 p-2.5 text-start'
  // a button only when it does something, in both modes
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(card, 'cursor-pointer transition-tint hover:bg-s3', className)}
    >
      {body}
    </button>
  ) : (
    <div className={cn(card, className)}>{body}</div>
  )
}
