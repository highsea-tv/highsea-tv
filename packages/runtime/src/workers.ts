// SPDX-License-Identifier: AGPL-3.0-only
// CPU-heavy work (subtitle alignment, piece hashing, image resizing) runs off the main thread in a
// small pool of worker threads. A task names a module and an exported function; its input and
// output must be structured-cloneable. The function gets a second argument, `{ signal }`, which
// aborts when the caller's signal does: a worker can't be stopped from outside without leaving what
// it started (a child process) running, so cancelling asks the task to stop itself (ADR 0044).
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

export type WorkerTask = { module: string; fn: string; input: unknown }

type Pending = {
  id: number
  task: WorkerTask
  signal?: AbortSignal
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

const HOST = new URL('./worker-host.ts', import.meta.url)

export type WorkerPool = {
  run<T>(task: WorkerTask, options?: { signal?: AbortSignal }): Promise<T>
  close(): Promise<void>
}

const aborted = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new Error('The task was cancelled.')

export function createWorkerPool(
  size = Math.max(1, Math.min(4, availableParallelism() - 1)),
): WorkerPool {
  const idle: Worker[] = []
  const all = new Set<Worker>()
  const queue: Pending[] = []
  let closed = false
  let ids = 0

  const spawn = () => {
    const w = new Worker(HOST)
    all.add(w)
    return w
  }

  const dispatch = () => {
    while (queue.length && (idle.length || all.size < size)) {
      const job = queue.shift() as Pending
      const worker = idle.pop() ?? spawn()
      // the task's id rides on the cancel, so a late one can't stop the worker's next task
      const cancel = () => worker.postMessage({ cancel: job.id })
      job.signal?.addEventListener('abort', cancel, { once: true })
      const done = (fn: () => void) => {
        job.signal?.removeEventListener('abort', cancel)
        worker.off('message', onMessage)
        worker.off('error', onError)
        fn()
        if (!closed) idle.push(worker)
        dispatch()
      }
      const onMessage = (m: { ok: boolean; value?: unknown; error?: string }) =>
        done(() => (m.ok ? job.resolve(m.value) : job.reject(new Error(m.error))))
      const onError = (e: Error) => {
        job.signal?.removeEventListener('abort', cancel)
        all.delete(worker)
        worker.off('message', onMessage)
        job.reject(e)
        dispatch()
      }
      worker.on('message', onMessage)
      worker.once('error', onError)
      worker.postMessage({ id: job.id, ...job.task })
    }
  }

  return {
    run<T>(task: WorkerTask, options: { signal?: AbortSignal } = {}) {
      if (closed) return Promise.reject(new Error('The worker pool is closed.'))
      const { signal } = options
      if (signal?.aborted) return Promise.reject(aborted(signal))
      return new Promise<T>((resolve, reject) => {
        const job: Pending = {
          id: ++ids,
          task,
          signal,
          resolve: resolve as (v: unknown) => void,
          reject,
        }
        // still queued: it never starts
        signal?.addEventListener(
          'abort',
          () => {
            const at = queue.indexOf(job)
            if (at >= 0) {
              queue.splice(at, 1)
              reject(aborted(signal))
            }
          },
          { once: true },
        )
        queue.push(job)
        dispatch()
      })
    },
    async close() {
      closed = true
      for (const p of queue.splice(0)) p.reject(new Error('The worker pool is closed.'))
      await Promise.all([...all].map((w) => w.terminate()))
      all.clear()
      idle.length = 0
    },
  }
}
