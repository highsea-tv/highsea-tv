// SPDX-License-Identifier: AGPL-3.0-only
// What the work answers share: a mock title's movie, and the refusals (one-client-platform-d.md › D2), in the server's own words:
// packages/downloads' service and categories, packages/torrent's engine, packages/indexers'
// service, packages/media's library import and apps/server's fs route.
import { createT, defineMessages } from '@highsea-tv/i18n'
import type { ServerState } from '../seed.ts'
import type { MediaItem } from '../types.ts'

export const workMessages = defineMessages({
  'work.queueGone': 'That download isn’t in the queue any more.',
  'work.onlyBlocked': 'Only a blocked import can be forced.',
  'work.finished': 'That download has already finished.',
  'work.torrentGone': 'That torrent isn’t in the list any more.',
  'work.fileGone': 'That file isn’t in the torrent.',
  'work.duplicate': 'That torrent is already in Downloads.',
  'work.notALink': 'That isn’t a magnet link or an address.',
  'work.noCategory': 'There’s no category named {name}.',
  'work.moviesCategory': 'Choose one of your categories, or manual.',
  'work.blocklistGone': 'That release isn’t on the blocklist any more.',
  'work.badCursor': 'That page link has expired. Start from the first page.',
  'work.replaced': 'Replaced from Activity.',
  'work.removed': 'Removed from Activity.',
  'work.noFolder': '{path} doesn’t exist on the server, or isn’t a folder.',
  'work.outside': '{path} is outside the folders highsea may look in.',
  'work.movieUnknown': 'That movie isn’t in the library.',
  'work.imported': 'Imported into {title} ({year}).',
  'work.pickRoot': 'Pick one of the root folders.',
  'work.mixedRoots': 'Every folder comes from one root folder.',
  'work.duplicateMovie': 'Two folders are matched to one movie.',
  'work.importRunning': 'A library import is already running.',
  'work.inLibrary': 'Already in the library.',
  'work.noMatch': 'No match on TMDB. Pick the movie to import it.',
  'work.indexerUnknown': 'That indexer isn’t installed.',
  'work.definitionUnknown': 'That indexer isn’t in the catalog.',
  'work.neitherUnknown': 'That indexer isn’t installed or in the catalog.',
})

export const tw = createT(workMessages)

/** The mock's title by its own id, when it's a movie: the contract addresses one by its TMDB id. */
export const movieOf = (s: ServerState, itemId: string | null): MediaItem | undefined =>
  itemId ? s.items.find((m) => m.id === itemId && m.type === 'movie') : undefined
