// SPDX-License-Identifier: AGPL-3.0-only
// Kept in (client-settings.md › Offline, checkpoint 4.4a): the folder the desktop app keeps its
// downloads in, under the Downloads page's settings. Change opens the system's folder picker; what's
// already downloaded then moves there, playing from where it is until it has moved. The prototype
// can't open a system dialog, so Change picks a folder on another drive at once.
import { bytes } from '@highsea-tv/core/format'
import { Button, ConfirmDialog, Field, Progress, toast } from '@highsea-tv/ui-web'
import { useEffect, useState } from 'react'
import { useDesktopOs, useLibrary } from '../client/data.ts'
import { useDownloads } from '../client/downloads.ts'
import type { DesktopOs } from '../proto/state.ts'

/** Each OS's videos folder, where downloads go until the person chooses another. */
const folders: Record<DesktopOs, { first: string; picked: string }> = {
  mac: { first: '~/Movies/highsea', picked: '/Volumes/Films/highsea' },
  windows: { first: 'C:\\Users\\Ines\\Videos\\highsea', picked: 'D:\\Films\\highsea' },
  linux: { first: '~/Videos/highsea', picked: '/media/ines/Films/highsea' },
}

/** How long the prototype takes to move everything. */
const MOVE_MS = 6000

// the folder outlives the page, as the app's setting would
const chosen: Partial<Record<DesktopOs, string>> = {}

export function KeptIn() {
  const os = useDesktopOs()
  const library = useLibrary()
  const d = useDownloads('desktop', library.data)
  const [folder, setFolder] = useState(chosen[os] ?? folders[os].first)
  const [asking, setAsking] = useState<string | null>(null)
  const [moving, setMoving] = useState<{ to: string; started: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const kept = d.items.filter((x) => x.progress > 0)
  const total = kept.reduce((s, x) => s + x.bytes * x.progress, 0)

  useEffect(() => setFolder(chosen[os] ?? folders[os].first), [os])

  useEffect(() => {
    if (!moving) return
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t - moving.started >= MOVE_MS) {
        chosen[os] = moving.to
        setFolder(moving.to)
        setMoving(null)
        toast({ title: 'Downloads moved', description: moving.to })
      }
    }, 250)
    return () => clearInterval(timer)
  }, [moving, os])

  const change = () => {
    const to = folder === folders[os].picked ? folders[os].first : folders[os].picked
    if (kept.length === 0) {
      chosen[os] = to
      setFolder(to)
      toast({ title: 'New downloads go here', description: to })
    } else setAsking(to)
  }
  const done = moving ? Math.min(1, (now - moving.started) / MOVE_MS) : 0

  return (
    <>
      <Field
        label="Kept in"
        hint="New downloads go here. Changing it moves what’s already downloaded."
      >
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 truncate font-mono text-figure text-text-2">{folder}</code>
            <Button size="sm" icon="folder" onClick={change} disabled={moving !== null}>
              Change
            </Button>
          </div>
          {moving && (
            <div role="status" className="grid gap-1.5">
              <Progress value={done * 100} aria-label="Moving downloads" />
              <p className="text-[13px] text-text-3">
                Moving {kept.length} {kept.length === 1 ? 'movie' : 'movies'} to{' '}
                <span className="font-mono">{moving.to}</span> · {bytes(total * done)} of{' '}
                {bytes(total)}. They play from where they are until they’ve moved.
              </p>
            </div>
          )}
        </div>
      </Field>
      <ConfirmDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Move your downloads?"
        description={`Your ${kept.length} downloaded ${kept.length === 1 ? 'movie' : 'movies'} (${bytes(total)}) move to ${asking ?? ''}. Make sure it has room. They keep playing while they move.`}
        confirmLabel="Move downloads"
        onConfirm={() => {
          if (asking) setMoving({ to: asking, started: Date.now() })
          setAsking(null)
        }}
      />
    </>
  )
}
