// SPDX-License-Identifier: AGPL-3.0-only
// Small calculations the library's admin screens share (checkpoint 4): quality sizes for a film,
// release days on the calendar, and which root folders sit on a disk. Plain functions, so they're
// tested without a DOM.
import type { RootFolder, SystemStatus } from '@highsea-tv/api-contract'

type Disk = SystemStatus['disks'][number]

/** Quality sizes are MiB per minute, as Radarr's are (the contract's `QualitySize`). */
export const MIB = 1024 * 1024

/** Bytes for `minutes` of runtime at `perMinute` MiB a minute: the table's "A 2-hour film". */
export const filmBytes = (perMinute: number, minutes = 120) => perMinute * minutes * MIB

/**
 * A release day (`YYYY-MM-DD`, a date without a time) as local midnight. `new Date('2026-10-24')`
 * reads it as UTC (ECMAScript's date-only forms are UTC), which is the day before west of
 * Greenwich.
 */
export function localDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** The titles releasing on each day of `month` (0–11) in `year`, by day of the month. */
export function releasesByDay(
  movies: readonly { title: string; releaseDate: string | null }[],
  year: number,
  month: number,
): Map<number, string[]> {
  const byDay = new Map<number, string[]>()
  for (const m of movies) {
    if (!m.releaseDate) continue
    const d = localDay(m.releaseDate)
    if (d.getFullYear() !== year || d.getMonth() !== month) continue
    byDay.set(d.getDate(), [...(byDay.get(d.getDate()) ?? []), m.title])
  }
  return byDay
}

/**
 * The root folders on a disk: Storage's "what uses it". System status names a disk by its path and
 * size, a root folder by its path, size and device, both read with statfs. A folder whose
 * filesystem answers is on the disk when the sizes (blocks × block size) agree, since a path under
 * the disk's can be another mount; one that can't be read now falls back to its path.
 */
export function foldersOnDisk(folders: readonly RootFolder[], disk: Disk): RootFolder[] {
  const base = disk.path.replace(/\/+$/, '')
  return folders.filter((f) =>
    f.total !== null ? f.total === disk.total : f.path === base || f.path.startsWith(`${base}/`),
  )
}
