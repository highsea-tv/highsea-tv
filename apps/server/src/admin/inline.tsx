'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Announcement bodies are markdown; the admin renders the inline part the composer offers, as the
// prototypes do (kit/inline.tsx): **bold**, _italic_ and [links](https://…). Links open in a new
// tab, away from the app.
import { Button } from '@highsea-tv/ui-web'
import type { ReactNode } from 'react'

const TOKENS = /(\*\*[^*]+\*\*|_[^_]+_|\[[^\]]+\]\([^)\s]+\))/

function Part({ part }: { part: string }): ReactNode {
  if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
    return <strong className="font-semibold text-text">{part.slice(2, -2)}</strong>
  if (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    return <em>{part.slice(1, -1)}</em>
  const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
  if (link)
    return (
      <a
        href={link[2]}
        target="_blank"
        rel="noreferrer"
        className="text-text underline underline-offset-2 hover:text-accent-text"
      >
        {link[1]}
      </a>
    )
  return part
}

export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(TOKENS).map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the split is stable for a given text
        <Part key={i} part={part} />
      ))}
    </>
  )
}

/** An announcement's call to action, as a secondary button that opens the link. */
export function Cta({
  cta,
  className,
}: {
  cta: { label: string; url: string } | null
  className?: string
}) {
  if (!cta) return null
  return (
    <Button size="sm" icon="external" asChild className={className}>
      <a href={cta.url} target="_blank" rel="noreferrer">
        {cta.label}
      </a>
    </Button>
  )
}
