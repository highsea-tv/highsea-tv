// SPDX-License-Identifier: AGPL-3.0-only
// Storybook's chrome is themed before any CSS loads, so .storybook/theme.ts hardcodes the default
// theme's values. This keeps them in step with @highsea/tokens.
import { describe, expect, test } from 'bun:test'
import { builtInThemes, composite, formatHex, parseColor } from '@highsea/tokens'
import { chrome } from '../.storybook/theme.ts'

const { colors } = builtInThemes.default

describe('chrome theme', () => {
  test('matches the default theme', () => {
    expect(chrome).toEqual({
      bg: colors.bg,
      s1: colors.s1,
      s2: colors.s2,
      s3: colors.s3,
      s4: colors.s4,
      line: formatHex(composite(parseColor(colors.s1), parseColor(colors.line))),
      text: colors.text,
      text2: colors['text-2'],
      text3: colors['text-3'],
      accent: colors.accent,
      onAccent: colors['on-accent'],
    })
  })

  test('the manager head styles the selected row with the same values', async () => {
    const head = await Bun.file(new URL('../.storybook/manager-head.html', import.meta.url)).text()
    for (const c of [chrome.s4, chrome.text, chrome.accent]) expect(head).toContain(c)
  })

  test('the preview head paints the default bg before the stylesheet loads', async () => {
    const head = await Bun.file(new URL('../.storybook/preview-head.html', import.meta.url)).text()
    expect(head).toContain(chrome.bg)
  })
})
