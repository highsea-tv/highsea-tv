// SPDX-License-Identifier: AGPL-3.0-only
// `media.file-facts` (checkpoint 8d): queued at boot until it has filled the files recorded before
// 8d, then not again.
import { expect, test } from 'bun:test'
import { createEventBus, createFakeClock } from '@highsea/core'
import { migrate, openDatabase, schema } from '@highsea/db'
import { createJobQueue } from '@highsea/jobs'
import { FILE_FACTS_JOB, scheduleFileFacts } from '../src/file-facts.ts'

test('fills old files once, and isn’t queued again', async () => {
  const { db, raw } = openDatabase(':memory:')
  migrate(raw)
  const clock = createFakeClock()
  const now = clock.now()
  db.insert(schema.mediaItems)
    .values({
      id: 'itm_1',
      type: 'movie',
      tmdbId: 1,
      title: 'A',
      sortTitle: 'a',
      status: 'available',
      monitored: true,
      minimumAvailability: 'released',
      qualityProfileId: 'qp',
      rootFolder: '/m',
      path: '/m/a',
      addedAt: now,
      updatedAt: now,
    })
    .run()
  db.insert(schema.mediaFiles)
    .values({
      id: 'fil_1',
      itemId: 'itm_1',
      path: '/m/a/a.mkv',
      size: 1,
      addedAt: now,
      mediaInfo: {
        probe: {
          duration: 1,
          container: null,
          video: { codec: 'av1', width: 1920, height: 1080, hdr: 'hdr10' },
          audio: [{ language: 'jpn' }],
          subtitles: [],
        },
      },
    })
    .run()

  const boot = () => {
    const jobs = createJobQueue({ db, clock, events: createEventBus({ now: clock.now }) })
    scheduleFileFacts({ db, jobs, clock })
    return jobs
  }
  const jobs = boot()
  expect(jobs.list({ status: ['queued'] }).map((j) => j.type)).toEqual([FILE_FACTS_JOB])
  await jobs.tick()
  await jobs.idle()
  expect(
    db
      .select({
        resolution: schema.mediaFiles.resolution,
        hdr: schema.mediaFiles.hdr,
        videoCodec: schema.mediaFiles.videoCodec,
      })
      .from(schema.mediaFiles)
      .get(),
  ).toEqual({ resolution: 1080, hdr: 'hdr10', videoCodec: 'av1' })
  expect(db.select().from(schema.mediaFileLanguages).all()).toEqual([
    { fileId: 'fil_1', kind: 'audio', language: 'ja' },
  ])
  expect(boot().list({ status: ['queued'] })).toHaveLength(0)
})
