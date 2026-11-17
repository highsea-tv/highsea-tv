// SPDX-License-Identifier: AGPL-3.0-only
// The components a guide can use (https://mdxjs.com/docs/using-mdx/#components): Fumadocs'
// defaults, which keep its code blocks, headings and their anchors, with its steps and tabs; the
// library's callout, cards and figures in place of Fumadocs'; and a table whose scroller the
// keyboard can reach (./guide-parts.tsx, one-client-platform-e.md › The guides on the library).
import { Step, Steps } from 'fumadocs-ui/components/steps'
import { Tab, Tabs } from 'fumadocs-ui/components/tabs'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import type { MDXComponents } from 'mdx/types'
import { Children, type ComponentProps, isValidElement, type ReactNode } from 'react'
import { Callout, Card, Cards, GuideImage, GuideTable } from './guide-parts.tsx'

/**
 * A paragraph, with any figure it holds standing on its own: Markdown puts an image in a paragraph
 * (https://spec.commonmark.org/0.31.2/#images), alone or after text on the line before, and the
 * figure is a block, which HTML doesn't allow inside a `<p>`
 * (https://html.spec.whatwg.org/multipage/grouping-content.html#the-p-element). The words around a
 * figure stay paragraphs; a browser would otherwise close the `<p>` early, and React's hydration
 * would no longer match the page.
 */
function Paragraph({ children, ...props }: ComponentProps<'p'>) {
  const runs: ReactNode[][] = [[]]
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === GuideImage) runs.push([child], [])
    else runs.at(-1)?.push(child)
  }
  if (runs.length === 1) return <p {...props}>{children}</p>
  return runs.map((run, i) => {
    const [only] = run
    if (isValidElement(only) && only.type === GuideImage) return only
    // the soft break before a figure leaves only white space
    if (run.every((c) => typeof c === 'string' && !c.trim())) return null
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: the runs are fixed by the page's text
      <p key={i} {...props}>
        {run}
      </p>
    )
  })
}

export function mdxComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    Step,
    Steps,
    Tab,
    Tabs,
    Callout,
    Card,
    Cards,
    img: GuideImage,
    p: Paragraph,
    table: GuideTable,
    ...components,
  }
}
