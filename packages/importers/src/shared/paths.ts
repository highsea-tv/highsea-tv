// SPDX-License-Identifier: AGPL-3.0-only
// Path mappings (ADR 0041): when Radarr or qBittorrent ran in another container, the paths they
// report are theirs (`/movies/Sintel (2010)`), not highsea's (`/data/media/movies/Sintel (2010)`).
// The owner gives pairs, as Radarr's own Remote Path Mappings do
// (https://wiki.servarr.com/radarr/settings#remote-path-mappings): the longest `from` that the path
// starts with, on a folder boundary, is replaced by its `to`. A path no mapping covers is used as
// it is. Paths are POSIX: highsea runs on Linux, and so do the containers it replaces.
import { posix } from 'node:path'
import { z } from 'zod'

export const pathMappingSchema = z.object({
  from: z.string().trim().min(1).max(4096),
  to: z.string().trim().min(1).max(4096),
})

export type PathMapping = z.infer<typeof pathMappingSchema>

/** `/movies/` and `/movies` are one folder; `\` from a Windows host becomes `/`. */
const tidy = (p: string) => {
  const s = posix.normalize(p.trim().replaceAll('\\', '/'))
  return s.length > 1 && s.endsWith('/') ? s.slice(0, -1) : s
}

/** Whether `path` is `folder` or inside it. */
export const within = (folder: string, path: string) =>
  path === folder || path.startsWith(folder === '/' ? '/' : `${folder}/`)

/** `path` through the mappings: the longest matching `from` wins. */
export function mapPath(path: string, mappings: readonly PathMapping[]): string {
  const p = tidy(path)
  let best: { from: string; to: string } | null = null
  for (const m of mappings) {
    const from = tidy(m.from)
    if (within(from, p) && (!best || from.length > best.from.length))
      best = { from, to: tidy(m.to) }
  }
  if (!best) return p
  const rest = p.slice(best.from.length).replace(/^\//, '')
  return rest ? posix.join(best.to, rest) : best.to
}
