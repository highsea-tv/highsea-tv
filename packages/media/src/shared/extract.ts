// SPDX-License-Identifier: AGPL-3.0-only
// Archive extraction (checkpoint 6, Importing › Archive extraction, 6b): `unar` from The
// Unarchiver's XADMaster (LGPL-2.1, Debian main), which reads RAR including RAR5 and multi-volume
// sets, 7z and zip. Not unRAR or anything built from it: its licence forbids recreating the RAR
// algorithm, and Debian ships it in non-free (ADR 0039).
//
// One child-process wrapper, as ffprobe has (ffprobe.ts): `execFile` with an argument array, never
// a shell, stdin closed and a timeout. The options are unar's own (unar.m in XADMaster:
// https://github.com/MacPaw/XADMaster/blob/master/unar.m):
// - `-o DIR` the output directory, `-D` never a containing folder, `-f` overwrite what a broken
//   earlier run left, `-q` quiet, so errors go to stderr and nothing else is printed;
// - without a terminal on stdin unar isn't interactive, so a password it needs isn't asked for: it
//   prints "This archive requires a password to unpack. Use the -p option to provide one." and
//   exits with 2 (`simpleUnarchiverNeedsPassword:`). highsea never passes a password.
// - given a set's first volume, XADMaster finds the rest itself.
//
// A download's archives are extracted into one folder beside it, `{download}.unpacked`, written as
// `….partial` and renamed when every archive is out, so a second run finds the folder and doesn't
// extract again (ADR 0022). The import removes it afterwards; the archives stay to seed.
import { execFile } from 'node:child_process'
import { promises as fsp } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'

/** unar's binary: `HIGHSEA_UNAR` when set, else `unar` on the PATH. */
export const unarBinary = (env: NodeJS.ProcessEnv = process.env) =>
  env.HIGHSEA_UNAR?.trim() || 'unar'

export const UNAR_ARGS = ['-q', '-f', '-D'] as const

export type ExtractFailure = 'missing' | 'password' | 'timeout' | 'failed'

/** Why an archive couldn't be extracted, in the owner's words, with unar's own when it gave one. */
export class ExtractError extends Error {
  readonly kind: ExtractFailure
  readonly detail: string
  constructor(kind: ExtractFailure, message: string, detail = '') {
    super(message)
    this.name = 'ExtractError'
    this.kind = kind
    this.detail = detail
  }
}

export const EXTRACT_MESSAGES = {
  missing:
    'unar isn’t installed, so archives can’t be extracted. Install unar, or set HIGHSEA_UNAR to its path.',
  password: 'The release is a password-protected archive.',
  timeout: 'unar took too long to extract the archive.',
  failed: 'unar couldn’t extract the archive. It may be damaged or incomplete.',
} as const satisfies Record<ExtractFailure, string>

/** Extracts one archive into a folder. */
export type Extract = (archive: string, into: string) => Promise<void>

export function createExtractor(options: { binary?: string; timeoutMs?: number } = {}): Extract {
  const binary = options.binary ?? unarBinary()
  // a full film in a RAR set on a slow disk: half an hour is generous and still ends
  const timeout = options.timeoutMs ?? 30 * 60_000
  return (archive, into) =>
    new Promise((resolve, reject) => {
      // an absolute path is never read as an option (`-…`), as ffprobe.ts says for ffprobe
      if (!isAbsolute(archive) || !isAbsolute(into)) {
        reject(new ExtractError('failed', 'Only a full path can be extracted.'))
        return
      }
      const child = execFile(
        binary,
        [...UNAR_ARGS, '-o', into, archive],
        { timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
        (error, _stdout, stderr) => {
          if (!error) return resolve()
          const e = error as Error & { killed?: boolean; code?: string | number }
          const detail = String(stderr ?? '').trim()
          if (e.code === 'ENOENT') reject(new ExtractError('missing', EXTRACT_MESSAGES.missing))
          else if (e.killed) reject(new ExtractError('timeout', EXTRACT_MESSAGES.timeout, detail))
          else if (e.code === 2 || /requires a password/i.test(detail))
            reject(new ExtractError('password', EXTRACT_MESSAGES.password, detail))
          else reject(new ExtractError('failed', EXTRACT_MESSAGES.failed, detail))
        },
      )
      // no terminal on stdin: unar never waits for a password or an overwrite prompt
      child.stdin?.end()
    })
}

/** Whether unar runs at all: anything but "not found" counts, as for ffprobe. */
export function unarAvailable(binary = unarBinary()): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(binary, ['-v'], { timeout: 10_000, windowsHide: true }, (error) => {
      resolve(!error || (error as NodeJS.ErrnoException).code !== 'ENOENT')
    })
    child.stdin?.end()
  })
}

/** `name.part2.rar`, `name.part02.rar`: a later volume of a RAR set, which unar reaches from the first. */
const LATER_PART = /\.part0*(?:[2-9]|[1-9]\d+)\.rar$/i
/** A 7z or zip set split by number: `name.7z.001` is the first. */
const SPLIT = /\.(?:7z|zip)\.(\d{3})$/i

/**
 * The archives to hand unar, in order: each RAR set's first volume (`.rar` or `.part1.rar`; the
 * old `.r00` volumes follow a `.rar`), `.7z` and `.zip`, and a split set's `.001`.
 */
export function archivesIn(paths: readonly string[]): string[] {
  return paths
    .filter((p) => {
      const name = basename(p).toLowerCase()
      const split = SPLIT.exec(name)
      if (split) return Number(split[1]) === 1
      const ext = extname(name)
      if (ext === '.rar') return !LATER_PART.test(name)
      return ext === '.7z' || ext === '.zip'
    })
    .sort()
}

/** Where a download's archives are extracted: a folder beside it. */
export function unpackedFolder(download: string): string {
  return join(dirname(download), `${basename(download)}.unpacked`)
}

const exists = (path: string) =>
  fsp.stat(path).then(
    () => true,
    () => false,
  )

/**
 * Extracts a download's archives into the folder beside it and returns that folder; null when
 * there's nothing to extract. Safe to repeat: a finished folder is used as it is, and a partial one
 * from an interrupted run is cleared and done again. A failure leaves nothing behind and throws an
 * ExtractError.
 */
export async function extractDownload(
  download: string,
  files: readonly string[],
  extract: Extract,
): Promise<string | null> {
  const archives = archivesIn(files)
  if (archives.length === 0) return null
  const done = unpackedFolder(download)
  if (await exists(done)) return done
  const partial = `${done}.partial`
  await fsp.rm(partial, { recursive: true, force: true })
  await fsp.mkdir(partial, { recursive: true })
  try {
    // each archive into its own folder, so two archives holding one name can't overwrite each other
    for (const [i, archive] of archives.entries()) {
      const into = archives.length === 1 ? partial : join(partial, String(i + 1))
      await fsp.mkdir(into, { recursive: true })
      await extract(archive, into)
    }
  } catch (e) {
    await fsp.rm(partial, { recursive: true, force: true })
    throw e
  }
  await fsp.rename(partial, done)
  return done
}

/** Removes the extracted copy after import; the archives stay to seed. */
export async function removeUnpacked(download: string): Promise<void> {
  await fsp.rm(unpackedFolder(download), { recursive: true, force: true })
}
