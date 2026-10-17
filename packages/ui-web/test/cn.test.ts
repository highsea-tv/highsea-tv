// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, test } from 'bun:test'
import { cn } from '../src/lib/cn.ts'

describe('cn', () => {
  test('keeps a text size and a text color together', () => {
    expect(cn('text-title', 'text-text-2')).toBe('text-title text-text-2')
    expect(cn('text-text-2', 'text-caption')).toBe('text-text-2 text-caption')
    expect(cn('text-table-header text-text-3')).toBe('text-table-header text-text-3')
  })

  test('later utilities win within a group', () => {
    expect(cn('bg-s1', 'bg-s2')).toBe('bg-s2')
    expect(cn('text-title', 'text-body')).toBe('text-body')
    expect(cn('text-text', 'text-accent-text')).toBe('text-accent-text')
    expect(cn('rounded-sm', 'rounded-poster')).toBe('rounded-poster')
    expect(cn('shadow-2', 'shadow-4')).toBe('shadow-4')
    expect(cn('px-4', 'px-0')).toBe('px-0')
  })

  test('knows the token tracking, radius and aspect names', () => {
    expect(cn('tracking-display', 'tracking-eyebrow')).toBe('tracking-eyebrow')
    expect(cn('aspect-poster', 'aspect-still')).toBe('aspect-still')
    expect(cn('rounded-md', 'text-title')).toBe('rounded-md text-title')
  })

  test('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
})
