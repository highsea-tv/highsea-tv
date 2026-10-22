// SPDX-License-Identifier: AGPL-3.0-only
import { auditTheme, type ColorRole, LOCKED_ROLES } from '@highsea-tv/tokens'
import { Badge, Icon } from '@highsea-tv/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { activeTheme, Page, Section } from './page.tsx'

const meta = { title: 'Foundations/Color', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const groups: { title: string; note: string; roles: ColorRole[] }[] = [
  {
    title: 'Surfaces',
    note: 'Elevation is tone first: each level is one step lighter. Shadows are reserved for layers that float.',
    roles: ['bg', 's1', 's2', 's3', 's4', 'line', 'line-strong'],
  },
  {
    title: 'Text',
    note: 'Three levels. text-3 is for metadata and placeholders, never for anything needed to act.',
    roles: ['text', 'text-2', 'text-3'],
  },
  {
    title: 'Accent',
    note: 'One accent, used sparingly: the primary action, the active item, focus. A custom theme regenerates this whole family from one color.',
    roles: [
      'accent',
      'accent-2',
      'accent-text',
      'accent-fill',
      'on-accent',
      'accent-soft',
      'focus',
    ],
  },
  {
    title: 'Status',
    note: 'Locked across themes so meanings stay stable on every server. Always paired with a label or icon.',
    roles: ['success', 'warning', 'danger', 'info', 'danger-fill', 'on-danger'],
  },
  {
    title: 'Badges (derived)',
    note: 'Computed from the status colors and text, so every platform gets identical values.',
    roles: [
      'badge-success',
      'badge-success-bg',
      'badge-warning',
      'badge-warning-bg',
      'badge-danger',
      'badge-danger-bg',
      'badge-info',
      'badge-info-bg',
    ],
  },
]

function Swatch({ role, value }: { role: ColorRole; value: string }) {
  const locked = (LOCKED_ROLES as readonly string[]).includes(role)
  return (
    <div className="grid gap-2">
      <div
        className="h-16 rounded-md border border-line-strong"
        style={{ background: `var(--color-${role})` }}
      />
      <div className="grid gap-0.5">
        <span className="flex items-center gap-1.5 font-medium text-ui">
          {role}
          {locked && <Icon name="lock" size={12} label="Locked" className="text-text-3" />}
        </span>
        <span className="font-mono text-release text-text-3">{value}</span>
      </div>
    </div>
  )
}

export const Roles: StoryObj = {
  render: (_, { globals }) => {
    const theme = activeTheme(globals)
    const audit = auditTheme(theme)
    return (
      <Page
        title="Color"
        lead={
          <>
            Semantic roles, never raw values. Showing <b className="text-text">{theme.name}</b>.
            Switch themes in the toolbar.
          </>
        }
        doc="docs/design-language/color.md"
      >
        {groups.map((g) => (
          <Section key={g.title} title={g.title} note={g.note}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-5">
              {g.roles.map((r) => (
                <Swatch key={r} role={r} value={theme.colors[r]} />
              ))}
            </div>
          </Section>
        ))}
        <Section
          title="Contrast audit"
          note="APCA Lc for every pairing in the policy, measured as rendered (alpha composited) on the weakest surface. Every built-in theme must pass; custom themes are checked the same way."
        >
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-ui">
              <thead className="bg-s1 text-start text-table-header text-text-3">
                <tr>
                  <th className="px-4 py-2.5 text-start">Pairing</th>
                  <th className="px-4 py-2.5 text-start">Sample</th>
                  <th className="px-4 py-2.5 text-start">Weakest on</th>
                  <th className="px-4 py-2.5 text-end">Lc</th>
                  <th className="px-4 py-2.5 text-end">Minimum</th>
                  <th className="px-4 py-2.5 text-end">WCAG</th>
                  <th className="px-4 py-2.5 text-start">Result</th>
                </tr>
              </thead>
              <tbody>
                {audit.results.map((r) => (
                  <tr key={r.label} className="border-line border-t">
                    <td className="px-4 py-2.5">{r.label}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="rounded-sm px-2 py-1"
                        style={{
                          // the fill (button, badge tint) composited over the surface, as rendered
                          background: r.fill
                            ? `linear-gradient(var(--color-${r.fill}), var(--color-${r.fill})), var(--color-${r.on})`
                            : `var(--color-${r.on})`,
                          color: `var(--color-${r.fg})`,
                        }}
                      >
                        Aa 4K
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-figure text-text-2">{r.on}</td>
                    <td className="px-4 py-2.5 text-end font-mono text-figure">
                      {Math.round(r.lc)}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono text-figure text-text-2">
                      {r.min}
                    </td>
                    <td className="px-4 py-2.5 text-end font-mono text-figure text-text-2">
                      {r.ratio.toFixed(1)}:1
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={r.pass ? 'success' : 'danger'}>{r.pass ? 'Pass' : 'Fail'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </Page>
    )
  },
}
