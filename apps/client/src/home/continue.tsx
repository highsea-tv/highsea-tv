// SPDX-License-Identifier: AGPL-3.0-only
// Continue watching (client-home.md › Continue watching): 16:9 stills with the bar under the art
// and the time left, each resuming (`/play/{id}`, an episode's `/play/episode/{id}`), with a menu
// to go to the film (an episode's show, opened at it), mark it watched, or take it off the row. By the form factor:
// - touch: cards 62% of the row (the phone prototype's w-[62%]); holding one opens the menu, the
//   library's Menu as a sheet (mobile/home.tsx ContinueCard), which VoiceOver offers as the card's
//   action;
// - a pointer: cards at the web's 16:9 width (web/home.tsx cardWidth, clamp(15rem, 24vw, 21rem))
//   with ⋯ among each poster's quick actions, the menu hung from it (web/home.tsx ContinueMenu);
// - the TV: wider tiles, OK resuming and OK held opening the Menu's TV form (tv/home.tsx), in the
//   screen itself, which handles Back.
// Done, the screen says so (kit's useSay), as the prototypes' toast does.
import type { HomeItem } from '@highsea-tv/api-contract'
import { useContinueActions } from '@highsea-tv/client/data'
import { createLibraryText, LONG_PRESS_MS } from '@highsea-tv/client/library'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useMedia } from '@highsea-tv/native/media'
import {
  Button,
  Menu,
  type MenuOption,
  Poster,
  pointerItemWidth,
  Row,
  useFormFactor,
  usePosterWidth,
} from '@highsea-tv/ui'
import type { ViewHandle } from '@highsea-tv/ui/tv'
import { type Href, router } from 'expo-router'
import { useMemo, useRef, useState } from 'react'
import { useWindowDimensions, View } from 'react-native'
import { useFilmsText } from '../films.ts'
import { useSay } from '../kit.tsx'
import { playCard } from './go.ts'
import { homeMessages } from './messages.ts'
import { HOME } from './sizes.ts'

/** What the menu's choices do, and what's said after. */
function useMenu(item: HomeItem, onError: (message: string) => void) {
  const t = useT(homeMessages)
  const locale = useLocale()
  const words = useMemo(() => createLibraryText(locale).continueMenu(item), [locale, item])
  const actions = useContinueActions(item.id, item.show ? 'episode' : 'movie')
  const say = useSay()
  const failed = (e: unknown) =>
    onError(t('changeFailed', { message: e instanceof Error ? e.message : String(e) }))
  return {
    words,
    goTo: () => router.push(words.goTo.path as Href),
    markWatched: () =>
      actions.markWatched
        .run()
        .then(() => say({ title: words.marked }))
        .catch(failed),
    remove: () =>
      actions.remove
        .run()
        .then(() => say({ title: words.removed.title, body: words.removed.description }))
        .catch(failed),
  }
}

/**
 * How the menu closed: its card stays (focus back to it), its card left the row (focus to the
 * row's next), or Go to the film left Home (no focus to move).
 */
export type MenuClose = 'stay' | 'gone' | 'leave'

/** The menu's three choices, for the library's Menu. */
function useChoices(item: HomeItem, onClose: (how: MenuClose) => void): MenuOption[] {
  const say = useSay()
  const menu = useMenu(item, (message) => say({ title: message }))
  return [
    {
      label: menu.words.goTo.label,
      icon: item.show ? 'series' : 'movie',
      onSelect: () => {
        onClose('leave')
        menu.goTo()
      },
    },
    {
      label: menu.words.markWatched,
      icon: 'check',
      onSelect: () => {
        onClose('gone')
        void menu.markWatched()
      },
    },
    {
      label: menu.words.remove,
      icon: 'remove',
      onSelect: () => {
        onClose('gone')
        void menu.remove()
      },
    },
  ]
}

/** Continue watching on touch and with a pointer. */
export function HomeContinueRow({ title, items }: { title: string; items: HomeItem[] }) {
  const input = useFormFactor().input
  const touchWidth = usePosterWidth(HOME.continueShare)
  const pointerWidth = pointerItemWidth(useWindowDimensions().width, 'still')
  const width = input === 'touch' ? touchWidth : pointerWidth
  return (
    <Row
      title={title}
      items={items}
      itemWidth={width}
      keyOf={(m) => m.id}
      render={(m) => <HomeContinueCard item={m} width={width} pointer={input === 'pointer'} />}
    />
  )
}

/**
 * A card and its menu: held on touch, which opens the menu as a sheet; with a pointer, ⋯ among the
 * poster's quick actions (web/home.tsx ContinueMenu), a right click or the context key, each
 * opening it hung from ⋯.
 */
function HomeContinueCard({
  item,
  width,
  pointer,
}: {
  item: HomeItem
  width: number
  pointer: boolean
}) {
  const t = useT(homeMessages)
  const films = useFilmsText()
  const media = useMedia()
  const card = useMemo(() => films.card(item, { resume: true }), [films, item])
  const label = t('cardMenu', { title: card.title })
  const [open, setOpen] = useState(false)
  const more = useRef<ViewHandle>(null)
  const items = useChoices(item, () => setOpen(false))
  const onMenu = () => setOpen(true)
  // a pointer's right click, and the keyboard's context key (or Shift+F10) on the focused card,
  // which browsers send as a `contextmenu` event (https://developer.mozilla.org/docs/Web/API/Element/contextmenu_event);
  // react-native-web passes the handler to the element
  const contextMenu = pointer
    ? {
        onContextMenu: (e: { preventDefault: () => void }) => {
          e.preventDefault()
          onMenu()
        },
      }
    : {}
  return (
    <View style={{ width }} {...contextMenu}>
      <Poster
        title={card.title}
        src={media(card.src)}
        aspect={card.aspect}
        width={width}
        showTitle
        caption={card.caption}
        progress={(card.progress ?? 0) * 100}
        progressBelow
        onPress={() => playCard(item)}
        onLongPress={pointer ? undefined : onMenu}
        longPressLabel={pointer ? undefined : label}
        longPressMs={LONG_PRESS_MS}
        actions={
          <Button
            ref={more}
            variant="overlay"
            iconOnly
            icon="more"
            hasPopup="menu"
            accessibilityLabel={label}
            accessibilityState={{ expanded: open }}
            onPress={onMenu}
          />
        }
      />
      <Menu
        title={item.title}
        items={items}
        open={open}
        onClose={() => setOpen(false)}
        anchor={more}
      />
    </View>
  )
}

/** The TV's menu over Home, from OK held on a card. Back closes it (Home's Back). */
export function HomeTvContinueMenu({
  item,
  onClose,
}: {
  item: HomeItem
  onClose: (how: MenuClose) => void
}) {
  const items = useChoices(item, onClose)
  return <Menu title={item.title} items={items} open onClose={() => onClose('stay')} />
}
