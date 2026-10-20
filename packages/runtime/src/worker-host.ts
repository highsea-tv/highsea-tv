// SPDX-License-Identifier: AGPL-3.0-only
// Runs inside a worker thread: imports the task's module, calls its function, posts the result.
import { parentPort } from 'node:worker_threads'

parentPort?.on('message', async (task: { module: string; fn: string; input: unknown }) => {
  try {
    const mod = (await import(task.module)) as Record<string, (input: unknown) => unknown>
    const fn = mod[task.fn]
    if (typeof fn !== 'function') throw new Error(`${task.module} has no function ${task.fn}.`)
    parentPort?.postMessage({ ok: true, value: await fn(task.input) })
  } catch (e) {
    parentPort?.postMessage({ ok: false, error: (e as Error).message })
  }
})
