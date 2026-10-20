// SPDX-License-Identifier: AGPL-3.0-only
// Exercises the worker pool under Node, the server's runtime, and prints what happened as JSON.
// The pool runs in production on Node; Bun documents its worker_threads as implemented but "not
// battle-tested", with known gaps (bun.com/docs/runtime/nodejs-compat), so the pool's behavior
// is asserted on Node.
import { createWorkerPool } from '../../src/workers.ts'

const pool = createWorkerPool(2)
const module = new URL('./double.ts', import.meta.url).href
const failure = (fn: string) =>
  pool.run({ module, fn, input: null }).then(
    () => '',
    (e: Error) => e.message,
  )
const results = await Promise.all(
  [1, 2, 3, 4].map((n) => pool.run<number>({ module, fn: 'double', input: n })),
)
const errors = [await failure('fail'), await failure('fail'), await failure('missing')]
const after = await pool.run<number>({ module, fn: 'double', input: 5 })
await pool.close()
console.log(JSON.stringify({ results, errors, after }))
