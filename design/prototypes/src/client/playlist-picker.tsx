// SPDX-License-Identifier: AGPL-3.0-only
// Add to playlist (prototype-gaps.md › 3.8), in the web's dialog and the phone's sheet: New
// playlist first, then the person's own, the most recently changed first, each with its mosaic
// and count. New playlist asks for a name in place, and the songs go into it.

import type { ClientPlaylist } from '@highsea-tv/mock/types'
import { Button, cn, Field, Icon, Input } from '@highsea-tv/ui'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { usePlaylists } from './song-menu.ts'

/** A playlist's first four covers in a square, or one cover, or the music icon when it's empty. */
export function PlaylistMosaic({ covers, className }: { covers: string[]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid aspect-square overflow-hidden rounded-[6px] bg-s2',
        covers.length >= 4 && 'grid-cols-2 grid-rows-2',
        className,
      )}
    >
      {covers.length === 0 ? (
        <Icon name="music" size={20} className="place-self-center text-text-3" />
      ) : (
        covers
          .slice(0, covers.length >= 4 ? 4 : 1)
          .map((c) => <img key={c} src={c} alt="" className="size-full object-cover" />)
      )}
    </span>
  )
}

/** A form for a playlist's name: New playlist, and Rename. */
export function PlaylistNameForm({
  initial = '',
  submit,
  onDone,
  onCancel,
}: {
  initial?: string
  submit: string
  onDone: (name: string) => void
  onCancel?: () => void
}) {
  const [name, setName] = useState(initial)
  // the name takes focus once the dialog's or the sheet's own focus has settled on its first button
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => field.current?.select())
    return () => cancelAnimationFrame(frame)
  }, [])
  const on = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onDone(name.trim())
  }
  return (
    <form onSubmit={on} className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <Field label="Name">
        <Input ref={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          {submit}
        </Button>
      </div>
    </form>
  )
}

export function PlaylistPicker({
  onPick,
  onNew,
  size,
}: {
  onPick: (p: ClientPlaylist) => void
  onNew: (name: string) => void
  size: 'web' | 'mobile'
}) {
  const lists = usePlaylists()
  const [naming, setNaming] = useState(false)
  const row = cn(
    'grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-md px-3 text-start outline-none transition-tint hover:bg-text/6 focus-visible:ring-focus',
    size === 'mobile' ? 'min-h-14' : 'min-h-12',
  )
  const art = size === 'mobile' ? 'size-11' : 'size-10'
  if (naming)
    return (
      <PlaylistNameForm submit="Make playlist" onDone={onNew} onCancel={() => setNaming(false)} />
    )
  return (
    <ul className="-mx-3 grid gap-0.5">
      <li>
        <button type="button" onClick={() => setNaming(true)} className={row}>
          <span className={cn('grid place-items-center rounded-[6px] bg-s2', art)}>
            <Icon name="add" size={20} />
          </span>
          <span className="font-semibold">New playlist</span>
        </button>
      </li>
      {(lists.data ?? []).map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onPick(p)} className={row}>
            <PlaylistMosaic covers={p.covers} className={art} />
            <span className="grid min-w-0">
              <span className="truncate font-semibold">{p.name}</span>
              <span className="text-caption text-text-3">
                {p.songs} {p.songs === 1 ? 'song' : 'songs'}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
