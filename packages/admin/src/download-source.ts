// SPDX-License-Identifier: AGPL-3.0-only
// Where a download's data comes from (HT-100), in one line for Downloads, its detail sheet, the
// Queue widget and the movie page's queue card: peers, web seeds, both, or nothing yet. BEP 19's
// web seeds (https://www.bittorrent.org/beps/bep_0019.html) are web servers with the files, not
// peers, so a download fed only by them reads 0/0 peers at full speed; this line names the host
// instead (the owner's ask, 2026-11-19).
import type { QueueItem, Torrent } from '@highsea-tv/api-contract'
import { defineMessages } from '@highsea-tv/i18n'
import { useT } from '@highsea-tv/i18n/react'

export const downloadSource = defineMessages({
  /** The column and the sheet's row. */
  title: 'Source',
  peers: 'Peers {seeds}/{peers}',
  web: 'Web seed · {hosts}',
  both: 'Peers {seeds}/{peers} + {hosts}',
  waiting: 'Waiting for peers',
  moreHosts: '{host} +{more}',
  /** The sheet's split of the speed, when both send. */
  split: '{peers} from peers · {web} from web seeds',
})

type Source = Pick<Torrent | QueueItem, 'state' | 'seeds' | 'peers' | 'webSeeds'>

/** Fetching: with nothing connected it's waiting for peers (a queued one waits its turn). */
const FETCHING = new Set<Source['state']>(['downloading', 'stalled'])

/** The source in a few words; null where none applies (paused, finished, failed). */
export function useDownloadSource(): (x: Source) => string | null {
  const t = useT(downloadSource)
  return (x) => {
    const counts = { seeds: x.seeds.connected, peers: x.peers.connected }
    const swarm = counts.seeds + counts.peers > 0
    const web = x.webSeeds.connected > 0
    const [first, ...rest] = x.webSeeds.hosts
    const hosts = first
      ? rest.length
        ? t('moreHosts', { host: first, more: rest.length })
        : first
      : ''
    if (web && swarm) return t('both', { ...counts, hosts })
    if (web) return t('web', { hosts })
    if (swarm || x.state === 'seeding') return t('peers', counts)
    if (FETCHING.has(x.state)) return t('waiting')
    return null
  }
}
