// SPDX-License-Identifier: AGPL-3.0-only
// `media.file-facts` (checkpoint 8d, ADR 0049): fills collection rules' file facts (resolution, HDR,
// codec, audio and subtitle languages) from the probes of files recorded before 8d. New probes write
// their own as they're stored, so it's queued at boot only until it has run once for this version.
// It derives everything from what's stored, so it's safe to repeat (ADR 0022).
import type { Clock } from '@highsea-tv/core'
import type { Db } from '@highsea-tv/db'
import type { JobQueue } from '@highsea-tv/jobs'
import { deriveAllFileFacts, fileFactsCurrent } from '@highsea-tv/media/shared'
import { z } from 'zod'

export const FILE_FACTS_JOB = 'media.file-facts'

export function scheduleFileFacts({ db, jobs, clock }: { db: Db; jobs: JobQueue; clock: Clock }) {
  jobs.define({
    type: FILE_FACTS_JOB,
    payload: z.object({}),
    attempts: 3,
    timeoutMs: 30 * 60_000,
    async run() {
      await deriveAllFileFacts(db, clock.now())
    },
  })
  if (!fileFactsCurrent(db)) jobs.enqueue(FILE_FACTS_JOB, {}, { dedupeKey: 'file-facts' })
}
