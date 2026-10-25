// SPDX-License-Identifier: AGPL-3.0-only
// Download on the item page (C8; client-detail.md#download, checkpoint 4.0b), on mobile and in the
// desktop app: Download, then where it's got to, then Downloaded with Remove. The browser has no
// Download: a page can't keep a film for offline (client-settings.md#offline).
import { bytes } from '@highsea-tv/core/format'
import { Button, cn, Progress, toast } from '@highsea-tv/ui-web'
import type { ClientItem } from '../mock/types.ts'
import { useLibrary } from './data.ts'
import { type OfflineApp, useDownloads } from './downloads.ts'

export function DownloadButton({
  item,
  app,
  className,
  wide = false,
}: {
  item: ClientItem
  app: OfflineApp
  className?: string
  /** The phone's full-width button, under Play. */
  wide?: boolean
}) {
  const library = useLibrary()
  const d = useDownloads(app, library.data)
  const x = d.get(item.id)
  const where = app === 'mobile' ? 'this phone' : 'this computer'

  if (!x)
    return (
      <Button
        icon="download"
        className={cn(wide && 'h-auto min-h-11 w-full whitespace-normal py-2', className)}
        onClick={() => {
          d.start(item)
          toast({ title: `Downloading ${item.title}`, description: `To ${where}.` })
        }}
      >
        Download
      </Button>
    )

  if (x.state === 'downloading' || x.state === 'paused')
    return (
      <div className={cn('grid w-full max-w-[24rem] gap-1', className)}>
        <Progress
          value={x.progress * 100}
          showValue
          tone={x.state === 'paused' ? 'neutral' : 'accent'}
          aria-label={`Downloading ${item.title}`}
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-text-3">
            {x.state === 'paused'
              ? `Paused · ${bytes(x.bytes * x.progress)} of ${bytes(x.bytes)}`
              : `Downloading · ${bytes(x.speed)}/s · ${bytes(x.bytes * (1 - x.progress))} to go`}
          </p>
          <Button
            size="sm"
            variant="ghost"
            icon={x.state === 'paused' ? 'download' : 'pause'}
            onClick={() => (x.state === 'paused' ? d.resume(x.id) : d.pause(x.id))}
          >
            {x.state === 'paused' ? 'Resume' : 'Pause'}
          </Button>
        </div>
      </div>
    )

  if (x.state === 'queued' || x.state === 'waiting-wifi')
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span className="text-[14px] text-text-2">
          {x.state === 'queued' ? 'Waiting to download' : 'Waiting for Wi-Fi'}
        </span>
        <Button size="sm" variant="ghost" onClick={() => d.remove(x.id)}>
          Cancel
        </Button>
      </div>
    )

  if (x.state === 'failed')
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <span className="text-[14px] text-danger">The download stopped</span>
        <Button size="sm" icon="download" onClick={() => d.retry(x.id)}>
          Try again
        </Button>
      </div>
    )

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-[14px] text-text-2">
        {x.state === 'expired'
          ? 'Downloaded · connect to Harbor to keep watching it'
          : `Downloaded · plays offline for ${x.daysLeft} more days`}
      </span>
      <Button
        size="sm"
        variant="ghost"
        icon="delete"
        onClick={() => {
          d.remove(x.id)
          toast({ title: `${item.title} removed`, description: 'It still plays from Harbor.' })
        }}
      >
        Remove
      </Button>
    </div>
  )
}
