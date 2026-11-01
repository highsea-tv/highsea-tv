// SPDX-License-Identifier: AGPL-3.0-only
// The downloads list (C8; client-settings.md#offline, checkpoint 4.0b), on the phone's Offline
// page and the desktop app's Downloads: the space they take, then each download with where it's
// got to and what can be done about it, then the quality new downloads use. Films are a row each;
// episodes sit under their show and season, and songs under their album, each group with its size
// and Remove.

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
import { useServerName } from './data.ts'
import {
  entriesOf,
  type Offline,
  type OfflineApp,
  type OfflineGroup,
  type OfflineKind,
  qualities,
  useDownloads,
} from './downloads.ts'

const disk: Record<OfflineApp, { total: number; where: string }> = {
  mobile: { total: 64e9, where: 'this phone' },
  desktop: { total: 512e9, where: 'this computer' },
}

const kept = (x: Offline) => x.bytes * x.progress
const kinds: Record<OfflineKind, [string, string]> = {
  film: ['film', 'films'],
  episode: ['episode', 'episodes'],
  song: ['song', 'songs'],
}

/** "2 films, 3 episodes and 12 songs", leaving out what's none. */
export function readyLine(items: Offline[]) {
  const parts = (['film', 'episode', 'song'] as const).flatMap((k) => {
    const n = items.filter((x) => x.kind === k && x.state === 'done').length
    return n === 0 ? [] : [`${n} ${kinds[k][n === 1 ? 0 : 1]}`]
  })
  if (parts.length === 0) return 'Nothing ready yet'
  const last = parts.pop()
  return `${parts.length > 0 ? `${parts.join(', ')} and ` : ''}${last} ready`
}

const audio: Record<Offline['quality'], string> = {
  original: 'Lossless',
  high: '320 kbit/s',
  saver: '160 kbit/s',
}

const short = (x: Offline) =>
  x.kind === 'song'
    ? audio[x.quality]
    : (qualities.find((q) => q.id === x.quality)?.short ?? '1080p')

export function OfflineList({
  app,
  href,
  settings,
}: {
  app: OfflineApp
  /** Where a downloaded film or episode plays (songs play in the music player). */
  href: (x: Offline) => string | undefined
  /** The app's own settings under Quality: Wi-Fi only on a phone, the folder on a computer. */
  settings?: ReactNode
}) {
  const d = useDownloads(app)
  const { total, where } = disk[app]
  const used = d.items.reduce((s, x) => s + kept(x), 0)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
      <div className="grid gap-1.5">
        <Progress value={(used / total) * 100} aria-label="Space used by downloads" />
        <p className="text-caption text-text-3">
          {readyLine(d.items)} · {bytes(used)} · {bytes(total - used)} free on {where}
        </p>
      </div>
      {d.items.length === 0 ? (
        <EmptyState icon="download" title="Nothing downloaded">
          {app === 'mobile' ? 'Tap' : 'Choose'} Download on a film, an episode or an album to keep
          it on {where}. It plays without the server.
        </EmptyState>
      ) : (
        <ul aria-label="Downloads" className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {entriesOf(d.items).map((e) =>
            e.kind === 'item' ? (
              <Row key={e.item.id} x={e.item} d={d} href={href} />
            ) : (
              <Group key={e.group.id} group={e.group} items={e.items} d={d} href={href} />
            ),
          )}
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

type Downloads = ReturnType<typeof useDownloads>

/** A show's season or an album: its art, name and size, Remove, then each episode or song. */
function Group({
  group: g,
  items,
  d,
  href,
}: {
  group: OfflineGroup
  items: Offline[]
  d: Downloads
  href: (x: Offline) => string | undefined
}) {
  const server = useServerName()
  const name = g.kind === 'season' ? `${g.show.title}, ${g.title}` : g.title
  const size = items.reduce((s, x) => s + x.bytes, 0)
  const unit = kinds[g.kind === 'season' ? 'episode' : 'song']
  return (
    <li className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div className="grid grid-cols-[min(7rem,35%)_minmax(0,1fr)] items-center gap-3 medium:grid-cols-[10rem_minmax(0,1fr)]">
        <div className={cn('grid', g.kind === 'season' ? 'w-[60%]' : 'w-[56.25%]')}>
          <Poster
            title={name}
            src={g.kind === 'season' ? g.poster : g.cover}
            aspect={g.kind === 'season' ? 'poster' : 'square'}
          />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
          <p className="truncate font-semibold text-body">
            {g.kind === 'season' ? g.show.title : g.title}
          </p>
          <p className="truncate text-caption text-text-2">
            {g.kind === 'season' ? g.title : g.artist}
          </p>
          <p className="text-caption text-text-3">
            {items.length} {unit[items.length === 1 ? 0 : 1]} · {bytes(size)}
          </p>
          <div className="-ms-2 flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              icon="delete"
              onClick={() => {
                d.remove(items.map((x) => x.id))
                toast({ title: `${name} removed`, description: `It still plays from ${server}.` })
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
      <ul
        aria-label={name}
        className="ms-[calc(min(7rem,35%)+0.75rem)] grid max-w-[44rem] grid-cols-[minmax(0,1fr)] gap-2.5 border-line border-s ps-3 medium:ms-[10.75rem]"
      >
        {items.map((x) => (
          <Row key={x.id} x={x} d={d} href={href} compact />
        ))}
      </ul>
    </li>
  )
}

function Row({
  x,
  d,
  href,
  compact = false,
}: {
  x: Offline
  d: Downloads
  href: (x: Offline) => string | undefined
  /** In a group: no art, the episode's code or the song's number before its title. */
  compact?: boolean
}) {
  const server = useServerName()
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
          description: `It still plays from ${server}.`,
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
      line: `The download stopped when ${server} couldn’t be reached.`,
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
      line: `Connect to ${server} to keep ${x.kind === 'song' ? 'listening to' : 'watching'} it.`,
      actions: remove,
    },
  }
  const s = status[x.state]
  const moving = x.state === 'downloading' || x.state === 'paused'
  const to = x.state === 'done' ? href(x) : undefined
  const actions = (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 [&>*]:h-auto [&>*]:min-h-(--size-control-sm) [&>*]:max-w-full [&>*]:whitespace-normal [&>*]:py-1 [&>*]:text-start',
        compact ? 'justify-end' : '-ms-2',
      )}
    >
      {s.actions}
    </div>
  )
  return (
    <li
      className={cn(
        'grid items-center',
        compact ? 'gap-x-3 gap-y-1' : 'gap-3',
        compact
          ? 'grid-cols-[minmax(0,1fr)_auto]'
          : 'grid-cols-[min(7rem,35%)_minmax(0,1fr)] medium:grid-cols-[10rem_minmax(0,1fr)]',
      )}
    >
      {!compact && <Poster title={x.title} src={x.still} aspect="still" href={to} />}
      <div className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)]', compact ? 'gap-0.5' : 'gap-1')}>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {compact && x.caption && (
            <span className="text-caption text-text-3 tabular-nums">{x.caption}</span>
          )}
          {compact && to ? (
            <a
              href={to}
              className="min-w-0 truncate font-semibold text-body outline-none hover:underline focus-visible:ring-focus"
            >
              {x.title}
            </a>
          ) : (
            <span className="min-w-0 truncate font-semibold text-body">{x.title}</span>
          )}
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
        <p className={cn('text-caption', x.state === 'failed' ? 'text-danger' : 'text-text-3')}>
          {compact && x.state === 'done' ? size : s.line}
        </p>
        {!compact && actions}
      </div>
      {compact && actions}
    </li>
  )
}
