// SPDX-License-Identifier: AGPL-3.0-only
import { expect, test } from 'bun:test'
import { join } from 'node:path'

const fixture = join(import.meta.dir, 'fixtures/paused-child.ts')

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Runs the fixture to its end and returns the child it left, once it has had time to go. */
async function leftBehind(held: boolean) {
  const run = Bun.spawnSync([process.execPath, fixture, ...(held ? ['held'] : [])])
  const pid = Number(run.stdout.toString().trim())
  expect(pid).toBeGreaterThan(0)
  for (let i = 0; i < 20 && alive(pid); i++) await Bun.sleep(50)
  return pid
}

test('a paused child outlives the process that started it', async () => {
  const pid = await leftBehind(false)
  try {
    expect(alive(pid)).toBe(true)
  } finally {
    if (alive(pid)) process.kill(pid, 'SIGKILL')
  }
})

test('endWithProcess kills a paused child when its process ends', async () => {
  const pid = await leftBehind(true)
  const survived = alive(pid)
  if (survived) process.kill(pid, 'SIGKILL')
  expect(survived).toBe(false)
})
