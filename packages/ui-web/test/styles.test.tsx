// SPDX-License-Identifier: AGPL-3.0-only
// Every class the components render must exist in the token theme. Tailwind silently ignores
// unknown utilities (`bg-blue-500` after the theme reset, a typo in a variant), so this renders
// each component, collects its classes, and asks the compiler for each one.
import './dom.ts'
import { afterAll, describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compile } from '@tailwindcss/node'
import { cleanup, render } from '@testing-library/react'
import { UIProvider } from '../src/index.ts'
import { KitchenSink, overlays } from './fixtures.tsx'

const SRC = join(import.meta.dir, '../src')

/** Classes with no CSS of their own: named groups, and Lucide's identifying classes. */
const MARKERS = /^(group\/[\w-]+|lucide(-[\w-]+)?)$/

function collect(into: Set<string>) {
  for (const el of document.querySelectorAll('[class]'))
    for (const c of (el.getAttribute('class') ?? '').split(/\s+/)) if (c) into.add(c)
}

function sources(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((d) =>
      d.isDirectory()
        ? sources(join(dir, d.name))
        : /\.(tsx?|css)$/.test(d.name)
          ? readFileSync(join(dir, d.name), 'utf8')
          : '',
    )
    .join('\n')
}

const classes = new Set<string>()
render(<KitchenSink />)
collect(classes)
cleanup()
render(<KitchenSink rail />)
collect(classes)
cleanup()
for (const Overlay of Object.values(overlays)) {
  render(
    <UIProvider toaster={false}>
      <Overlay />
    </UIProvider>,
  )
  collect(classes)
  cleanup()
}

afterAll(() => cleanup())

describe('stylesheet', async () => {
  const css = readFileSync(join(SRC, 'styles.css'), 'utf8')
  const compiler = await compile(css, { base: SRC, onDependency() {}, shouldRewriteUrls: true })
  const utilities = [...classes].filter((c) => !MARKERS.test(c))

  test('renders a broad set of classes', () => {
    expect(utilities.length).toBeGreaterThan(300)
  })

  test('every rendered class is a real utility', () => {
    let previous = compiler.build([]).length
    const unknown: string[] = []
    for (const c of utilities) {
      const next = compiler.build([c]).length
      if (next === previous) unknown.push(c)
      previous = next
    }
    expect(unknown).toEqual([])
  })

  test('every rendered class appears literally in a source file, so app builds find it', () => {
    // the fixtures stand in for an app's own files
    const text = sources(SRC) + sources(import.meta.dir)
    expect(utilities.filter((c) => !text.includes(c))).toEqual([])
  })

  test('fonts resolve to the files @highsea/brand ships', () => {
    const out = compiler.build([])
    const urls = [...out.matchAll(/url\('?([^')]+)'?\)/g)].map((m) => m[1] as string)
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url).toMatch(/brand\/fonts\/Geist(Mono)?-Variable\.woff2$/)
  })

  test('the theme reset holds: Tailwind defaults are gone', () => {
    const before = compiler.build([]).length
    expect(compiler.build(['bg-blue-500', 'shadow-lg', 'md:flex', 'font-bold']).length).toBe(before)
  })
})
