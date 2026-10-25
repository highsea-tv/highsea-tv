// SPDX-License-Identifier: AGPL-3.0-only
// The downloads list (C8; client-settings.md#offline, checkpoint 4.0b), on the phone's Offline
// page and the desktop app's Downloads: the space they take, then each download with where it's
// got to and what can be done about it, then the quality new downloads use.
import { bytes } from '@highsea-tv/core/format'
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Field,
  Poster,
  Progress,
  Select,
  toast,
} from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'
import { useLibrary } from './data.ts'
import { type Offline, type OfflineApp, qualities, useDownloads } from './downloads.ts'

const disk: Record<OfflineApp, { total: number; where: string }> = {
  mobile: { total: 64e9, where: 'this phone' },
  desktop: { total: 512e9, where: 'this computer' },
}

const kept = (x: Offline) => x.bytes * x.progress
const short = (x: Offline) => qualities.find((q) => q.id === x.quality)?.short ?? '1080p'

export function OfflineList({
  app,
  href,
  settings,
}: {
  app: OfflineApp
  /** Where a downloaded film plays. */
  href: (id: string) => string
  /** The app's own settings under Quality: Wi-Fi only on a phone, the folder on a computer. */
  settings?: ReactNode
}) {
  const library = useLibrary()
  const d = useDownloads(app, library.data)
  const { total, where } = disk[app]
  const used = d.items.reduce((s, x) => s + kept(x), 0)
  const ready = d.items.filter((x) => x.state === 'done').length
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid gap-1.5">
        <Progress value={(used / total) * 100} aria-label="Space used by downloads" />
        <p className="text-[13px] text-text-3">
          {ready} {ready === 1 ? 'movie' : 'movies'} ready to watch · {bytes(used)} ·{' '}
          {bytes(total - used)} free on {where}
        </p>
      </div>
      {d.items.length === 0 ? (
        <EmptyState icon="download" title="Nothing downloaded">
          {app === 'mobile' ? 'Tap' : 'Choose'} Download on a movie to keep it on {where}. It plays
          without the server.
        </EmptyState>
      ) : (
        <ul aria-label="Downloads" className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {d.items.map((x) => (
            <Row key={x.id} x={x} d={d} href={href} />
          ))}
        </ul>
      )}
      <section
        aria-label="Download settings"
        className="grid max-w-[32rem] grid-cols-[minmax(0,1fr)] gap-4"
      >
        <Field label="Quality" hint="For new downloads. Higher looks better and takes more room.">
          <Select
            value={d.quality}
            onValueChange={(v) => d.setQuality(v as typeof d.quality)}
            options={qualities.map((q) => ({ value: q.id, label: q.label }))}
          />
        </Field>
        {settings}
      </section>
    </div>
  )
}

function Row({
  x,
  d,
  href,
}: {
  x: Offline
  d: ReturnType<typeof useDownloads>
  href: (id: string) => string
}) {
  const remove = (
    <Button
      size="sm"
      variant="ghost"
      icon="delete"
      onClick={() => {
        d.remove(x.id)
        toast({
          title:
            x.state === 'done' || x.state === 'expired'
              ? `${x.title} removed`
              : 'Download cancelled',
          description: 'It still plays from Harbor.',
        })
      }}
    >
      {x.state === 'done' || x.state === 'expired' ? 'Remove' : 'Cancel'}
    </Button>
  )
  const size = `${bytes(x.bytes)} · ${short(x)}`
  const status: Record<
    Offline['state'],
    { line: ReactNode; actions: ReactNode; badge?: ReactNode }
  > = {
    downloading: {
      line: `${bytes(x.speed)}/s · ${bytes(x.bytes - kept(x))} to go`,
      actions: (
        <>
          <Button size="sm" variant="ghost" icon="pause" onClick={() => d.pause(x.id)}>
            Pause
          </Button>
          {remove}
        </>
      ),
    },
    paused: {
      line: `Paused · ${bytes(kept(x))} of ${bytes(x.bytes)}`,
      actions: (
        <>
          <Button size="sm" variant="ghost" icon="download" onClick={() => d.resume(x.id)}>
            Resume
          </Button>
          {remove}
        </>
      ),
    },
    queued: { line: `Waiting to download · ${size}`, actions: remove },
    'waiting-wifi': {
      line: `Waiting for Wi-Fi · ${size}`,
      actions: (
        <>
          <Button size="sm" variant="ghost" icon="download" onClick={() => d.resume(x.id)}>
            Use mobile data
          </Button>
          {remove}
        </>
      ),
    },
    failed: {
      badge: <Badge tone="danger">Stopped</Badge>,
      line: 'The download stopped when Harbor couldn’t be reached.',
      actions: (
        <>
          <Button size="sm" icon="refresh" onClick={() => d.retry(x.id)}>
            Try again
          </Button>
          {remove}
        </>
      ),
    },
    done: { line: `${size} · plays offline for ${x.daysLeft} more days`, actions: remove },
    expired: {
      badge: <Badge tone="warning">Expired</Badge>,
      line: 'Connect to Harbor to keep watching it.',
      actions: remove,
    },
  }
  const s = status[x.state]
  const moving = x.state === 'downloading' || x.state === 'paused'
  return (
    <li className="grid grid-cols-[min(7rem,35%)_minmax(0,1fr)] items-center gap-3 medium:grid-cols-[10rem_minmax(0,1fr)]">
      <Poster
        title={x.title}
        src={x.still}
        aspect="still"
        href={x.state === 'done' ? href(x.id) : undefined}
      />
      <div className="grid gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-[15px]">{x.title}</span>
          {s.badge}
        </p>
        {moving && (
          <Progress
            value={x.progress * 100}
            showValue
            tone={x.state === 'paused' ? 'neutral' : 'accent'}
            aria-label={`Downloading ${x.title}`}
            className="max-w-[24rem]"
          />
        )}
        <p className={cn('text-[13px]', x.state === 'failed' ? 'text-danger' : 'text-text-3')}>
          {s.line}
        </p>
        <div className="-ms-2 flex flex-wrap items-center gap-1 [&>*]:h-auto [&>*]:min-h-(--size-control-sm) [&>*]:max-w-full [&>*]:whitespace-normal [&>*]:py-1 [&>*]:text-start">
          {s.actions}
        </div>
      </div>
    </li>
  )
}
