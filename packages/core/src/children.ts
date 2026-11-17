// SPDX-License-Identifier: AGPL-3.0-only
// Child processes that end with this one. A child doesn't end when its parent does
// (https://nodejs.org/api/child_process.html#optionsdetached: on non-Windows platforms it may keep
// running), and a transcode the runner has paused with SIGSTOP holds every other signal but SIGKILL
// until it's continued (POSIX signal concepts: a stopped process's pending SIGTERM waits for
// SIGCONT). So a process that ends without closing its transcodes, a test that fails before its
// `close()` or a server that throws, would leave a stopped ffmpeg and its folder behind for good.
// The process's 'exit' event runs on every ending but a SIGKILL of its own
// (https://nodejs.org/api/process.html#event-exit), and its listeners must be synchronous: kill() is.
import type { ChildProcess } from 'node:child_process'

const held = new Set<ChildProcess>()
let listening = false

function killAll() {
  for (const child of held)
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  held.clear()
}

/** Kills `child` when this process exits, if it's still running then. Returns `child`. */
export function endWithProcess<T extends ChildProcess>(child: T): T {
  if (!listening) {
    listening = true
    process.on('exit', killAll)
  }
  if (child.exitCode !== null || child.signalCode !== null) return child
  held.add(child)
  child.once('exit', () => held.delete(child))
  return child
}
