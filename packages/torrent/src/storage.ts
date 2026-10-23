// SPDX-License-Identifier: AGPL-3.0-only
// File storage: pieces mapped onto the torrent's files under the save folder. Files are created
// sparse at their full size, so resume can check their sizes. A skipped file is never created: the
// parts of its boundary pieces that fall inside it go to a `.parts` file beside the data, as
// qBittorrent keeps them, and move into the file if it's wanted later.

import type { FileHandle } from 'node:fs/promises'
import { mkdir, open, readdir, rm, rmdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import type { Metainfo } from './metainfo.ts'
import { pieceSize } from './metainfo.ts'

export type Priority = 'skip' | 'normal' | 'high'

type Span = { file: number; fileOffset: number; length: number; at: number }

export type Storage = ReturnType<typeof createStorage>

export function createStorage(options: {
  savePath: string
  metainfo: Metainfo
  priorities: () => readonly Priority[]
}) {
  const { metainfo: m } = options
  const root = resolve(options.savePath)
  const handles = new Map<string, Promise<FileHandle>>()
  const partsPath = join(root, `.${m.infoHash}.parts`)

  const pathOf = (file: number) => {
    const f = m.files[file]
    if (!f) throw new Error(`No file ${file}.`)
    const full = resolve(root, ...f.path.split('/'))
    // metainfo.ts already made every component safe; this is the second lock on the door
    if (full !== root && !full.startsWith(root + sep)) throw new Error(`${f.path} is outside.`)
    return full
  }

  /** The byte ranges of a block, per file. */
  const spans = (piece: number, offset: number, length: number): Span[] => {
    const start = piece * m.pieceLength + offset
    const end = start + length
    const out: Span[] = []
    for (let i = 0; i < m.files.length; i++) {
      const f = m.files[i] as Metainfo['files'][number]
      const fEnd = f.offset + f.length
      if (fEnd <= start || f.offset >= end || f.length === 0) continue
      const from = Math.max(start, f.offset)
      const to = Math.min(end, fEnd)
      out.push({ file: i, fileOffset: from - f.offset, length: to - from, at: from - start })
    }
    return out
  }

  const handle = (path: string, size: number | null) => {
    let h = handles.get(path)
    if (!h) {
      h = (async () => {
        try {
          return await open(path, 'r+')
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
          await mkdir(dirname(path), { recursive: true })
          const created = await open(path, 'w+')
          if (size !== null && size > 0) await created.truncate(size)
          return created
        }
      })()
      handles.set(path, h)
      h.catch(() => handles.delete(path))
    }
    return h
  }

  /** Where a span lives: its file, or the parts file at the span's offset in the whole torrent. */
  const target = (s: Span) => {
    const skipped = options.priorities()[s.file] === 'skip'
    const f = m.files[s.file] as Metainfo['files'][number]
    return skipped
      ? { path: partsPath, position: f.offset + s.fileOffset, size: null }
      : { path: pathOf(s.file), position: s.fileOffset, size: f.length }
  }

  const storage = {
    root,
    pathOf,
    spans,

    async write(piece: number, data: Uint8Array) {
      for (const s of spans(piece, 0, data.length)) {
        const t = target(s)
        const h = await handle(t.path, t.size)
        await h.write(data, s.at, s.length, t.position)
      }
    },

    async read(piece: number, offset: number, length: number): Promise<Uint8Array> {
      const out = new Uint8Array(length)
      for (const s of spans(piece, offset, length)) {
        const t = target(s)
        const h = await handle(t.path, t.size)
        const { bytesRead } = await h.read(out, s.at, s.length, t.position)
        if (bytesRead !== s.length) throw new Error('The file is shorter than the torrent says.')
      }
      return out
    },

    readPiece: (piece: number) => storage.read(piece, 0, pieceSize(m, piece)),

    /** Whether the data for a piece can be read at all: its files exist and are long enough. */
    async readable(piece: number): Promise<boolean> {
      for (const s of spans(piece, 0, pieceSize(m, piece))) {
        const t = target(s)
        try {
          const st = await stat(t.path)
          if (st.size < t.position + s.length) return false
        } catch {
          return false
        }
      }
      return true
    },

    /**
     * A skipped file became wanted: what the parts file holds for it moves into it. `have` says
     * which pieces were verified.
     */
    async unskip(file: number, have: (piece: number) => boolean) {
      const f = m.files[file]
      if (!f || f.length === 0) return
      const first = Math.floor(f.offset / m.pieceLength)
      const last = Math.floor((f.offset + f.length - 1) / m.pieceLength)
      const parts = await stat(partsPath).catch(() => null)
      if (!parts) return
      const ph = await handle(partsPath, null)
      const fh = await handle(pathOf(file), f.length)
      for (let p = first; p <= last; p++) {
        if (!have(p)) continue
        for (const s of spans(p, 0, pieceSize(m, p))) {
          if (s.file !== file) continue
          const buf = new Uint8Array(s.length)
          await ph.read(buf, 0, s.length, f.offset + s.fileOffset)
          await fh.write(buf, 0, s.length, s.fileOffset)
        }
      }
    },

    /** Each file's size and modification time, for resume. Missing files are null. */
    async fileStats(): Promise<({ size: number; mtimeMs: number } | null)[]> {
      return Promise.all(
        m.files.map(async (_, i) => {
          try {
            const st = await stat(pathOf(i))
            return { size: st.size, mtimeMs: Math.floor(st.mtimeMs) }
          } catch {
            return null
          }
        }),
      )
    },

    /** Flushes and closes every open file. */
    async close() {
      const all = [...handles.values()]
      handles.clear()
      await Promise.all(
        all.map(async (h) => {
          try {
            const fh = await h
            await fh.sync().catch(() => {})
            await fh.close()
          } catch {
            // never opened
          }
        }),
      )
    },

    /** Deletes the torrent's files and the parts file, then the folders they leave empty. */
    async remove() {
      await storage.close()
      const dirs = new Set<string>()
      for (let i = 0; i < m.files.length; i++) {
        const p = pathOf(i)
        await rm(p, { force: true })
        let d = dirname(p)
        while (d !== root && d.startsWith(root + sep)) {
          dirs.add(d)
          d = dirname(d)
        }
      }
      await rm(partsPath, { force: true })
      // deepest first, and only when empty: the owner's own files are never touched
      for (const d of [...dirs].sort((a, b) => relative(root, b).length - relative(root, a).length))
        if ((await readdir(d).catch(() => ['x'])).length === 0) await rmdir(d).catch(() => {})
    },
  }
  return storage
}
