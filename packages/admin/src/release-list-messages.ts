// SPDX-License-Identifier: AGPL-3.0-only
// The release list's copy (release-list.tsx): a film's Search tab and a show's season or episode
// search say it the same way. Moved from movie-detail-messages.ts with Phase 5 C1.
import { defineMessages } from '@highsea-tv/i18n'

export const releaseList = defineMessages({
  'search.what': 'the releases',
  'search.searching': 'Searching {count, plural, one {# indexer} other {# indexers}}…',
  'search.count': '{count, plural, one {# release} other {# releases}}',
  'search.accepted': '{count} accepted by your profile',
  'search.showRejected': 'Show rejected',
  'search.again': 'Search again',
  'search.none': 'No indexer returned a release. Check Indexers, or try again later.',
  'search.release': 'Release',
  'search.quality': 'Quality',
  'search.score': 'Score',
  'search.size': 'Size',
  'search.peers': 'Peers',
  'search.age': 'Age',
  'search.decision': 'Decision',
  'search.actions': 'Actions',
  'search.unknown': '—',
  'search.approved': 'Accepted',
  'search.rejected': 'Rejected ({count})',
  'search.reasons': ': show the reasons',
  'search.grab': 'Grab {title}',
  'search.grabAnyway': 'Grab anyway {title}',
  'search.grabTip': 'Grab',
  'search.grabAnywayTip': 'Grab anyway: overrides your profile',
  'search.grabbed': 'Grabbed',
  'grab.done': 'Grabbed',
  'grab.doneBody': '{title} is downloading. Follow it in Activity.',
  'grab.failed': 'Couldn’t grab it',
  'search.failedIndexer': '{indexer} didn’t answer: {message}',
  'search.pack': 'Season {season}',
})
