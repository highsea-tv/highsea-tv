// SPDX-License-Identifier: AGPL-3.0-only
// The player's two engines behind one hook (one-client-platform.md › A, question 6): expo-video
// in ../src/playback.ts and the `<video>` with hls.js in ../src/playback.web.ts. One player screen
// sits on both, so they export the same names and their `usePlayback` hands the screen the same
// ones, `PlaybackApi`'s. TypeScript holds the types (each hook is a `UsePlayback<its player>`, so
// its object literal can't add or miss a name); this holds the same from the code without running
// or compiling it, since the native side needs a phone, and says which name drifted.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dir, '../src')
const code = (name: string) => readFileSync(join(SRC, name), 'utf8')
const transpiler = new Bun.Transpiler({ loader: 'tsx' })
const exportsOf = (name: string) => transpiler.scan(code(name)).exports.sort()

/**
 * The names at the top level of the `{ … }` that starts at `from`: an object literal's, after each
 * comma, or a type literal's, one a line (`sep`).
 */
function keysOf(text: string, from: number, sep = ','): string[] {
  const keys: string[] = []
  let depth = 0
  let i = from
  let atKey = false
  while (i < text.length) {
    const ch = text[i] as string
    const rest = text.slice(i)
    if (rest.startsWith('//')) i = text.indexOf('\n', i)
    else if (rest.startsWith('/*')) i = text.indexOf('*/', i) + 1
    else if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1
      while (text[j] !== ch) j += text[j] === '\\' ? 2 : 1
      i = j
    } else if ('({['.includes(ch)) {
      depth++
      if (depth === 1) atKey = true
    } else if (')}]'.includes(ch)) {
      depth--
      if (depth === 0) return keys
    } else if (depth === 1 && ch === sep) atKey = true
    else if (depth === 1 && atKey && /[A-Za-z_$]/.test(ch)) {
      const name = /^[A-Za-z_$][\w$]*/.exec(rest)?.[0] ?? ''
      keys.push(name)
      i += name.length - 1
      atKey = false
    }
    i++
  }
  return keys
}

/** The keys of the object `usePlayback` returns: its last `return {` in the file. */
function returned(name: string) {
  const text = code(name)
  const hook = text.indexOf('export const usePlayback')
  const at = text.lastIndexOf('\n  return {', text.indexOf('\nexport type Playback', hook))
  expect(hook).toBeGreaterThan(-1)
  expect(at).toBeGreaterThan(hook)
  return keysOf(text, text.indexOf('{', at)).sort()
}

/** The names `PlaybackApi` declares. */
function api() {
  const text = code('playback-shared.ts')
  const at = text.indexOf('export type PlaybackApi<Player> = {')
  return keysOf(text, text.indexOf('{', at), '\n').sort()
}

describe('the player’s engines', () => {
  test('export the same names', () => {
    expect(exportsOf('playback.web.ts')).toEqual(exportsOf('playback.ts'))
    expect(exportsOf('playback.ts')).toEqual(['TRANSCODE_LIMIT', 'usePlayback'])
  })

  test('hand the screen the same names, PlaybackApi’s', () => {
    const names = api()
    expect(names).toContain('player')
    expect(names).toContain('toggle')
    expect(returned('playback.ts')).toEqual(names)
    expect(returned('playback.web.ts')).toEqual(names)
  })

  test('the web’s loads hls.js only when a stream needs it', () => {
    // type-only imports are erased before the scan, as they are before any bundler sees them
    const hls = transpiler.scanImports(code('playback.web.ts')).filter((i) => i.path === 'hls.js')
    expect(hls.map((i) => i.kind)).toEqual(['dynamic-import'])
  })

  test('Metro takes the pair through the entry; TypeScript and Bun the web’s file', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf8'))
    expect(Object.entries(manifest.exports['./playback'])).toEqual([
      ['react-native', './src/playback-entry.ts'],
      ['default', './src/playback.web.ts'],
    ])
    expect(code('playback-entry.ts')).toContain("export * from './playback'\n")
  })
})
