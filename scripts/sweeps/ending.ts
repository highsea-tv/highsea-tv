// SPDX-License-Identifier: AGPL-3.0-only
// What a run started, stopped however it ends: a pass, a failure, a throw or Ctrl-C. A server or
// preview a sweep spawns doesn't end with it (https://nodejs.org/api/child_process.html#optionsdetached),
// and the prototypes' preview runs in a process group of its own, which Ctrl-C in the terminal
// doesn't reach; before this, a sweep that threw or was stopped left them running, and their
// folders in the temp folder.
//
// The steps run on the process's 'exit' event, which comes on every ending but a SIGKILL
// (https://nodejs.org/api/process.html#event-exit), so they must be synchronous. A listener for
// SIGINT, SIGTERM or SIGHUP replaces Node's default of exiting
// (https://nodejs.org/api/process.html#signal-events), so each exits here with 128 plus the
// signal's number, as the default would, and 'exit' runs the steps.
import { readdirSync, rmSync, statSync } from 'node:fs'
import { constants, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const steps = new Set<() => void>()
let listening = false

function runSteps() {
  for (const step of [...steps].reverse())
    try {
      step()
    } catch {
      // the next step still runs
    }
  steps.clear()
}

/** Runs `step` when this process ends, unless the returned function is called first. */
export function atExit(step: () => void): () => void {
  if (!listening) {
    listening = true
    process.on('exit', runSteps)
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
      process.on(signal, () => process.exit(128 + constants.signals[signal]))
  }
  steps.add(step)
  return () => {
    steps.delete(step)
  }
}

/**
 * A run's output the person is told to look at stays in the temp folder, but only the latest run's:
 * the earlier ones named `<prefix>XXXXXX` (mkdtemp's six characters) that finished, with `marker`
 * written, are removed. One still running has no marker yet and is left alone; one that stopped
 * early has none either, and `bun run clean` removes it once it's an hour old. `keep` names other
 * folders to leave, such as one the run compared itself with.
 */
export function keepLatestRun(prefix: string, out: string, marker: string, keep: string[] = []) {
  const base = tmpdir()
  const pattern = new RegExp(`^${prefix}[A-Za-z0-9]{6}$`)
  const removed: string[] = []
  for (const name of readdirSync(base)) {
    const dir = join(base, name)
    if (!pattern.test(name) || dir === out || keep.some((k) => resolve(k) === dir)) continue
    try {
      if (!statSync(join(dir, marker)).isFile()) continue
    } catch {
      continue
    }
    rmSync(dir, { recursive: true, force: true })
    removed.push(dir)
  }
  return removed
}
