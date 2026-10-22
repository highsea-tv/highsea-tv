// SPDX-License-Identifier: AGPL-3.0-only
import { glyphs, Icon, type IconName, Input, icons, SegmentedControl } from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Page, Section } from './page.tsx'

const meta = { title: 'Foundations/Icons', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const custom = new Set(Object.keys(glyphs))
const names = Object.keys(icons) as IconName[]

function Tile({ name, size }: { name: IconName; size: number }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-md bg-s1 p-4 text-text-2 hover:text-text">
      <Icon name={name} size={size} />
      <span className="truncate font-mono text-release text-text-3">{name}</span>
    </div>
  )
}

export const Gallery: StoryObj = {
  render: function Render() {
    const [query, setQuery] = useState('')
    const [size, setSize] = useState(20)
    const shown = names.filter((n) => n.includes(query.trim().toLowerCase()))
    return (
      <Page
        title="Icons"
        lead="Lucide at stroke 1.75, plus highsea's own glyphs where Lucide has nothing fitting. Product code asks for icons by meaning, so a glyph can change without touching screens."
        doc="docs/design-language/iconography.md · design/assets/icons"
      >
        <Section
          title="Custom glyphs"
          note="Drawn to Lucide's rules: 24 grid, 2px padding, stroke 1.75, round caps. Drafts awaiting sign-off."
        >
          <div className="flex flex-wrap gap-8">
            {[...custom].map((n) => (
              <div key={n} className="grid justify-items-center gap-3">
                <div className="flex items-end gap-5 rounded-lg bg-s1 p-5">
                  {[16, 20, 24, 48].map((s) => (
                    <Icon key={s} name={n as IconName} size={s} />
                  ))}
                </div>
                <span className="font-mono text-caption text-text-2">{n}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title={`All icons (${names.length})`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-64">
              <Input
                icon="search"
                aria-label="Filter icons"
                placeholder="Filter"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <SegmentedControl
              aria-label="Icon size"
              size="sm"
              options={[16, 20, 24].map((s) => ({ value: String(s), label: `${s}px` }))}
              value={String(size)}
              onValueChange={(v) => setSize(Number(v))}
            />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
            {shown.map((n) => (
              <Tile key={n} name={n} size={size} />
            ))}
          </div>
        </Section>
      </Page>
    )
  },
}
