// SPDX-License-Identifier: AGPL-3.0-only
// Every story renders with the real preview (decorators, globals) and passes axe. The browser
// addon runs the same checks per story; this keeps them in CI. Contrast is left to the token
// tests, which check every theme's pairs exactly; happy-dom has no layout to compute it.
// Every class a story renders must also be a real utility: Tailwind silently drops unknown ones
// (`aspect-video` after the theme reset), and without layout nothing else here would notice.
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { composeStories, setProjectAnnotations } from '@storybook/react-vite'
import { compile } from '@tailwindcss/node'
import { act, cleanup, render } from '@testing-library/react'
import type { ComponentType } from 'react'
import * as preview from '../.storybook/preview.tsx'

// axe reads `window` when it loads; as CommonJS it would load before ./dom.ts registers one
const { default: axe } = await import('axe-core')

setProjectAnnotations(preview)
afterEach(() => cleanup())

const files = [
  ...new Bun.Glob('**/*.stories.tsx').scanSync(new URL('../src', import.meta.url).pathname),
]

/** Classes with no CSS of their own: named groups, and Lucide's identifying classes. */
const MARKERS = /^(group\/[\w-]+|lucide(-[\w-]+)?)$/
const classes = new Set<string>()

function collect() {
  for (const el of document.querySelectorAll('[class]'))
    for (const c of (el.getAttribute('class') ?? '').split(/\s+/))
      if (c && !MARKERS.test(c)) classes.add(c)
}

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  return result.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim()}`,
    ),
  )
}

test('finds the stories', () => {
  expect(files.length).toBeGreaterThan(10)
})

for (const file of files.sort()) {
  // composed stories are components, though the dynamic import leaves their type unknown
  const stories = composeStories(await import(`../src/${file}`)) as Record<string, ComponentType>
  describe(file, () => {
    for (const [name, Story] of Object.entries(stories)) {
      test(name, async () => {
        let container: HTMLElement | undefined
        await act(async () => {
          container = render(<Story />).container
        })
        expect(container?.childElementCount).toBeGreaterThan(0)
        collect()
        expect(await violations()).toEqual([])
      })
    }
  })
}

describe('stylesheet', () => {
  test('every class the stories render is a real utility', async () => {
    const path = new URL('../src/storybook.css', import.meta.url).pathname
    const compiler = await compile(readFileSync(path, 'utf8'), {
      base: new URL('../src', import.meta.url).pathname,
      onDependency() {},
    })
    expect(classes.size).toBeGreaterThan(300)
    let previous = compiler.build([]).length
    const unknown: string[] = []
    for (const c of classes) {
      const next = compiler.build([c]).length
      if (next === previous) unknown.push(c)
      previous = next
    }
    expect(unknown).toEqual([])
  })
})
