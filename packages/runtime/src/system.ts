// SPDX-License-Identifier: AGPL-3.0-only
// The status bar's numbers (CPU, memory, disks) from node:os and node:fs, and the health checks
// behind the server card's dot.
import { statfsSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { resolve } from 'node:path'

export type Disk = { path: string; label: string; free: number; total: number }

/** CPU use across all cores since the previous call (os.cpus() times are cumulative). */
export function createCpuMeter() {
  const sample = () =>
    cpus().reduce(
      (acc, c) => {
        const { user, nice, sys, irq, idle } = c.times
        acc.busy += user + nice + sys + irq
        acc.total += user + nice + sys + irq + idle
        return acc
      },
      { busy: 0, total: 0 },
    )
  let last = sample()
  return () => {
    const now = sample()
    const total = now.total - last.total
    const busy = now.busy - last.busy
    last = now
    return total > 0 ? Math.round((busy / total) * 100) : 0
  }
}

export function memory() {
  const total = totalmem()
  return { used: total - freemem(), total }
}

/** Free and total space where the config and the media live (one entry if they share a disk). */
export function disks(paths: { label: string; path: string }[]): Disk[] {
  const out: (Disk & { id: string })[] = []
  for (const { label, path } of paths) {
    try {
      const s = statfsSync(path)
      const id = `${s.type}:${s.blocks}:${s.bsize}`
      if (out.some((d) => d.id === id)) continue
      out.push({
        id,
        path: resolve(path),
        label,
        free: s.bavail * s.bsize,
        total: s.blocks * s.bsize,
      })
    } catch {
      // not there yet: setup makes it
    }
  }
  return out.map(({ id: _, ...d }) => d)
}

export type HealthIssue = {
  id: string
  source: string
  level: 'ok' | 'notice' | 'warning' | 'error'
  message: string
  since: number
}
