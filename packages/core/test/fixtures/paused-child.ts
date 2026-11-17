// SPDX-License-Identifier: AGPL-3.0-only
// Starts a child, pauses it as the transcode runner does (SIGSTOP), prints its pid and ends without
// stopping it. With `held`, the child is handed to endWithProcess first.
import { spawn } from 'node:child_process'
import { endWithProcess } from '../../src/children.ts'

const child = spawn('sleep', ['30'], { stdio: 'ignore' })
child.kill('SIGSTOP')
if (process.argv[2] === 'held') endWithProcess(child)
child.unref()
console.log(child.pid)
