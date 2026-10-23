// SPDX-License-Identifier: AGPL-3.0-only
// Runs inside a worker thread: imports the task's module, calls its function with the input and a
// signal, posts the result. A `{ cancel: id }` message aborts that task's signal.
import { parentPort } from 'node:worker_threads'

type Task = { id: number; module: string; fn: string; input: unknown }
type Fn = (input: unknown, context: { signal: AbortSignal }) => unknown

let current: { id: number; controller: AbortController } | null = null

parentPort?.on('message', async (message: Task | { cancel: number }) => {
  if ('cancel' in message) {
    if (current?.id === message.cancel)
      current.controller.abort(new Error('The task was cancelled.'))
    return
  }
  const controller = new AbortController()
  current = { id: message.id, controller }
  try {
    const mod = (await import(message.module)) as Record<string, Fn>
    const fn = mod[message.fn]
    if (typeof fn !== 'function')
      throw new Error(`${message.module} has no function ${message.fn}.`)
    const value = await fn(message.input, { signal: controller.signal })
    current = null
    parentPort?.postMessage({ ok: true, value })
  } catch (e) {
    current = null
    parentPort?.postMessage({ ok: false, error: (e as Error).message })
  }
})
