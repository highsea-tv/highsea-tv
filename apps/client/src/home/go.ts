// SPDX-License-Identifier: AGPL-3.0-only
// Home's links: the shared paths (@highsea-tv/client/library's cardPage and playPath) pushed onto
// the router, which types its addresses.
import { cardPage, cardPlayPath, playPath } from '@highsea-tv/client/library'
import { type Href, router } from 'expo-router'

/** Opens a film's page, or an episode's show at the episode (Continue watching's "Go to" too). */
export const openTitle = (item: { id: number; title: string }) =>
  router.push(cardPage(item) as Href)

/** Opens the player at a title. */
export const playTitle = (id: number) => router.push(playPath(id) as Href)

/** Opens the player at a card's title: a film, or an episode (`/play/episode/{id}`). */
export const playCard = (item: { id: number; show?: { id: number } | null }) =>
  router.push(cardPlayPath(item) as Href)
