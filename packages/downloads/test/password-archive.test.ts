// SPDX-License-Identifier: AGPL-3.0-only
// A release that can never import (6b: a password-protected archive, which unar stops on) is
// blocklisted and replaced through the same path a stalled release takes, not left waiting.
import { afterEach, describe, expect, test } from 'bun:test'
import { randomBytes } from 'node:crypto'
import { schema } from '@highsea-tv/db'
import { ITEM, setup, sintelSearch, until, VERSION } from './helpers.ts'

type T = Awaited<ReturnType<typeof setup>>
const open: T[] = []
afterEach(async () => {
  for (const t of open.splice(0)) await t.close()
})

const BEST = 'fake-json:101'

describe('an import that can never succeed', () => {
  test('a password-protected archive is blocklisted and another release grabbed', async () => {
    const reason = 'The release is a password-protected archive.'
    const t = await setup({
      importer: async () => ({ ok: false, reason, replace: true }),
    })
    open.push(t)
    const files = [{ path: 'Sintel.rar', data: new Uint8Array(randomBytes(200_000)) }]
    await t.seed(101, files, 'Sintel.rar')
    await t.indexers.search(sintelSearch())
    await t.downloads.grab({
      itemId: ITEM,
      versionId: VERSION,
      indexerId: t.indexer.id,
      guid: BEST,
    })
    await until(() => t.downloads.queue()[0]?.state === 'importing', 20_000, 'the download')
    await t.drain()
    const first = t.db
      .select()
      .from(schema.downloads)
      .all()
      .find((r) => r.guid === BEST)
    expect(first?.state).not.toBe('import-blocked')
    expect(t.downloads.blocklist().map((b) => b.reason)).toEqual([reason])
    expect(t.downloads.queue().map((q) => q.release)).not.toContain(first?.releaseTitle)
    expect(t.history.map((h) => h.type)).toEqual(expect.arrayContaining(['grabbed', 'blocklisted']))
  }, 30_000)
})
