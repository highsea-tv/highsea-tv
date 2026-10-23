// SPDX-License-Identifier: AGPL-3.0-only
// Reads definition files from a directory: the catalog's sources at build time, and
// `/config/definitions` on a running server. YAML or JSON; each file is validated, and a broken
// one is reported with its problems instead of stopping the rest.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Definition, formatIssues, validateDefinition } from '@highsea-tv/schemas/indexers'
import { parseDocument } from 'yaml'

export type LoadedFile<T = Definition> = { file: string; raw: unknown; definition: T }
export type BrokenFile = { file: string; message: string }

const DEFINITION_FILE = /\.(ya?ml|json)$/

/**
 * YAML 1.2's core schema (eemeli.org/yaml, Schemas): plain data only. A warning, such as an unknown
 * tag, is an error here, so a file can't ask for anything but data.
 */
function readYaml(text: string): unknown {
  const doc = parseDocument(text, { schema: 'core', logLevel: 'silent' })
  const problem = doc.errors[0] ?? doc.warnings[0]
  if (problem) throw new Error(problem.message.split('\n')[0])
  return doc.toJS()
}

export function loadDefinitionFiles(dir: string): { loaded: LoadedFile[]; broken: BrokenFile[] } {
  return loadEntryFiles(dir, (raw) => {
    const result = validateDefinition(raw)
    return result.ok
      ? { ok: true, value: result.definition }
      : { ok: false, message: formatIssues(result.errors) }
  })
}

/** Checks one entry: its parsed value, or every problem on one line each. */
export type EntryValidator<T> = (
  raw: unknown,
) => { ok: true; value: T } | { ok: false; message: string }

/** The same for any kind whose entries carry an `id` (the VPN providers, ADR 0042). */
export function loadEntryFiles<T extends { id: string }>(
  dir: string,
  validate: EntryValidator<T>,
): { loaded: LoadedFile<T>[]; broken: BrokenFile[] } {
  const loaded: LoadedFile<T>[] = []
  const broken: BrokenFile[] = []
  if (!existsSync(dir)) return { loaded, broken }
  for (const file of readdirSync(dir)
    .filter((f) => DEFINITION_FILE.test(f))
    .sort()) {
    let raw: unknown
    try {
      const text = readFileSync(join(dir, file), 'utf8')
      raw = file.endsWith('.json') ? JSON.parse(text) : readYaml(text)
    } catch (e) {
      broken.push({ file, message: `Couldn’t read it: ${(e as Error).message}` })
      continue
    }
    const result = validate(raw)
    if (result.ok) loaded.push({ file, raw, definition: result.value })
    else broken.push({ file, message: result.message })
  }
  const ids = new Map<string, string>()
  for (const l of loaded) {
    const other = ids.get(l.definition.id)
    if (other)
      broken.push({ file: l.file, message: `id "${l.definition.id}" is also used by ${other}.` })
    ids.set(l.definition.id, l.file)
  }
  return { loaded: loaded.filter((l) => ids.get(l.definition.id) === l.file), broken }
}
