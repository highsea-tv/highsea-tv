// SPDX-License-Identifier: AGPL-3.0-only
// axe-core over every component and overlay. Contrast is left to the token tests, which check every
// theme's pairs exactly; happy-dom has no layout, so axe can't compute it here anyway.
import './dom.ts'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render } from '@testing-library/react'
import { UIProvider } from '../src/index.ts'
import { KitchenSink, overlays } from './fixtures.tsx'

// axe reads `window` when it loads; as CommonJS it would load before ./dom.ts registers one
const { default: axe } = await import('axe-core')

afterEach(() => cleanup())

async function violations(): Promise<string[]> {
  // A modal hides everything behind it (Radix's `hideOthers`, which marks what it hides with
  // `data-aria-hidden`) while its focus trap holds focus. In a browser axe sees the open modal
  // and leaves that background for review; without layout here it can't, so it's left out.
  const context = { include: [document.body], exclude: [['[data-aria-hidden]']] }
  const result = await axe.run(context, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
    rules: { 'color-contrast': { enabled: false } },
  })
  return result.violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim()}`,
    ),
  )
}

describe('accessibility', () => {
  test('the audit catches real problems in this DOM', async () => {
    render(
      <div>
        {/* biome-ignore lint/a11y/useAltText: the audit must catch this */}
        <img src="/x.jpg" />
        <button type="button" />
        <input />
      </div>,
    )
    const found = (await violations()).map((v) => v.split(':')[0])
    expect(found).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'label']))
  })

  test('every component, full sidebar', async () => {
    render(<KitchenSink />)
    expect(await violations()).toEqual([])
  })

  test('every component, rail sidebar', async () => {
    render(<KitchenSink rail />)
    expect(await violations()).toEqual([])
  })

  for (const [name, Overlay] of Object.entries(overlays)) {
    test(`overlay: ${name}`, async () => {
      render(
        <UIProvider toaster={false}>
          <Overlay />
        </UIProvider>,
      )
      await act(async () => {})
      expect(await violations()).toEqual([])
    })
  }
})
