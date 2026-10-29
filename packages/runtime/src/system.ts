// SPDX-License-Identifier: AGPL-3.0-only
// The status bar's numbers (CPU, memory, disks) from node:os and node:fs, the last minute of them
// for System › Status (8b), and the health checks behind the server card's dot.
import {
  accessSync,
  constants,
  linkSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { join, resolve } from 'node:path'

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

/** Under this much free space a disk is all but full: downloads and imports stop soon (9c). */
export const LOW_SPACE_ERROR = 1024 ** 3
/** A disk with less than this share free, and less than LOW_SPACE_WARNING, is getting full (9c). */
export const LOW_SPACE_SHARE = 0.1
export const LOW_SPACE_WARNING = 100 * 1024 ** 3

/** The filesystem calls the folder checks make, injectable so a test can fill a disk. */
export type FolderFs = {
  statSync: (path: string) => { dev: number }
  statfsSync: (path: string) => { bavail: number; bsize: number; blocks: number }
  accessSync: (path: string, mode: number) => void
}

const gb = (n: number) => `${(n / 1e9).toFixed(n < 1e10 ? 1 : 0)} GB`

/**
 * The library's folders on System › Health (checkpoint 6's plan, System): a folder that's missing
 * or that highsea can't write to is an error, as Radarr's root folder and read-only mount checks
 * are (Radarr's RootFolderCheck and MountCheck); a disk that's getting full is a warning, and one
 * that's all but full an error. Each disk is reported once, under the first folder on it.
 */
export function folderIssues(
  folders: { label: string; path: string }[],
  fs: FolderFs = { statSync, statfsSync, accessSync },
): Omit<HealthIssue, 'source' | 'since'>[] {
  const out: Omit<HealthIssue, 'source' | 'since'>[] = []
  const seen = new Set<number>()
  for (const { label, path } of folders) {
    let dev: number
    try {
      dev = fs.statSync(path).dev
    } catch {
      out.push({
        id: `folder-missing:${path}`,
        level: 'error',
        message: `The ${label} folder ${path} isn’t there. If it’s on another drive or a share, check that it’s mounted and given to the container.`,
      })
      continue
    }
    try {
      fs.accessSync(path, constants.W_OK)
    } catch {
      out.push({
        id: `folder-read-only:${path}`,
        level: 'error',
        message: `highsea can’t write to the ${label} folder ${path}. Check that it isn’t mounted read-only, and that highsea’s user owns it: whoever owns /data, unless PUID and PGID choose another.`,
      })
    }
    if (seen.has(dev)) continue
    seen.add(dev)
    try {
      const s = fs.statfsSync(path)
      const free = s.bavail * s.bsize
      const total = s.blocks * s.bsize
      if (free < LOW_SPACE_ERROR)
        out.push({
          id: `disk-space:${path}`,
          level: 'error',
          message: `The disk that holds ${path} has only ${gb(free)} free. Downloads and imports stop when it’s full.`,
        })
      else if (total > 0 && free / total < LOW_SPACE_SHARE && free < LOW_SPACE_WARNING)
        out.push({
          id: `disk-space:${path}`,
          level: 'warning',
          message: `The disk that holds ${path} is ${Math.round((1 - free / total) * 100)}% full, with ${gb(free)} free.`,
        })
    } catch {
      // statfs isn't there on every filesystem; the folder's own checks above still ran
    }
  }
  return out
}

/** The calls the hardlink check makes, injectable so a test can refuse a link. */
export type LinkFs = {
  writeFileSync: (path: string, data: string) => void
  linkSync: (from: string, to: string) => void
  rmSync: (path: string, options: { force: true }) => void
}

/**
 * Whether imports from the downloads folder into each movies folder will hardlink (install-
 * simplicity.md › A): it makes a real link, since the same `st_dev` isn't proof (a FUSE union such
 * as Unraid's /mnt/user reports one device and may still refuse). `EXDEV` means another disk,
 * `EPERM`, `ENOTSUP` and `EOPNOTSUPP` a disk without hardlinks (link(2)). Any other failure (a
 * missing or read-only folder) is folderIssues' to report, so it's left out here.
 */
export function hardlinkIssues(
  downloads: string,
  roots: string[],
  fs: LinkFs = { writeFileSync, linkSync, rmSync },
): Omit<HealthIssue, 'source' | 'since'>[] {
  const out: Omit<HealthIssue, 'source' | 'since'>[] = []
  const name = `.highsea-link-check-${process.pid}`
  const from = join(downloads, name)
  try {
    fs.writeFileSync(from, '')
  } catch {
    return out
  }
  try {
    for (const root of roots) {
      const to = join(root, name)
      try {
        fs.linkSync(from, to)
        fs.rmSync(to, { force: true })
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code
        if (code === 'EXDEV')
          out.push({
            id: `copying:${root}`,
            level: 'warning',
            message: `Imports into ${root} will be copied, not hardlinked, because the downloads folder is on another disk. Each film takes its space twice while it seeds. Keep downloads and movies under one /data folder, on one disk.`,
          })
        else if (code === 'EPERM' || code === 'ENOTSUP' || code === 'EOPNOTSUPP')
          out.push({
            id: `copying:${root}`,
            level: 'warning',
            message: `Imports into ${root} will be copied, not hardlinked, because the disk doesn’t support hardlinks. Each film takes its space twice while it seeds.`,
          })
      }
    }
  } finally {
    fs.rmSync(from, { force: true })
  }
  return out
}
