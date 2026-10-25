// SPDX-License-Identifier: AGPL-3.0-only
// More on the item page (client-detail.md#mark-as-watched, checkpoint 4.0b), web and mobile:
// Mark as watched, or Mark as unwatched once it is. Watched means played to the end, for this
// person only; marking it unwatched starts it again from the beginning. TV has the same through a
// long press of OK.
import { Button, Menu, MenuContent, MenuItem, MenuTrigger, toast } from '@highsea-tv/ui-web'
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

export function ItemMore({ item, className }: { item: ClientItem; className?: string }) {
  const mark = useMarkWatched(item)
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button iconOnly icon="more" aria-label="More" className={className} />
      </MenuTrigger>
      <MenuContent align="start">
        <MenuItem icon={item.watched ? 'replay' : 'check'} onSelect={mark.run}>
          {mark.label}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
