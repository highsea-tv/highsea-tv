'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// The guides' callout, cards and figures, drawn by the library, and their tables' scroller
// (one-client-platform-e.md › The guides on the library). MDX hands a page's elements and named components to whatever the
// `components` map gives (https://mdxjs.com/docs/using-mdx/#components), so these take the props
// Fumadocs' own `Callout`, `Card`, `Cards` and `img` take (https://www.fumadocs.dev/docs/ui/components)
// and no guide's MDX changes. Each is a client component, since react-native-web's components use
// hooks and context (https://nextjs.org/docs/app/api-reference/directives/use-client); the page
// renders them on the server at build, and the root layout writes the library's sheet into it
// (@highsea-tv/ui/next/style-registry), so the export is drawn before any script runs. They draw
// in highsea's default theme, the site's only one, as the site title does.
import { createT } from '@highsea-tv/i18n'
import {
  Banner,
  type BannerTone,
  ImageFigure,
  LinkCard,
  LinkCards,
  ThemeProvider,
} from '@highsea-tv/ui/native'
import Link from 'next/link'
import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react'
import { guideMessages } from '@/lib/messages.ts'

const t = createT(guideMessages)

/** Fumadocs' callout types, with its aliases (`warn`, `tip`), as the library's Banner tones. */
const TONES: Record<string, BannerTone> = {
  info: 'info',
  tip: 'info',
  warning: 'warning',
  warn: 'warning',
  success: 'success',
  error: 'danger',
  idea: 'announcement',
}

/**
 * MDX writes a callout's words as a paragraph, which the Banner's body already is: a lone `<p>`
 * gives its runs (text, inline code, links) to the body, so prose's paragraph margins stay out.
 */
function runs(children: ReactNode): ReactNode {
  const only = Children.toArray(children)
  const [first] = only
  if (only.length === 1 && isValidElement(first) && first.type === 'p')
    return (first as ReactElement<{ children?: ReactNode }>).props.children
  return children
}

export function Callout({
  title,
  type = 'info',
  children,
}: {
  title: string
  type?: string
  children?: ReactNode
}) {
  return (
    <ThemeProvider>
      <Banner title={title} tone={TONES[type] ?? 'info'}>
        {runs(children)}
      </Banner>
    </ThemeProvider>
  )
}

export function Cards({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <LinkCards>{children}</LinkCards>
    </ThemeProvider>
  )
}

export function Card({
  title,
  description,
  href,
}: {
  title: string
  description?: string
  href: string
}) {
  return (
    <ThemeProvider>
      <LinkCard title={title} description={description} href={href} link={Link} />
    </ThemeProvider>
  )
}

/** What Remark Image hands `img`: an imported local image (Next's static import) and its alt text. */
type ImageProps = {
  src?: string | Blob | { src: string; width: number; height: number }
  width?: number | string
  height?: number | string
  alt?: string
}

export function GuideImage({ src, width, height, alt = '' }: ImageProps) {
  const file = typeof src === 'object' && !(src instanceof Blob) ? src : undefined
  const w = Number(file?.width ?? width)
  const h = Number(file?.height ?? height)
  const uri = file?.src ?? (typeof src === 'string' ? src : undefined)
  // Remark Image fails the build on a local image it can't size, so every guide's image has one
  if (!uri || !w || !h) throw new Error(`A guide's image needs its width and height: ${uri}`)
  return (
    <ThemeProvider>
      <ImageFigure source={{ uri, width: w, height: h }} width={w} height={h} label={alt} />
    </ThemeProvider>
  )
}

/**
 * A table, in a scroller of its own when it's wider than the page, as Fumadocs' `Table` has it
 * (fumadocs-ui/mdx: a relative, `overflow-auto` box with `my-6`). The scroller takes the keyboard's
 * focus and has a name, so a keyboard can scroll it: a region that scrolls but holds nothing
 * focusable fails axe's scrollable-region-focusable
 * (https://dequeuniversity.com/rules/axe/4.14/scrollable-region-focusable) and WCAG 2.1.1
 * (https://www.w3.org/WAI/WCAG22/Understanding/keyboard), and a focusable region needs a name
 * (https://www.w3.org/TR/wai-aria-1.2/#region): a `<section>` with a name is a region
 * (https://www.w3.org/TR/html-aam-1.0/#el-section).
 * Its focus ring is the design language's, and its margin is set in globals.css, where prose's
 * first- and last-child rules can still take it away, as they do Fumadocs'.
 */
export function GuideTable(props: ComponentProps<'table'>) {
  return (
    <section
      aria-label={t('wideTable')}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroller takes the focus so keys can scroll it (above)
      tabIndex={0}
      data-table=""
      style={{ position: 'relative', overflowX: 'auto' }}
    >
      <table {...props} style={{ ...props.style, margin: 0 }} />
    </section>
  )
}
