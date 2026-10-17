// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { createTheme, tailwindCss, themeCss, tokensCss } from '../src/index.ts'
import { nativeTokens } from '../src/native.ts'

const read = (path: string) => Bun.file(new URL(`../generated/${path}`, import.meta.url)).text()

test('generated files are up to date', async () => {
  expect(await read('tokens.css')).toBe(tokensCss())
  expect(await read('tailwind.css')).toBe(tailwindCss())
})

describe('Tailwind theme', async () => {
  const base = fileURLToPath(new URL('..', import.meta.url))
  const compiler = await compile('@import "tailwindcss";\n@import "./generated/tailwind.css";', {
    base,
    onDependency: () => {},
  })
  const build = (...candidates: string[]) => compiler.build(candidates)

  test.each([
    ['bg-s1', /background-color: var\(--color-s1\)/],
    ['text-text-2', /color: var\(--color-text-2\)/],
    ['bg-accent-fill', /var\(--color-accent-fill\)/],
    ['text-title', /font-size: var\(--text-title\)/],
    ['rounded-md', /border-radius: var\(--radius-md\)/],
    ['shadow-3', /--tw-shadow: 0px 20px 40px -20px/],
    ['ease-spring', /--tw-ease: var\(--ease-spring\)/],
    ['backdrop-blur-bar', /blur\(var\(--blur-bar\)\)/],
    ['aspect-poster', /aspect-ratio: var\(--aspect-poster\)/],
    ['p-3', /padding: calc\(var\(--spacing\) \* 3\)/],
    ['font-semibold', /font-weight: var\(--font-weight-semibold\)/],
    ['medium:p-4', /@media \(width >= 37\.5rem\)/],
  ])('%s produces a utility', (candidate, expected) => {
    expect(build(candidate)).toMatch(expected)
  })

  test.each([
    'bg-blue-500',
    'text-white',
    'font-bold',
    'rounded-2xl',
    'shadow-lg',
    'md:p-4',
    'animate-pulse',
  ])('%s does not exist: only highsea roles and scales do', (candidate) => {
    expect(build(candidate)).not.toContain(`.${candidate.replace(':', '\\:')}`)
  })
})

test('custom themes produce a complete block', () => {
  const css = themeCss(createTheme({ id: 'harbor', accent: '#8fbfb7' }).theme)
  expect(css).toStartWith('[data-theme="harbor"] {')
  expect(css).toContain('--color-accent: #8fbfb7;')
  expect(css).toContain('--color-badge-danger-bg:')
  expect(css).toContain('--tv-focus-shadow:')
})

test('native tokens use RN-safe colors', () => {
  for (const theme of Object.values(nativeTokens.themes))
    for (const value of Object.values(theme.colors))
      expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
  expect(nativeTokens.themes.default.colors.line).toBe('#ffffff12')
})
