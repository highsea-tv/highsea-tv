// SPDX-License-Identifier: AGPL-3.0-only
// The status bar's numbers (CPU, memory, disks) from node:os and node:fs, the last minute of them
// for System › Status (8b), and the health checks behind the server card's dot.
import { statfsSync, statSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { resolve } from 'node:path'

export type Disk = { path: string; label: string; free: number; total: number; usedBy: DiskUse }

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

export type Resources = {
  /** Percent of every core, the last minute's average. */
  cpu: number
  memory: { used: number; total: number }
  /** highsea's own share: percent of every core, and its resident memory in bytes. */
  process: { cpu: number; memory: number }
}

/**
 * CPU and memory over the last minute for System › Status: a reading every 10 seconds from
 * `os.cpus()`, `process.cpuUsage()` and `process.memoryUsage.rss()` (Node's docs), six kept.
 */
export function createResourceMonitor(everyMs = 10_000, keep = 6) {
  const meter = createCpuMeter()
  let lastUsage = process.cpuUsage()
  let lastAt = performance.now()
  const samples: { cpu: number; processCpu: number; used: number; rss: number }[] = []
  let timer: ReturnType<typeof setInterval> | null = null

  function read() {
    const usage = process.cpuUsage(lastUsage)
    const at = performance.now()
    const elapsedUs = (at - lastAt) * 1000
    lastUsage = process.cpuUsage()
    lastAt = at
    const processCpu =
      elapsedUs > 0
        ? ((usage.user + usage.system) / elapsedUs / Math.max(1, cpus().length)) * 100
        : 0
    samples.push({ cpu: meter(), processCpu, used: memory().used, rss: process.memoryUsage.rss() })
    if (samples.length > keep) samples.shift()
  }

  const average = (pick: (s: (typeof samples)[number]) => number) =>
    samples.reduce((n, s) => n + pick(s), 0) / samples.length

  return {
    start() {
      timer ??= setInterval(read, everyMs)
      timer.unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
    },
    now(): Resources {
      if (!samples.length) read()
      const round = (n: number) => Math.round(n * 10) / 10
      return {
        cpu: round(average((s) => s.cpu)),
        memory: { used: Math.round(average((s) => s.used)), total: totalmem() },
        process: {
          cpu: round(average((s) => s.processCpu)),
          memory: Math.round(average((s) => s.rss)),
        },
      }
    },
  }
}

export function memory() {
  const total = totalmem()
  return { used: total - freemem(), total }
}

/** What uses a disk, in bytes: the library's files, downloads, and everything else. */
export type DiskUse = { movies: number; downloads: number; other: number }

/**
 * Free and total space where the config, the media and the downloads live, one entry per
 * filesystem (by `stat`'s device), with what highsea knows uses each: `movies` and `downloads` are
 * attributed to the disk their folder is on, and `other` is the rest of what's used.
 */
export function disks(
  paths: { label: string; path: string; movies?: number; downloads?: number }[],
): Disk[] {
  const out = new Map<number, Disk & { used: number }>()
  for (const { label, path, movies = 0, downloads = 0 } of paths) {
    try {
      const dev = statSync(path).dev
      let disk = out.get(dev)
      if (!disk) {
        const s = statfsSync(path)
        const free = s.bavail * s.bsize
        const total = s.blocks * s.bsize
        disk = {
          path: resolve(path),
          label,
          free,
          total,
          used: Math.max(0, total - free),
          usedBy: { movies: 0, downloads: 0, other: 0 },
        }
        out.set(dev, disk)
      }
      disk.usedBy.movies += movies
      disk.usedBy.downloads += downloads
    } catch {
      // not there yet: setup makes it
    }
  }
  return [...out.values()].map(({ used, ...d }) => ({
    ...d,
    usedBy: { ...d.usedBy, other: Math.max(0, used - d.usedBy.movies - d.usedBy.downloads) },
  }))
}

export type HealthIssue = {
  id: string
  source: string
  level: 'ok' | 'notice' | 'warning' | 'error'
  message: string
  since: number
}
