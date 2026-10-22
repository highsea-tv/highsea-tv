// SPDX-License-Identifier: AGPL-3.0-only
import { adminText, fonts, type TextStyle, tvText, webText, weights } from '@highsea-tv/tokens'
import { cn } from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'
import { Page, Section } from './page.tsx'

const meta = {
  title: 'Foundations/Typography',
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta

const samples: Record<string, string> = {
  display: 'Your own streaming platform',
  heading: 'Recently added',
  title: 'Sintel',
  body: 'A lone traveler searches the frozen highlands for the young dragon she raised and lost.',
  caption: 'Added 3 hours ago · 4.2 GB',
  mono: '/data/media/movies/Sintel (2010)',
  label: 'Quality profile',
  ui: 'Search for a release',
  form: 'Harbor',
  'table-header': 'Progress',
  figure: '18.4 MB/s · 00:03:12',
  release: 'Sintel.2010.2160p.WEB-DL.DDP5.1.H.265-GRP',
  'widget-title': 'Network',
}

// literal, so Tailwind's scanner finds every one
const utilities: Record<string, string> = {
  display: 'text-display',
  heading: 'text-heading',
  title: 'text-title',
  body: 'text-body',
  caption: 'text-caption',
  mono: 'text-mono',
  label: 'text-label',
  ui: 'text-ui',
  form: 'text-form',
  'table-header': 'text-table-header',
  figure: 'text-figure',
  release: 'text-release',
  'widget-title': 'text-widget-title',
}

function spec(s: TextStyle, unit = 'px') {
  return [
    `${s.size}${unit}`,
    s.leading && `/${s.leading}`,
    s.weight,
    s.tracking && `${s.tracking > 0 ? '+' : ''}${s.tracking}em`,
    s.family === 'mono' && 'mono',
    s.uppercase && 'caps',
  ]
    .filter(Boolean)
    .join(' · ')
}

function Row({ name, style }: { name: string; style: TextStyle }) {
  return (
    <div className="grid items-baseline gap-2 border-line border-b py-4 medium:grid-cols-[11rem_1fr]">
      <div className="grid gap-0.5">
        <span className="font-mono text-caption text-text">text-{name}</span>
        <span className="font-mono text-release text-text-3">{spec(style)}</span>
      </div>
      {/* the text utilities carry size, leading, weight and tracking; family and case are separate */}
      <p
        className={cn(
          utilities[name],
          style.family === 'mono' && 'font-mono',
          style.uppercase && 'uppercase',
          'min-w-0 truncate',
        )}
      >
        {samples[name]}
      </p>
    </div>
  )
}

const tvSamples: Record<keyof typeof tvText, string> = {
  heroTitle: 'Sintel',
  synopsis: 'A lone traveler searches the frozen highlands for her dragon.',
  rowTitle: 'Continue watching',
  button: 'Play',
  meta: '2010 · 15m · Fantasy',
  serverName: 'Harbor',
  eyebrow: 'Featured',
  pill: 'Maintenance tonight',
  quality: '4K HDR',
}

const tvCss = (s: TextStyle): CSSProperties => ({
  fontSize: `${s.size}cqw`,
  lineHeight: s.leading,
  fontWeight: s.weight,
  letterSpacing: s.tracking ? `${s.tracking}em` : undefined,
  textTransform: s.uppercase ? 'uppercase' : undefined,
  fontFamily: s.family === 'mono' ? 'var(--font-mono)' : undefined,
})

export const Scale: StoryObj = {
  render: () => (
    <Page
      title="Typography"
      lead={`${fonts.sans.family} for everything, ${fonts.mono.family} for paths, figures and release names. Three weights (${Object.values(weights).join(', ')}); hierarchy comes from size and color first.`}
      doc="docs/design-language/typography.md"
    >
      <Section title="Web and desktop">
        <div>
          {Object.entries(webText).map(([name, style]) => (
            <Row key={name} name={name} style={style} />
          ))}
        </div>
      </Section>
      <Section title="Admin additions" note="Denser styles for tables, forms and widgets.">
        <div>
          {Object.entries(adminText).map(([name, style]) => (
            <Row key={name} name={name} style={style} />
          ))}
        </div>
      </Section>
      <Section
        title="TV"
        note="In screen units (1u = 1% of the screen width), shown here on a 16:9 frame. Nothing is smaller than 0.8u."
      >
        <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border border-line bg-bg [container-type:inline-size]">
          <div className="grid gap-[1.2cqw] p-[4.5cqw]">
            {Object.entries(tvText).map(([name, style]) => (
              <div key={name} className="flex items-baseline gap-[2cqw]">
                <span className="w-[14cqw] shrink-0 font-mono text-[max(0.8cqw,10px)] text-text-3">
                  {name} · {style.size}u
                </span>
                <span
                  className={
                    name === 'eyebrow'
                      ? 'text-accent-text'
                      : name === 'synopsis' || name === 'meta'
                        ? 'text-text-2'
                        : ''
                  }
                  style={tvCss(style)}
                >
                  {tvSamples[name as keyof typeof tvText]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </Page>
  ),
}
