// SPDX-License-Identifier: AGPL-3.0-only

import { art, byId, titles } from '@highsea-tv/fixtures'
import { BackdropHero, Button, CarouselRow, Poster, QualityTag } from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'

const meta = {
  title: 'Media/Hero and rows',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const heroActions = (
  <>
    <Button variant="primary" icon="play">
      Play
    </Button>
    <Button icon="info">Details</Button>
  </>
)

const heroItem = (id: string, eyebrow = 'Featured') => {
  const t = byId(id)
  return {
    id: t.id,
    title: t.title,
    backdrop: art(t).backdrop,
    eyebrow,
    synopsis: t.synopsis,
    meta: (
      <>
        <span>{t.year}</span>
        <span>{t.runtime}</span>
        <span>{t.genre}</span>
        {t.quality.map((q) => (
          <QualityTag key={q} overlay>
            {q}
          </QualityTag>
        ))}
      </>
    ),
  }
}

export const Hero: Story = {
  name: 'Backdrop hero',
  render: () => <BackdropHero item={heroItem('sintel')} actions={heroActions} />,
}

const rotation = ['sintel', 'spring', 'sprite-fright', 'tears-of-steel']

export const HeroRotation: Story = {
  name: 'Backdrop hero, rotating',
  parameters: {
    docs: {
      description: {
        story:
          'Changes every four seconds. The new artwork loads behind and cross-fades in once decoded; the copy leaves downward and the new copy enters from above.',
      },
    },
  },
  render: function Render() {
    const [i, setI] = useState(0)
    useEffect(() => {
      const t = setInterval(() => setI((n) => (n + 1) % rotation.length), 4000)
      return () => clearInterval(t)
    }, [])
    return (
      <BackdropHero
        item={heroItem(rotation[i] as string, `Featured · ${i + 1} of ${rotation.length}`)}
        actions={heroActions}
      />
    )
  },
}

export const Rows: Story = {
  name: 'Carousel rows',
  render: () => (
    <div className="grid gap-10 py-8">
      <CarouselRow title="Recently added" action={<a href="#all">See all</a>}>
        {titles.map((t) => (
          <Poster
            key={t.id}
            title={t.title}
            src={art(t).poster}
            href={`#${t.id}`}
            quality={t.quality.slice(0, 1)}
          />
        ))}
      </CarouselRow>
      <CarouselRow title="Staff picks" suffix="by Harbor" itemClassName="w-64">
        {titles
          .slice()
          .reverse()
          .map((t) => (
            <Poster
              key={t.id}
              title={t.title}
              src={art(t).still}
              aspect="still"
              href={`#${t.id}`}
              showTitle
              caption={`${t.year} · ${t.genre}`}
            />
          ))}
      </CarouselRow>
    </div>
  ),
}

/** `flush`: in a padded admin column, the row lines up with the content edge (media pages). */
export const FlushRow: Story = {
  name: 'Carousel row, flush',
  render: () => (
    <div className="grid max-w-3xl gap-3 rounded-lg border border-line p-5">
      <p className="text-caption text-text-3">
        The row's title and first poster line up with this text.
      </p>
      <CarouselRow flush title="More like this" itemClassName="w-28">
        {titles.map((t) => (
          <Poster
            key={t.id}
            title={t.title}
            src={art(t).poster}
            href={`#${t.id}`}
            showTitle
            caption={t.year}
          />
        ))}
      </CarouselRow>
    </div>
  ),
}
