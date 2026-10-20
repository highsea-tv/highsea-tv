// SPDX-License-Identifier: AGPL-3.0-only
// CPU-heavy work (subtitle alignment, piece hashing, image resizing) runs off the main thread in a
// small pool of worker threads. A task names a module and an exported function; its input and
// output must be structured-cloneable.
import { availableParallelism } from 'node:os'
import { Worker } from 'node:worker_threads'

export type WorkerTask = { module: string; fn: string; input: unknown }

type Pending = { task: WorkerTask; resolve: (v: unknown) => void; reject: (e: Error) => void }

const HOST = new URL('./worker-host.ts', import.meta.url)

export type WorkerPool = {
  run<T>(task: WorkerTask): Promise<T>
  close(): Promise<void>
}

export function createWorkerPool(
  size = Math.max(1, Math.min(4, availableParallelism() - 1)),
): WorkerPool {
  const idle: Worker[] = []
  const all = new Set<Worker>()
  const queue: Pending[] = []
  let closed = false

  const spawn = () => {
    const w = new Worker(HOST)
    all.add(w)
    return w
  }

  const dispatch = () => {
    while (queue.length && (idle.length || all.size < size)) {
      const job = queue.shift() as Pending
      const worker = idle.pop() ?? spawn()
      const done = (fn: () => void) => {
        worker.off('message', onMessage)
        worker.off('error', onError)
        fn()
        if (!closed) idle.push(worker)
        dispatch()
      }
      const onMessage = (m: { ok: boolean; value?: unknown; error?: string }) =>
        done(() => (m.ok ? job.resolve(m.value) : job.reject(new Error(m.error))))
      const onError = (e: Error) => {
        all.delete(worker)
        worker.off('message', onMessage)
        job.reject(e)
        dispatch()
      }
      worker.on('message', onMessage)
      worker.once('error', onError)
      worker.postMessage(job.task)
    }
  }

  return {
    run<T>(task: WorkerTask) {
      if (closed) return Promise.reject(new Error('The worker pool is closed.'))
      return new Promise<T>((resolve, reject) => {
        queue.push({ task, resolve: resolve as (v: unknown) => void, reject })
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
