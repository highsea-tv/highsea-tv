// SPDX-License-Identifier: AGPL-3.0-only
// A12 Appearance (docs/product/appearance.md): what every app inherits from the server. The name,
// mark and accent; the default theme, and custom themes built with the theme engine's editor
// (contrast audited, shareable by code); and sound defaults per kind of app.
import {
  type BuiltInThemeId,
  builtInThemes,
  createTheme,
  decodeTheme,
  encodeTheme,
  formatHex,
  nearestPassing,
  parseColor,
  SOUND_EVENTS,
  type SoundEvent,
  type ThemeableRole,
  themeCss,
} from '@highsea-tv/tokens'
import {
  Badge,
  Button,
  Field,
  Icon,
  Input,
  Mark,
  Select,
  Switch,
  toast,
  useSoundPlayer,
} from '@highsea-tv/ui-web'
import { useEffect, useMemo, useState } from 'react'
import { useAction, useQuery } from '../../mock/hooks.tsx'
import type { Appearance as AppearanceData, CustomTheme, SoundDefaults } from '../../mock/types.ts'
import { Loadable } from '../loadable.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'

const hex = (c: string) => formatHex(parseColor(c)).slice(0, 7)

type Loaded = AppearanceData & { branding: { name: string; accent: string | null } }

export function Appearance() {
  const data = useQuery('appearance', (c) => c.appearance.get(), ['server.updated'])
  return (
    <AreaPage id="appearance">
      <Loadable query={data} what="the appearance settings">
        {(a) => <Form loaded={a} />}
      </Loadable>
    </AreaPage>
  )
}

function Form({ loaded }: { loaded: Loaded }) {
  const initial = {
    name: loaded.branding.name,
    accent: loaded.branding.accent,
    defaultTheme: loaded.defaultTheme,
    sound: loaded.sound,
  }
  const [draft, setDraft] = useState(initial)
  const save = useAction((c, d: typeof initial) => c.appearance.save(d))
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const set = (patch: Partial<typeof initial>) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <>
      <Identity draft={draft} set={set} />
      <Themes
        themes={loaded.themes}
        value={draft.defaultTheme}
        onChange={(defaultTheme) => set({ defaultTheme })}
      />
      <Sounds value={draft.sound} onChange={(sound) => set({ sound })} />
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onDiscard={() => setDraft(initial)}
        onSave={() =>
          save
            .run(draft)
            .then(() =>
              toast.success('Appearance saved', {
                description: 'Every app picks it up the next time it checks in.',
              }),
            )
            .catch((e: Error) => toast.error('Couldn’t save', { description: e.message }))
        }
      />
    </>
  )
}

// ---------------------------------------------------------------- identity

function Identity({
  draft,
  set,
}: {
  draft: { name: string; accent: string | null }
  set: (p: { name?: string; accent?: string | null }) => void
}) {
  const [mark, setMark] = useState<string | null>(null)
  const audit = useMemo(() => {
    if (!draft.accent) return null
    try {
      return createTheme({ accent: draft.accent }).audit
    } catch {
      return undefined
    }
  }, [draft.accent])
  return (
    <Group
      title="Server identity"
      description="Shown to everyone who connects: in the apps’ server switcher, on the TV, and at the top of this admin."
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 expanded:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
          <Field label="Name" error={!draft.name.trim() ? 'The server needs a name.' : undefined}>
            <Input
              value={draft.name}
              maxLength={40}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field
            label="Mark"
            hint="A square SVG or PNG, at least 256 px. Clients show it beside the name."
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/svg+xml,image/png"
                aria-label="Upload a mark"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setMark(URL.createObjectURL(f))
                }}
                className="min-w-0 max-w-full text-caption text-text-2 file:me-3 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-s2 file:px-3 file:py-1.5 file:text-text file:text-ui"
              />
              {mark && (
                <Button size="sm" variant="ghost" onClick={() => setMark(null)}>
                  Use the highsea mark
                </Button>
              )}
            </div>
          </Field>
          <div className="grid gap-2">
            <Field inline label="Use a brand accent" hint="Otherwise each theme keeps its own.">
              <Switch
                checked={draft.accent !== null}
                onCheckedChange={(on) => set({ accent: on ? '#8fbfb7' : null })}
              />
            </Field>
            {draft.accent !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label="Accent color"
                  value={hex(audit === undefined ? '#8fbfb7' : draft.accent)}
                  onChange={(e) => set({ accent: e.target.value })}
                  className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s2 p-1"
                />
                <Input
                  aria-label="Accent value"
                  value={draft.accent}
                  onChange={(e) => set({ accent: e.target.value })}
                  className="w-32 font-mono"
                />
                {audit === undefined ? (
                  <Badge tone="danger">Not a color</Badge>
                ) : audit?.pass ? (
                  <Badge tone="success">Passes contrast</Badge>
                ) : (
                  <Badge tone="warning">Adjusted for contrast</Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <figure className="grid content-start gap-2">
          <figcaption className="font-mono text-label text-text-3 uppercase">
            In the apps
          </figcaption>
          <div className="flex items-center gap-2.5 rounded-md border border-line bg-bg p-3">
            {mark ? (
              <img src={mark} alt="" className="size-7 rounded-sm object-contain" />
            ) : (
              <Mark size={28} />
            )}
            <span className="truncate font-semibold text-text text-ui">
              {draft.name || 'Your server'}
            </span>
            <Icon name="chevron-down" size={14} className="text-text-3" />
          </div>
        </figure>
      </div>
    </Group>
  )
}

// ---------------------------------------------------------------- themes

const builtIns = Object.values(builtInThemes).map((t) => ({ id: t.id, name: t.name }))

function swatches(id: string) {
  return (
    <span className="flex gap-1" data-theme={id}>
      {(['bg', 's2', 'text-2', 'accent'] as const).map((r) => (
        <span
          key={r}
          className="size-4 rounded-full ring-1 ring-line-strong"
          style={{ background: `var(--color-${r})` }}
        />
      ))}
    </span>
  )
}

function Themes({
  themes,
  value,
  onChange,
}: {
  themes: CustomTheme[]
  value: string
  onChange: (id: string) => void
}) {
  const [editing, setEditing] = useState<CustomTheme | null>(null)
  const remove = useAction((c, id: string) => c.appearance.deleteTheme(id))
  const css = useMemo(
    () =>
      themes
        .map((t) => {
          try {
            return themeCss(createTheme({ ...t, id: t.id }).theme, `[data-theme="${t.id}"]`)
          } catch {
            return ''
          }
        })
        .join('\n'),
    [themes],
  )
  const all = [
    ...builtIns.map((t) => ({ ...t, custom: false })),
    ...themes.map((t) => ({ id: t.id, name: t.name, custom: true })),
  ]
  return (
    <Group
      title="Themes"
      description="The apps start in the default theme. Anyone can pick another on their own device."
    >
      <style>{css}</style>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Default theme</legend>
        <div className="grid gap-2 medium:grid-cols-2 wide:grid-cols-3">
          {all.map((t) => (
            <label
              key={t.id}
              className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-s2 p-3 has-checked:border-accent has-focus-visible:ring-focus"
            >
              <input
                type="radio"
                name="default-theme"
                value={t.id}
                checked={value === t.id}
                onChange={() => onChange(t.id)}
                className="size-4 accent-accent-fill"
              />
              <span className="grid min-w-0">
                <span className="truncate text-text text-ui">{t.name}</span>
                <span className="text-caption text-text-3">
                  {value === t.id ? 'Default' : t.custom ? 'Custom' : 'Built in'}
                </span>
              </span>
              {swatches(t.id)}
            </label>
          ))}
        </div>
      </fieldset>
      {themes.length > 0 && (
        <ul aria-label="Custom themes" className="grid gap-2">
          {themes.map((t) => (
            <li
              key={t.id}
              className="flex flex-wrap items-center gap-2 border-line border-t pt-2 text-ui"
            >
              <span className="me-auto text-text">{t.name}</span>
              <Button size="sm" icon="edit" onClick={() => setEditing(t)}>
                Edit
              </Button>
              <Button
                size="sm"
                icon="copy"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(encodeTheme(t)).catch(() => {})
                  toast({
                    title: 'Share code copied',
                    description: `Anyone can load ${t.name} from it.`,
                  })
                }}
              >
                Copy share code
              </Button>
              <Button
                size="sm"
                icon="delete"
                variant="ghost"
                aria-label={`Delete ${t.name}`}
                onClick={() => remove.run(t.id).then(() => toast({ title: `${t.name} deleted` }))}
              />
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ThemeEditor
          key={editing.id}
          theme={editing}
          isNew={!themes.some((t) => t.id === editing.id)}
          onDone={() => setEditing(null)}
        />
      ) : (
        <Button
          icon="add"
          className="justify-self-start"
          onClick={() =>
            setEditing({
              id: `theme-${Date.now().toString(36)}`,
              name: '',
              base: 'default',
              accent: '#d6cfc2',
            })
          }
        >
          New theme
        </Button>
      )}
    </Group>
  )
}

/** Name, base, accent and the one override worth exposing, with the contrast audit and codes. */
function ThemeEditor({
  theme,
  isNew,
  onDone,
}: {
  theme: CustomTheme
  isNew: boolean
  onDone: () => void
}) {
  const [input, setInput] = useState(theme)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const save = useAction((c, t: CustomTheme) => c.appearance.saveTheme(t))
  const build = useMemo(() => {
    try {
      return createTheme({ ...input, id: 'editor', colors: input.colors })
    } catch {
      return null
    }
  }, [input])
  const failing = build?.audit.results.filter((r) => !r.pass) ?? []
  const fix = (role: ThemeableRole) => {
    const v = nearestPassing({ ...input, colors: input.colors }, role)
    if (v) setInput((i) => ({ ...i, colors: { ...i.colors, [role]: v } }))
  }
  const nameError = !input.name.trim() ? 'Give the theme a name.' : undefined
  return (
    <section
      aria-label={isNew ? 'New theme' : `Edit ${theme.name}`}
      className="grid gap-4 rounded-md border border-line-strong bg-s2 p-4 expanded:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
    >
      {build && <style>{themeCss(build.theme, '[data-theme="editor"]')}</style>}
      <div className="grid content-start gap-4">
        <Field label="Name" error={nameError}>
          <Input
            value={input.name}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
          />
        </Field>
        <Field label="Based on">
          <Select
            value={input.base}
            onValueChange={(v) => setInput({ ...input, base: v as BuiltInThemeId })}
            options={builtIns.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Field>
        <Field label="Accent" hint="The rest of the accent family is generated to pass contrast.">
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Theme accent color"
              value={hex(build ? input.accent : '#d6cfc2')}
              onChange={(e) => setInput({ ...input, accent: e.target.value, colors: undefined })}
              className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s1 p-1"
            />
            <Input
              aria-label="Theme accent value"
              value={input.accent}
              onChange={(e) => setInput({ ...input, accent: e.target.value })}
              className="font-mono"
            />
          </div>
        </Field>
        <Field
          label="Quiet text"
          hint="Captions and timestamps (text-3). Too dark fails the audit."
        >
          <div className="flex gap-2">
            <input
              type="color"
              aria-label="Quiet text color"
              value={hex(build?.theme.colors['text-3'] ?? '#a2a2a7')}
              onChange={(e) =>
                setInput({ ...input, colors: { ...input.colors, 'text-3': e.target.value } })
              }
              className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s1 p-1"
            />
            <Button
              variant="ghost"
              disabled={!input.colors}
              onClick={() => setInput({ ...input, colors: undefined })}
            >
              Reset
            </Button>
          </div>
        </Field>
        <div className="grid gap-2 rounded-md bg-s1 p-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text text-ui">Contrast</span>
            {build ? (
              <Badge tone={build.audit.pass ? 'success' : 'danger'}>
                {build.audit.pass ? 'Passes' : `${failing.length} failing`}
              </Badge>
            ) : (
              <Badge tone="danger">Not a color</Badge>
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
          {build && !build.audit.pass && (
            <p className="text-caption text-text-3">
              Themes that fail can’t be saved: someone would struggle to read them.
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Field label="Load a share code" error={codeError ?? undefined}>
            <div className="flex gap-2">
              <Input
                placeholder="hs1.…"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono"
              />
              <Button
                onClick={() => {
                  try {
                    const t = decodeTheme(code)
                    setInput({
                      ...input,
                      name: t.name ?? input.name,
                      base: t.base ?? input.base,
                      accent: t.accent ?? input.accent,
                      colors: t.colors,
                    })
                    setCodeError(null)
                  } catch (e) {
                    setCodeError((e as Error).message)
                  }
                }}
              >
                Load
              </Button>
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!build?.audit.pass || !!nameError}
            loading={save.pending}
            onClick={() =>
              save.run(input).then(() => {
                toast.success(`${input.name} saved`, {
                  description: 'Pick it as the default, or people can choose it themselves.',
                })
                onDone()
              })
            }
          >
            {isNew ? 'Add theme' : 'Save theme'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
      <ThemeSample />
    </section>
  )
}

/** The product in miniature, in the theme being edited. */
function ThemeSample() {
  const titles = useQuery('appearance:titles', (c) => c.library.list())
  return (
    <div data-theme="editor" className="rounded-md">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 rounded-md bg-bg p-4 text-text">
        <div className="flex flex-wrap items-center gap-2">
          <Mark size={22} />
          <span className="font-semibold text-ui">Harbor</span>
          <span className="flex-1" />
          <Badge tone="accent">New</Badge>
        </div>
        <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2">
          {(titles.data ?? []).slice(0, 4).map((m) => (
            <img
              key={m.id}
              src={m.art.poster}
              alt=""
              className="aspect-poster w-full rounded-poster object-cover"
            />
          ))}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1 [overflow-wrap:anywhere]">
          <p className="font-semibold text-title">Sintel</p>
          <p className="text-caption text-text-3">2010 · 15m · Fantasy</p>
          <p className="text-body text-text-2">
            A lone traveler searches the frozen highlands for the young dragon she raised and lost.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="play" tabIndex={-1}>
            Play
          </Button>
          <Button tabIndex={-1}>Details</Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sounds

const soundLabels: Record<SoundEvent, string> = {
  navigate: 'Move',
  select: 'Select',
  back: 'Back',
  success: 'Done',
  error: 'Error',
  notify: 'Notice',
  arrival: 'Arrival',
}

function Sounds({
  value,
  onChange,
}: {
  value: SoundDefaults
  onChange: (s: SoundDefaults) => void
}) {
  const player = useSoundPlayer()
  useEffect(() => player?.setVolume(value.volume), [player, value.volume])
  const toggle = (key: 'tv' | 'phone' | 'web', label: string, hint: string) => (
    <Field inline label={label} hint={hint}>
      <Switch checked={value[key]} onCheckedChange={(on) => onChange({ ...value, [key]: on })} />
    </Field>
  )
  return (
    <Group
      title="Sounds"
      description="Where the apps play their interface sounds until someone changes it on their device. Never over a film."
    >
      <div className="grid gap-3">
        {toggle('tv', 'TVs', 'On by default: sound confirms each press of the remote.')}
        {toggle('phone', 'Phones and tablets', 'Off by default: phones have haptics.')}
        {toggle('web', 'Web and desktop', 'Off by default.')}
      </div>
      <div className="grid gap-4 medium:grid-cols-2">
        <Field label="Volume" hint={`${Math.round(value.volume * 100)}%`}>
          <input
            type="range"
            aria-label="Volume"
            aria-valuetext={`${Math.round(value.volume * 100)}%`}
            min={0}
            max={1}
            step={0.05}
            value={value.volume}
            onChange={(e) => onChange({ ...value, volume: Number(e.target.value) })}
            className="h-(--size-input) w-full cursor-pointer accent-accent-fill"
          />
        </Field>
        <Field label="Sound pack" hint="More packs come with the catalog.">
          <Select
            value={value.pack}
            onValueChange={(pack) => onChange({ ...value, pack })}
            options={[{ value: 'felt', label: 'Felt and wood' }]}
          />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="font-medium text-text text-ui">Listen</span>
        <div className="flex flex-wrap gap-1.5">
          {SOUND_EVENTS.map((e) => (
            <Button key={e} size="sm" icon="sound" onClick={() => player?.play(e, { force: true })}>
              {soundLabels[e]}
            </Button>
          ))}
        </div>
      </div>
    </Group>
  )
}
