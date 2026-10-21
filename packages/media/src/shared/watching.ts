// SPDX-License-Identifier: AGPL-3.0-only
// Watching the root folders (checkpoint 6, Watching the filesystem and the library scan, 6b). The
// library scan is the source of truth; watching only speeds it up: a change under a root folder
// asks for a scan of the title folder it happened in, a few seconds later.
//
// `fs.watch` with `recursive`, which Node supports on Linux since 19.1.0 as well as macOS and
// Windows. Node's documentation calls it "unreliable, and in some cases impossible, on network file
// systems (NFS, SMB, etc)" (https://nodejs.org/docs/latest-v24.x/api/fs.html#caveats), and inotify
// has a per-user limit on watches, past which adding one fails with ENOSPC
// (https://man7.org/linux/man-pages/man7/inotify.7.html). So a watch that can't start, or that
// fails later, is closed and becomes a health note, never an error: the 12-hourly scan still finds
// every change. No dependency: chokidar would add little here (the checkpoint's judgement call 10).
import { type FSWatcher, watch as fsWatch, type WatchListener } from 'node:fs'
import { join, sep } from 'node:path'

/** `fs.watch`'s shape, so a test can make watching fail. */
export type WatchFn = (
  path: string,
  options: { recursive: boolean; persistent: boolean },
  listener: WatchListener<string>,
) => Pick<FSWatcher, 'close' | 'on'>

export type WatchProblem = { root: string; message: string }

export type LibraryWatchOptions = {
  /** Called with the title folder (the root's child) where something changed, after the quiet time. */
  onChange(folder: string): void
  watch?: WatchFn
  /** How long to wait after the last change in a folder before asking for its scan. */
  quietMs?: number
  log?: { warn(message: string, data?: Record<string, unknown>): void }
}

/** Why a watch can't run, in the owner's words. */
export function watchFailure(e: unknown): string {
  const code = (e as NodeJS.ErrnoException)?.code
  if (code === 'ENOSPC') return 'the system’s limit on watched folders is reached'
  if (code === 'EMFILE') return 'too many files are open'
  if (code === 'ENOENT') return 'the folder isn’t there'
  if (code === 'EACCES' || code === 'EPERM') return 'highsea isn’t allowed to read it'
  if (code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') return 'this system can’t watch folders'
  return (e as Error)?.message || 'watching failed'
}

export function createLibraryWatch(options: LibraryWatchOptions) {
  const watch: WatchFn = options.watch ?? ((path, opts, listener) => fsWatch(path, opts, listener))
  const quietMs = options.quietMs ?? 5_000
  const watchers = new Map<string, Pick<FSWatcher, 'close' | 'on'>>()
  const problems = new Map<string, string>()
  const pending = new Map<string, ReturnType<typeof setTimeout>>()

  function changed(root: string, filename: string | null) {
    // the title folder: the root's child the change is under (the root itself when unknown)
    const first = filename ? filename.split(/[\\/]/).find(Boolean) : undefined
    const folder = first ? join(root, first) : root
    const waiting = pending.get(folder)
    if (waiting) clearTimeout(waiting)
    const timer = setTimeout(() => {
      pending.delete(folder)
      options.onChange(folder)
    }, quietMs)
    // never keeps the process alive on its own
    timer.unref?.()
    pending.set(folder, timer)
  }

  function fail(root: string, e: unknown) {
    const message = watchFailure(e)
    problems.set(root, message)
    watchers.get(root)?.close()
    watchers.delete(root)
    options.log?.warn('can’t watch a root folder; the library scan covers it', { root, message })
  }

  function start(root: string) {
    try {
      const w = watch(root, { recursive: true, persistent: false }, (_event, filename) =>
        changed(root, filename ? String(filename) : null),
      )
      w.on('error', (e: unknown) => fail(root, e))
      watchers.set(root, w)
      problems.delete(root)
    } catch (e) {
      fail(root, e)
    }
  }

  return {
    /** Watches exactly these roots: new ones start, removed ones stop. A root that failed is tried again. */
    sync(roots: readonly string[]) {
      const want = new Set(roots.map((r) => (r.endsWith(sep) && r.length > 1 ? r.slice(0, -1) : r)))
      for (const [root, w] of watchers)
        if (!want.has(root)) {
          w.close()
          watchers.delete(root)
        }
      for (const root of problems.keys()) if (!want.has(root)) problems.delete(root)
      for (const root of want) if (!watchers.has(root)) start(root)
    },
    /** The roots that aren't watched, and why. */
    problems: (): WatchProblem[] => [...problems].map(([root, message]) => ({ root, message })),
    watching: () => [...watchers.keys()],
    stop() {
      for (const w of watchers.values()) w.close()
      watchers.clear()
      for (const t of pending.values()) clearTimeout(t)
      pending.clear()
    },
  }
}

export type LibraryWatch = ReturnType<typeof createLibraryWatch>
