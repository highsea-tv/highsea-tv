// SPDX-License-Identifier: AGPL-3.0-only
// Download on the item page (C8; client-detail.md#download, checkpoint 4.0b), on mobile and in the
// desktop app: Download, then where it's got to, then Downloaded with Remove. The browser has no
// Download: a page can't keep a film for offline (client-settings.md#offline).
import { bytes } from '@highsea-tv/core/format'
import { Button, cn, Icon, Progress, Tooltip, toast } from '@highsea-tv/ui-web'
import type { ClientItem } from '../mock/types.ts'
import { useServerName } from './data.ts'
import {
  filmSource,
  groupState,
  type OfflineApp,
  type OfflineSource,
  useDownloads,
} from './downloads.ts'

/** "3 episodes", "1 song". */
const unitOf = (x: OfflineSource[], n: number) =>
  `${x[0]?.kind === 'song' ? 'song' : 'episode'}${n === 1 ? '' : 's'}`

const whereOf = (app: OfflineApp) => (app === 'mobile' ? 'this phone' : 'this computer')

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
  const d = useDownloads(app)
  const x = d.get(item.id)
  const where = whereOf(app)
  const server = useServerName()

  if (!x)
    return (
      <Button
        icon="download"
        className={cn(wide && 'h-auto min-h-11 w-full whitespace-normal py-2', className)}
        onClick={() => {
          d.start(filmSource(item))
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
          <p className="text-caption text-text-3">
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
        <span className="text-body text-text-2">
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
        <span className="text-body text-danger">The download stopped</span>
        <Button size="sm" icon="download" onClick={() => d.retry(x.id)}>
          Try again
        </Button>
      </div>
    )

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-body text-text-2">
        {x.state === 'expired'
          ? `Downloaded · connect to ${server} to keep watching it`
          : `Downloaded · plays offline for ${x.daysLeft} more days`}
      </span>
      <Button
        size="sm"
        variant="ghost"
        icon="delete"
        onClick={() => {
          d.remove(x.id)
          toast({ title: `${item.title} removed`, description: `It still plays from ${server}.` })
        }}
      >
        Remove
      </Button>
    </div>
  )
}

/**
 * Download for one episode's row: an icon, then a ring filling as it downloads, then a check once
 * it's kept. Pressed while it downloads, it cancels; once kept, it removes.
 */
export function EpisodeDownload({
  source,
  app,
  round = false,
  className,
}: {
  source: OfflineSource
  app: OfflineApp
  /** Drawn as the hero's round buttons are, rather than as a row's quiet icon. */
  round?: boolean
  className?: string
}) {
  const d = useDownloads(app)
  const server = useServerName()
  const x = d.get(source.id)
  const name = `${source.caption ? `${source.caption}, ` : ''}${source.title}`
  const label = !x
    ? `Download ${name}`
    : x.state === 'done' || x.state === 'expired'
      ? `Remove the download of ${name}`
      : x.state === 'failed'
        ? `Try downloading ${name} again`
        : `Cancel the download of ${name}`
  const onClick = () => {
    if (!x) {
      d.start(source)
      toast({ title: `Downloading ${name}`, description: `To ${whereOf(app)}.` })
    } else if (x.state === 'failed') d.retry(x.id)
    else {
      d.remove(x.id)
      toast({
        title: x.state === 'done' ? `${name} removed` : 'Download cancelled',
        description: `It still plays from ${server}.`,
      })
    }
  }
  const moving = x && x.state !== 'done' && x.state !== 'expired' && x.state !== 'failed'
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          'relative grid size-(--size-control-sm) shrink-0 cursor-pointer place-items-center rounded-full text-text-2 outline-none transition-press hover:bg-s2 hover:text-text focus-visible:ring-focus active:scale-97',
          round && 'size-(--size-control) border border-line-strong bg-s2 text-text hover:bg-s3',
          x?.state === 'done' && 'text-accent-text',
          x?.state === 'failed' && 'text-danger',
          className,
        )}
      >
        {moving ? (
          <Ring value={x.progress} paused={x.state !== 'downloading'} />
        ) : (
          <Icon name={!x ? 'download' : x.state === 'failed' ? 'refresh' : 'check'} size={18} />
        )}
      </button>
    </Tooltip>
  )
}

/** A download's progress as a ring, with a stop square inside, as the Apple TV app draws it. */
function Ring({ value, paused }: { value: number; paused: boolean }) {
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2" className="stroke-text/20" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0.04, value))}
        className={paused ? 'stroke-text-3' : 'stroke-accent'}
      />
      <rect x="9" y="9" width="6" height="6" rx="1" className="fill-current" />
    </svg>
  )
}

/**
 * Download for a season or an album: every episode or song in it. Then how far it's got, then
 * Downloaded with Remove. Part of it kept offers the rest.
 */
export function GroupDownload({
  sources,
  name,
  app,
  label = 'Download',
  className,
  wide = false,
  ghost = false,
}: {
  sources: OfflineSource[]
  /** "Season 2 of The Long Way North", or the album's title. */
  name: string
  app: OfflineApp
  label?: string
  className?: string
  wide?: boolean
  /** Quiet, beside a season's Mark season as watched. */
  ghost?: boolean
}) {
  const d = useDownloads(app)
  const server = useServerName()
  const g = groupState(sources.map((x) => d.get(x.id)))
  const ids = sources.map((x) => x.id)
  const remove = () => {
    d.remove(ids)
    toast({ title: `${name} removed`, description: `It still plays from ${server}.` })
  }
  if (sources.length === 0) return null
  if (g.going)
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <Progress
          value={g.progress * 100}
          showValue
          aria-label={`Downloading ${name}`}
          className="w-40"
        />
        <span className="text-caption text-text-3">
          {g.done} of {sources.length}
        </span>
        <Button size="sm" variant="ghost" onClick={remove}>
          Cancel
        </Button>
      </div>
    )
  if (g.all)
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <span className="flex items-center gap-1.5 text-caption text-text-2">
          <Icon name="check" size={16} className="text-accent-text" />
          Downloaded · {bytes(g.kept.reduce((s, x) => s + x.bytes, 0))}
        </span>
        <Button size="sm" variant="ghost" icon="delete" onClick={remove}>
          Remove
        </Button>
      </div>
    )
  const rest = sources.filter((x) => !d.get(x.id))
  return (
    <Button
      size="sm"
      variant={ghost ? 'ghost' : undefined}
      icon="download"
      className={cn(wide && 'h-auto min-h-11 w-full whitespace-normal py-2', className)}
      onClick={() => {
        d.start(rest)
        toast({
          title: `Downloading ${name}`,
          description: `${rest.length} ${unitOf(rest, rest.length)} to ${whereOf(app)}.`,
        })
      }}
    >
      {g.none ? label : `${label} the rest`}
    </Button>
  )
}
