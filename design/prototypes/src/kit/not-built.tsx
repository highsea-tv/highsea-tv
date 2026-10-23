// SPDX-License-Identifier: AGPL-3.0-only
// A placeholder for screens a later checkpoint builds. Prototype meta, styled like the toolbar.
import { cn } from '@highsea-tv/ui-web'

export function NotBuilt({
  what,
  checkpoint,
  className,
}: {
  what: string
  checkpoint: number
  className?: string
}) {
  return (
    <main className={cn('grid h-full min-h-screen place-items-center bg-bg p-6', className)}>
      <div className="grid max-w-[44ch] gap-2 text-center">
        <p className="font-mono text-[11px] text-text-3 uppercase tracking-label">
          Not in the prototype yet
        </p>
        <h1 className="text-title">{what}</h1>
        <p className="text-caption text-text-2">Checkpoint {checkpoint} builds this screen.</p>
      </div>
    </main>
  )
}
