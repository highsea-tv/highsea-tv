// SPDX-License-Identifier: AGPL-3.0-only

import { art, titles } from '@highsea/fixtures'
import {
  type BuiltInThemeId,
  builtInThemes,
  createTheme,
  decodeTheme,
  encodeTheme,
  formatHex,
  nearestPassing,
  parseColor,
  type ThemeableRole,
  type ThemeInput,
  themeCss,
} from '@highsea/tokens'
import {
  Badge,
  Banner,
  Button,
  Field,
  Input,
  Mark,
  Poster,
  Progress,
  SegmentedControl,
  Select,
  Switch,
} from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { Page, Section } from './page.tsx'

const meta = { title: 'Foundations/Themes', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const hex = (c: string) => formatHex(parseColor(c)).slice(0, 7)

/** Product UI in miniature, to judge a theme in context. */
function Preview() {
  return (
    <div className="grid gap-5 rounded-lg bg-bg p-6 text-text">
      <div className="flex items-center gap-3">
        <Mark size={28} />
        <span className="font-semibold text-title">Harbor</span>
        <span className="flex-1" />
        <Badge tone="accent">Downloading</Badge>
        <Badge tone="success">Seeding</Badge>
      </div>
      <Banner variant="card" title="Movie night on Friday">
        The new Blender shorts are in the library.
      </Banner>
      <div className="grid grid-cols-4 gap-3">
        {titles.slice(0, 4).map((t) => (
          <Poster key={t.id} title={t.title} src={art(t).poster} href={`#${t.id}`} />
        ))}
      </div>
      <div className="grid gap-3 rounded-lg bg-s1 p-4">
        <Field label="Server name" hint="Shown to everyone who connects.">
          <Input defaultValue="Harbor" />
        </Field>
        <Progress value={64} showValue aria-label="Sintel" />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon="play">
            Play
          </Button>
          <Button>Details</Button>
          <Button variant="danger">Delete</Button>
          <span className="flex-1" />
          <Switch defaultChecked aria-label="Monitored" />
        </div>
      </div>
    </div>
  )
}

export const Editor: StoryObj = {
  name: 'Theme editor',
  render: function Render() {
    const [input, setInput] = useState<ThemeInput>({
      name: 'Harbor',
      base: 'default',
      accent: '#8fbfb7',
    })
    const [code, setCode] = useState('')
    const [codeError, setCodeError] = useState<string | null>(null)
    const build = useMemo(() => {
      try {
        return createTheme({ ...input, id: 'editor' })
      } catch {
        return null
      }
    }, [input])
    const fix = (role: ThemeableRole) => {
      const v = nearestPassing(input, role)
      if (v) setInput((i) => ({ ...i, colors: { ...i.colors, [role]: v } }))
    }
    const failing = build?.audit.results.filter((r) => !r.pass) ?? []
    return (
      <Page
        title="Themes"
        lead="A theme is a small override of a built-in one. Set an accent and highsea generates the rest of its family, then audits every pairing. Themes that fail can't be saved; share codes carry the override, not the full theme."
        doc="docs/design-language/color.md#custom-themes-and-server-branding"
      >
        {build && <style>{themeCss(build.theme, '[data-theme="editor"]')}</style>}
        <div className="grid gap-8 expanded:grid-cols-[22rem_1fr]">
          <div className="grid content-start gap-5">
            <Field label="Name">
              <Input
                value={input.name ?? ''}
                onChange={(e) => setInput((i) => ({ ...i, name: e.target.value }))}
              />
            </Field>
            <Field label="Based on">
              <Select
                value={input.base ?? 'default'}
                onValueChange={(v) => setInput((i) => ({ ...i, base: v as BuiltInThemeId }))}
                options={Object.values(builtInThemes).map((t) => ({ value: t.id, label: t.name }))}
              />
            </Field>
            <Field
              label="Accent"
              hint="The rest of the accent family is generated to pass contrast."
            >
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Accent color"
                  value={hex(input.accent ?? '#d6cfc2')}
                  onChange={(e) => setInput((i) => ({ ...i, accent: e.target.value, colors: {} }))}
                  className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s2 p-1"
                />
                <Input
                  aria-label="Accent value"
                  value={input.accent ?? ''}
                  onChange={(e) => setInput((i) => ({ ...i, accent: e.target.value }))}
                  className="font-mono"
                />
              </div>
            </Field>
            <Field
              label="Tertiary text (text-3)"
              hint="Try a dark value to see the audit catch it."
            >
              <div className="flex gap-2">
                <input
                  type="color"
                  aria-label="Tertiary text color"
                  value={hex(build?.theme.colors['text-3'] ?? '#a2a2a7')}
                  onChange={(e) =>
                    setInput((i) => ({ ...i, colors: { ...i.colors, 'text-3': e.target.value } }))
                  }
                  className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s2 p-1"
                />
                <Button variant="ghost" onClick={() => setInput(({ colors, ...rest }) => rest)}>
                  Reset overrides
                </Button>
              </div>
            </Field>
            <div className="grid gap-2 rounded-lg bg-s1 p-4">
              <div className="flex items-center justify-between">
                <span className="text-widget-title">Contrast</span>
                {build ? (
                  <Badge tone={build.audit.pass ? 'success' : 'danger'}>
                    {build.audit.pass ? 'Passes' : `${failing.length} failing`}
                  </Badge>
                ) : (
                  <Badge tone="danger">Invalid color</Badge>
                )}
              </div>
              {failing.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-2 text-ui">
                  <span>
                    {r.label}{' '}
                    <span className="font-mono text-figure text-text-3">
                      Lc {Math.round(r.lc)} / {r.min}
                    </span>
                  </span>
                  {r.fg !== 'on-danger' && !r.fg.startsWith('badge') && (
                    <Button size="sm" variant="ghost" onClick={() => fix(r.fg as ThemeableRole)}>
                      Fix
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="grid gap-2">
              <span className="text-widget-title">Share code</span>
              <code className="break-all rounded-md bg-s1 p-3 font-mono text-release text-text-2">
                {build
                  ? encodeTheme({
                      ...input,
                      colors:
                        input.colors && Object.keys(input.colors).length ? input.colors : undefined,
                    })
                  : '—'}
              </code>
              <div className="flex gap-2">
                <Input
                  aria-label="Paste a share code"
                  placeholder="hs1.…"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button
                  onClick={() => {
                    try {
                      setInput(decodeTheme(code))
                      setCodeError(null)
                    } catch (e) {
                      setCodeError((e as Error).message)
                    }
                  }}
                >
                  Load
                </Button>
              </div>
              {codeError && <span className="text-badge-danger text-caption">{codeError}</span>}
            </div>
          </div>
          <div data-theme="editor" className="rounded-lg">
            <Preview />
          </div>
        </div>
        <Section
          title="Built-in themes"
          note="Each writes every variable, so themes nest: these previews ignore the toolbar."
        >
          <div className="grid gap-6 wide:grid-cols-3">
            {Object.values(builtInThemes).map((t) => (
              <div key={t.id} className="grid gap-2">
                <span className="text-widget-title">{t.name}</span>
                <div data-theme={t.id} className="rounded-lg">
                  <div className="grid gap-3 rounded-lg bg-bg p-4">
                    <div className="flex gap-2">
                      {(['bg', 's1', 's2', 's3', 's4', 'accent', 'text'] as const).map((r) => (
                        <span
                          key={r}
                          className="size-6 rounded-sm ring-1 ring-line-strong"
                          style={{ background: `var(--color-${r})` }}
                        />
                      ))}
                    </div>
                    <SegmentedControl
                      size="sm"
                      aria-label={`${t.name} sample`}
                      defaultValue="a"
                      options={[
                        { value: 'a', label: 'Library' },
                        { value: 'b', label: 'Downloads' },
                      ]}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary">
                        Play
                      </Button>
                      <Button size="sm">Details</Button>
                      <Badge tone="warning">Stalled</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </Page>
    )
  },
}
