// SPDX-License-Identifier: AGPL-3.0-only
import { Lockup, Mark } from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Page, Section } from './page.tsx'

const meta = { title: 'Foundations/Brand', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const label = 'font-mono text-release text-text-3'

export const Logo: StoryObj = {
  render: () => (
    <Page
      title="Brand"
      lead="A disc over the horizon, cut by two swells. In product UI the mark follows the theme's accent and the lockup is live text; the logo files always use the default Bone."
      doc="docs/brand/logo.md"
    >
      <Section
        title="Mark"
        note="Below 24px the swells are cut wider (4.2 units instead of 3.2) so they stay open."
      >
        <div className="flex flex-wrap items-end gap-8 rounded-lg bg-s1 p-8">
          {[16, 20, 24, 32, 48, 96].map((s) => (
            <div key={s} className="grid justify-items-center gap-3">
              <Mark size={s} />
              <span className={label}>
                {s}
                {s < 24 ? ' · small' : ''}
              </span>
            </div>
          ))}
          <div className="grid justify-items-center gap-3 text-text-2">
            <Mark size={48} paint="mono" />
            <span className={label}>mono</span>
          </div>
        </div>
      </Section>
      <Section
        title="Lockup"
        note="Live text: highsea in 600, tv in 500 text-3, tracked −0.045em. At least 96px wide; use the mark alone below that."
      >
        <div className="grid justify-items-start gap-6 rounded-lg bg-s1 p-8">
          <Lockup size={17} />
          <Lockup size={28} />
          <Lockup size={48} />
        </div>
      </Section>
      <Section
        title="Clear space"
        note="Keep at least a quarter of the mark's height free on every side."
      >
        <div className="flex gap-8">
          <div className="rounded-sm p-3 outline-1 outline-accent/40 outline-dashed">
            <div className="outline-1 outline-line-strong">
              <Mark size={48} />
            </div>
          </div>
        </div>
      </Section>
    </Page>
  ),
}
