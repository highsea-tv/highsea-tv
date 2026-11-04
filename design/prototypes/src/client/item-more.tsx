// SPDX-License-Identifier: AGPL-3.0-only
// Mark as watched on the item page (client-detail.md#mark-as-watched, checkpoint 4.0b), or Mark as
// unwatched once it is: a toggle among the film page's round buttons on every app since the
// redesign of 2026-10-30, in place of the More menu and the TV's long press of OK. Watched means
// played to the end, for this person only; marking it unwatched starts it again from the beginning.

import { createFilmsText } from '@highsea-tv/client/films'
import type { ClientItem } from '@highsea-tv/mock/types'
import { toast } from '@highsea-tv/ui'
import { useAction } from '../mock/hooks.tsx'

const films = createFilmsText('en')

export function useMarkWatched(item: ClientItem) {
  const set = useAction((c, watched: boolean) => c.playback.setWatched(item.id, watched))
  const words = films.markWatched(item)
  return {
    label: words.label,
    run: async () => {
      const watched = !item.watched
      await set.run(watched)
      toast(words.toast(watched))
    },
  }
}
