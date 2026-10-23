// SPDX-License-Identifier: AGPL-3.0-only
// Watching the root folders: a change asks for its title folder's scan once things are quiet, and
// a watch that can't start or fails later falls back to the scan with a note, never an error.
import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { createLibraryWatch, type WatchFn, watchFailure } from '../../src/shared/watching.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A stand-in for fs.watch: records each watch, lets a test fire changes and errors. */
function fakeWatch(fail: (root: string) => NodeJS.ErrnoException | null = () => null) {
  const live = new Map<
    string,
    { emitter: EventEmitter; listener: (e: string, f: string | null) => void; closed: boolean }
  >()
  const watch: WatchFn = (root, options, listener) => {
    expect(options).toEqual({ recursive: true, persistent: false })
    const error = fail(root)
    if (error) throw error
    const emitter = new EventEmitter()
    const entry = {
      emitter,
      listener: listener as (e: string, f: string | null) => void,
      closed: false,
    }
    live.set(root, entry)
    return {
      on: ((event: string, fn: (...a: unknown[]) => void) => {
        emitter.on(event, fn)
        return undefined as never
      }) as never,
      close: () => {
        entry.closed = true
      },
    }
  }
  return { watch, live }
}

const errno = (code: string) => Object.assign(new Error(code), { code }) as NodeJS.ErrnoException

describe('watching the root folders', () => {
  test('changes in a title folder ask for its scan once, after the quiet time', async () => {
    const { watch, live } = fakeWatch()
    const asked: string[] = []
    const w = createLibraryWatch({ onChange: (f) => asked.push(f), watch, quietMs: 30 })
    w.sync(['/media/movies'])
    expect(w.watching()).toEqual(['/media/movies'])
    const fire = (file: string | null) => live.get('/media/movies')?.listener('rename', file)
    fire(join('Sintel (2010)', 'Sintel (2010).mkv'))
    fire(join('Sintel (2010)', 'Sintel (2010).nfo'))
    fire('Metropolis (1927)/poster.jpg')
    expect(asked).toEqual([])
    await sleep(80)
    expect(asked.sort()).toEqual(['/media/movies/Metropolis (1927)', '/media/movies/Sintel (2010)'])
    // no filename (some platforms leave it out): the whole root
    fire(null)
    await sleep(80)
    expect(asked.at(-1)).toBe('/media/movies')
    w.stop()
  })

  test('a watch that can’t start is a note, and the others still run', () => {
    const { watch } = fakeWatch((root) => (root === '/nas/movies' ? errno('ENOSPC') : null))
    const warned: string[] = []
    const w = createLibraryWatch({
      onChange: () => {},
      watch,
      log: { warn: (m) => warned.push(m) },
    })
    expect(() => w.sync(['/nas/movies', '/local/movies'])).not.toThrow()
    expect(w.watching()).toEqual(['/local/movies'])
    expect(w.problems()).toEqual([
      { root: '/nas/movies', message: 'the system’s limit on watched folders is reached' },
    ])
    expect(warned).toHaveLength(1)
    w.stop()
  })

  test('a watch that fails later is closed and becomes a note; the next sync tries again', () => {
    let failing = false
    const { watch, live } = fakeWatch(() => (failing ? errno('EACCES') : null))
    const w = createLibraryWatch({ onChange: () => {}, watch })
    w.sync(['/media/movies'])
    const entry = live.get('/media/movies')
    entry?.emitter.emit('error', errno('EMFILE'))
    expect(entry?.closed).toBe(true)
    expect(w.watching()).toEqual([])
    expect(w.problems()).toEqual([{ root: '/media/movies', message: 'too many files are open' }])
    failing = true
    w.sync(['/media/movies'])
    expect(w.problems()[0]?.message).toBe('highsea isn’t allowed to read it')
    failing = false
    w.sync(['/media/movies'])
    expect(w.problems()).toEqual([])
    expect(w.watching()).toEqual(['/media/movies'])
    w.stop()
  })

  test('a root folder removed stops being watched, and its note goes', () => {
    const { watch, live } = fakeWatch((root) => (root === '/gone' ? errno('ENOENT') : null))
    const w = createLibraryWatch({ onChange: () => {}, watch })
    w.sync(['/a', '/gone'])
    w.sync([])
    expect(live.get('/a')?.closed).toBe(true)
    expect(w.watching()).toEqual([])
    expect(w.problems()).toEqual([])
  })

  test('failures in the owner’s words', () => {
    expect(watchFailure(errno('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'))).toBe(
      'this system can’t watch folders',
    )
    expect(watchFailure(errno('ENOENT'))).toBe('the folder isn’t there')
    expect(watchFailure(new Error('odd'))).toBe('odd')
  })
})
