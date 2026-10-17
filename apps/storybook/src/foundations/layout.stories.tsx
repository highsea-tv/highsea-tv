// SPDX-License-Identifier: AGPL-3.0-only
import { blur, breakpoints, density, elevation, radius, shadowCss, space } from '@highsea/tokens'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Page, Section } from './page.tsx'

const meta = {
  title: 'Foundations/Layout and elevation',
  parameters: { layout: 'fullscreen' },
} satisfies Meta
export default meta

const label = 'font-mono text-release text-text-3'

export const Scales: StoryObj = {
  render: () => (
    <Page
      title="Layout and elevation"
      lead="A 4px spacing base, five radii, and elevation by tone: each layer is a lighter surface, and only floating layers get a shadow."
      doc="docs/design-language/spacing-layout.md · elevation.md"
    >
      <Section title="Spacing" note="Tailwind steps map one to one: p-3 is space-3 (12px).">
        <div className="grid gap-2">
          {Object.entries(space)
            .sort(([, a], [, b]) => a - b)
            .map(([k, px]) => (
              <div key={k} className="flex items-center gap-4">
                <span className={`${label} w-24`}>
                  space-{k} · {px}
                </span>
                <span className="h-3 rounded-sm bg-accent" style={{ width: px }} />
              </div>
            ))}
        </div>
      </Section>
      <Section title="Radius">
        <div className="flex flex-wrap gap-6">
          {Object.entries(radius).map(([k, px]) => (
            <div key={k} className="grid justify-items-center gap-2">
              <div
                className="size-20 border border-line-strong bg-s2"
                style={{ borderRadius: `var(--radius-${k}, ${px}px)` }}
              />
              <span className={label}>
                {k} · {px === 999 ? 'pill' : `${px}px`}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Elevation"
        note="0 is the page (bg), 1 a card (s1). 2–4 add a black shadow because they float: popovers and menus at 3, dialogs at 4."
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-8 rounded-lg bg-bg p-8">
          <div className="grid h-28 place-items-center rounded-lg bg-bg ring-1 ring-line">
            <span className={label}>0 · bg</span>
          </div>
          <div className="grid h-28 place-items-center rounded-lg bg-s1">
            <span className={label}>1 · s1</span>
          </div>
          {Object.entries(elevation).map(([level, e]) => (
            <div
              key={level}
              className="grid h-28 place-items-center rounded-lg"
              style={{ background: `var(--color-${e.surface[0]})`, boxShadow: shadowCss(e.shadow) }}
            >
              <span className={label}>
                {level} · {e.surface.join('/')}
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section
        title="Blur"
        note="Chrome over moving or image content. Each recipe has a solid fallback for reduced transparency."
      >
        <div className="relative grid h-40 grid-cols-3 items-end gap-4 overflow-hidden rounded-lg bg-[conic-gradient(from_200deg,var(--color-accent-2),var(--color-info),var(--color-success),var(--color-accent-2))] p-4">
          <div className="glass-bar grid h-14 place-items-center rounded-md">
            <span className="font-mono text-release text-text">bar · {blur.bar.radius}px</span>
          </div>
          <div className="glass-scrim grid h-14 place-items-center rounded-md">
            <span className="font-mono text-release text-text">scrim · {blur.scrim.radius}px</span>
          </div>
          <div className="glass-badge grid h-14 place-items-center rounded-md">
            <span className="font-mono text-release text-text">badge · {blur.badge.radius}px</span>
          </div>
        </div>
      </Section>
      <Section title="Admin density" note="Fixed sizes for the dense admin app.">
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
          {Object.entries(density).map(([k, v]) => (
            <div key={k} className="rounded-md bg-s1 p-3">
              <dt className={label}>{k}</dt>
              <dd className="font-mono text-figure">{v}px</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section
        title="Breakpoints"
        note="compact is the default; medium:, expanded: and wide: apply from these widths up."
      >
        <div className="flex flex-wrap gap-3">
          <span className="rounded-md bg-s1 px-3 py-2 font-mono text-figure">compact · 0</span>
          {Object.entries(breakpoints).map(([k, px]) => (
            <span key={k} className="rounded-md bg-s1 px-3 py-2 font-mono text-figure">
              {k} · {px}px
            </span>
          ))}
        </div>
      </Section>
    </Page>
  ),
}
