// SPDX-License-Identifier: AGPL-3.0-only
// Shared checks for screen tests: axe on the rendered document, and a record of every class
// rendered, so a test file can assert each one is a real utility. Tailwind silently drops unknown
// ones (`aspect-video` after the theme reset), and nothing else would notice.
import './dom.ts'
import { readFileSync } from 'node:fs'
import { compile } from '@tailwindcss/node'

// axe reads `window` when it loads; as CommonJS it would load before ./dom.ts registers one
const { default: axe } = await import('axe-core')

/** Classes with no CSS of their own: named groups, and Lucide's identifying classes. */
const MARKERS = /^(group\/[\w-]+|lucide(-[\w-]+)?)$/
export const classes = new Set<string>()

/** Records the classes in the document now. Call it in each state you render. */
export function collect() {
  for (const el of document.querySelectorAll('[class]'))
    for (const c of (el.getAttribute('class') ?? '').split(/\s+/))
      if (c && !MARKERS.test(c)) classes.add(c)
}

/**
 * axe violations, minus contrast: happy-dom has no layout to compute it (the token tests do).
 * While a modal is open, pass it: Radix hides the rest of the page with `aria-hidden` and traps
 * focus, which axe reads as focusable content inside hidden content. `iframes: false` leaves a
 * frame's document alone: axe can't reach into happy-dom's frames.
 */
export async function violations(
  context: Element = document.body,
  { iframes = true }: { iframes?: boolean } = {},
): Promise<string[]> {
  const result = await axe.run(context, {
    iframes,
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  return result.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim()}`,
    ),
  )
}

/** The collected classes that compile to nothing. */
export async function unknownClasses(): Promise<string[]> {
  const path = new URL('../src/prototypes.css', import.meta.url).pathname
  const compiler = await compile(readFileSync(path, 'utf8'), {
    base: new URL('../src', import.meta.url).pathname,
    onDependency() {},
  })
  let previous = compiler.build([]).length
  const unknown: string[] = []
  for (const c of classes) {
    const next = compiler.build([c]).length
    if (next === previous) unknown.push(c)
    previous = next
  }
  return unknown
}
