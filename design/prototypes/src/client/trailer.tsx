// SPDX-License-Identifier: AGPL-3.0-only
// A trailer or extra on the film page, web, desktop and the phone. The product plays it from
// `https://www.youtube-nocookie.com/embed/{key}?autoplay=1`, only once it's chosen, as the admin
// does; the prototype stays offline, so the still and a note stand in for the player.
import { Dialog, DialogContent } from '@highsea-tv/ui-web'
import type { Video } from '../mock/types.ts'
import { videoLength } from './detail-facts.ts'

export function TrailerDialog({
  video: v,
  onOpenChange,
}: {
  video: Video | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={!!v} onOpenChange={onOpenChange}>
      <DialogContent size="lg" title={v?.name ?? 'Trailer'}>
        {v && (
          <div className="grid gap-3">
            <div className="relative isolate grid aspect-still place-items-center overflow-hidden rounded-md bg-s2">
              <img src={v.still} alt="" className="-z-10 absolute inset-0 size-full object-cover" />
              <p className="glass-badge mx-4 max-w-sm rounded-md px-4 py-3 text-center text-caption text-text">
                In highsea this plays from youtube-nocookie.com, and only once you choose it. The
                prototype doesn’t load YouTube.
              </p>
            </div>
            <p className="text-caption text-text-3">
              {v.kind} · {videoLength(v.lengthSeconds)}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
