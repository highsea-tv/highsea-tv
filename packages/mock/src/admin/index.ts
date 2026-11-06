// SPDX-License-Identifier: AGPL-3.0-only
// The admin's routes (one-client-platform-d.md › D2), one file per area: the dashboard and the
// System widgets' sources; movies, metadata and their settings' reads; collections, Wanted and
// curation; the work (the queue, history, the blocklist, downloads, both imports, Now playing);
// subtitles and indexers. The transport merges them under the routes it answers itself.
import { curationAnswers } from './curation.ts'
import { dashboardAnswers } from './dashboard.ts'
import type { AdminKit, Answers } from './kit.ts'
import { moviesAnswers } from './movies.ts'
import { subtitlesAnswers } from './subtitles.ts'
import { workAnswers } from './work.ts'

export type { AdminKit } from './kit.ts'

export function adminAnswers(kit: AdminKit): Answers {
  const out: Record<string, Record<string, unknown>> = {}
  for (const area of [
    dashboardAnswers(kit),
    moviesAnswers(kit),
    curationAnswers(kit),
    workAnswers(kit),
    subtitlesAnswers(kit),
  ] as Record<string, Record<string, unknown>>[])
    for (const [group, routes] of Object.entries(area)) out[group] = { ...out[group], ...routes }
  return out as Answers
}
