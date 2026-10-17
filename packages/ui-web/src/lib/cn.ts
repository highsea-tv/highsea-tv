// SPDX-License-Identifier: AGPL-3.0-only
import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The token theme renames Tailwind's scales (`text-title` is a size, `text-text-2` a color), so
 * tailwind-merge has to be told which names belong to which scale, or it drops one of the two.
 */
const merge = extendTailwindMerge({
  override: {
    theme: {
      text: [
        'display',
        'heading',
        'title',
        'body',
        'caption',
        'mono',
        'label',
        'ui',
        'form',
        'table-header',
        'figure',
        'release',
        'widget-title',
      ],
      radius: ['sm', 'md', 'lg', 'xl', 'poster'],
      shadow: ['2', '3', '4'],
      blur: ['bar', 'pill', 'badge', 'scrim'],
      breakpoint: ['medium', 'expanded', 'wide'],
      tracking: ['display', 'title', 'wordmark', 'label', 'eyebrow'],
      ease: ['spring', 'spring-quick', 'out'],
      aspect: ['poster', 'still', 'square', 'book'],
      font: ['sans', 'mono'],
      'font-weight': ['normal', 'medium', 'semibold'],
    },
  },
})

/** Joins class names; later utilities win over earlier ones from the same group. */
export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
