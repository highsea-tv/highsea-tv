// SPDX-License-Identifier: AGPL-3.0-only
// The command palette: ⌘K / Ctrl K anywhere (accessibility.md#operable). A searchable list of
// commands in a level-4 dialog over the scrim.
import { Command } from 'cmdk'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ReactNode, useEffect } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import { Kbd } from './kbd.tsx'

export type CommandItem = {
  id: string
  label: string
  icon?: IconName
  /** Extra words that should match ("torrents" for Downloads). */
  keywords?: string[]
  shortcut?: string
  /** Secondary text, right-aligned. */
  hint?: ReactNode
  onSelect: () => void
}

export type CommandGroup = { heading: string; items: CommandItem[] }

export type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: CommandGroup[]
  placeholder?: string
  empty?: ReactNode
}

/** Opens the palette on ⌘K / Ctrl K. */
export function useCommandPaletteShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = 'Search or jump to…',
  empty = 'Nothing matches that.',
}: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 glass-scrim data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(35rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg bg-s3 text-text shadow-4 outline-none data-[state=closed]:animate-fade-out data-[state=open]:animate-dialog-in"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-2.5 border-line border-b px-4">
              <Icon name="search" size={16} className="shrink-0 text-text-3" />
              <Command.Input
                placeholder={placeholder}
                className="h-12 min-w-0 flex-1 bg-transparent text-form text-text outline-none placeholder:text-text-3"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[min(22.5rem,60vh)] scroll-py-1.5 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-text-2 text-ui">
                {empty}
              </Command.Empty>
              {groups.map((group) => (
                <Command.Group
                  key={group.heading}
                  heading={group.heading}
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:text-text-3 [&_[cmdk-group-heading]]:uppercase"
                >
                  {group.items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.id}`}
                      keywords={item.keywords}
                      onSelect={() => {
                        onOpenChange(false)
                        item.onSelect()
                      }}
                      className={cn(
                        'flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-sm px-2.5 text-[13.5px] text-text-2 data-[selected=true]:bg-s4 data-[selected=true]:text-text',
                      )}
                    >
                      {item.icon && <Icon name={item.icon} size={16} className="shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="text-caption">{item.hint}</span>}
                      {item.shortcut && <Kbd>{item.shortcut}</Kbd>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
