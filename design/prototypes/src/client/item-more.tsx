// SPDX-License-Identifier: AGPL-3.0-only
// Mark as watched on the item page (client-detail.md#mark-as-watched, checkpoint 4.0b), or Mark as
// unwatched once it is: a toggle among the film page's round buttons on every app since the
// redesign of 2026-10-30, in place of the More menu and the TV's long press of OK. Watched means
// played to the end, for this person only; marking it unwatched starts it again from the beginning.
import { toast } from '@highsea-tv/ui-web'
import { useAction } from '../mock/hooks.tsx'
import type { ClientItem } from '../mock/types.ts'

export function useMarkWatched(item: ClientItem) {
  const set = useAction((c, watched: boolean) => c.playback.setWatched(item.id, watched))
  return {
    label: item.watched ? 'Mark as unwatched' : 'Mark as watched',
    run: async () => {
      const watched = !item.watched
      await set.run(watched)
      toast({
        title: watched ? `${item.title} marked as watched` : `${item.title} marked as unwatched`,
        description: watched ? undefined : 'It plays from the start next time.',
      })
    },
  }
}
