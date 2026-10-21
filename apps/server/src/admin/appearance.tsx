'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A12 Appearance (docs/product/appearance.md), ported from the prototype: what every app inherits
// from the server. The name, mark and accent; the default theme, and custom themes built with the
// theme engine's editor (contrast audited, shareable by code); and sound defaults per kind of app.
// The identity, default theme, sounds and mark are one draft behind the save bar; themes save on
// their own.
import type {
  Appearance as AppearanceData,
  CustomTheme,
  SoundDefaults,
} from '@highsea/api-contract'
import { art, titles } from '@highsea/fixtures'
import { useLocale, useT } from '@highsea/i18n/react'
import { useAction, useQuery } from '@highsea/sdk/react'
import {
  type BuiltInThemeId,
  builtInThemes,
  type ColorRole,
  createTheme,
  decodeTheme,
  defaultSoundPack,
  encodeTheme,
  formatHex,
  nearestPassing,
  parseColor,
  SOUND_EVENTS,
  type SoundPack,
  type ThemeableRole,
  themeCss,
} from '@highsea/tokens'
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
} from '@highsea/ui-web'
import { useEffect, useMemo, useState } from 'react'
import { appearance as messages } from './appearance-messages.ts'
import { toBase64 } from './base64.ts'
import { Loadable } from './loadable.tsx'
import { AreaPage, Group, SaveBar } from './settings.tsx'

const hex = (c: string) => formatHex(parseColor(c)).slice(0, 7)

/** 1 MB, the server's limit (appearance.md › Data). */
const MARK_MAX_BYTES = 1_000_000
const MARK_TYPES = ['image/svg+xml', 'image/png']

/** The mark in the draft: as saved, a new file, or back to the highsea mark. */
type MarkDraft =
  | { kind: 'keep' }
  | { kind: 'upload'; data: string; preview: string }
  | { kind: 'remove' }

/** The contrast audit's checks, named by the role they measure. */
type CheckKey = Extract<keyof typeof messages, `check.${string}`>

type Draft = {
  name: string
  accent: string | null
  defaultTheme: string
  sound: SoundDefaults
}

export function Appearance() {
  const t = useT(messages)
  const data = useQuery('appearance', (c) => c.appearance.get(), ['server.updated'])
  return (
    <AreaPage id="appearance">
      <Loadable query={data} what={t('what')}>
        {(a) => <Form loaded={a} />}
      </Loadable>
    </AreaPage>
  )
}

function Form({ loaded }: { loaded: AppearanceData }) {
  const t = useT(messages)
  const initial: Draft = {
    name: loaded.branding.name,
    accent: loaded.branding.accent,
    defaultTheme: loaded.defaultTheme,
    sound: loaded.sound,
  }
  const [draft, setDraft] = useState(initial)
  const [mark, setMark] = useState<MarkDraft>({ kind: 'keep' })
  const save = useAction((c, d: Draft) => c.appearance.save({ body: d }))
  const uploadMark = useAction((c, data: string) => c.appearance.uploadMark({ body: { data } }))
  const removeMark = useAction((c) => c.appearance.removeMark())
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial) || mark.kind !== 'keep'
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const submit = async () => {
    try {
      await save.run(draft)
      if (mark.kind === 'upload') await uploadMark.run(mark.data)
      if (mark.kind === 'remove') await removeMark.run()
    } catch (e) {
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    setMark({ kind: 'keep' })
    toast.success(t('saved'), { description: t('savedBody') })
  }

  return (
    <>
      <Identity
        draft={draft}
        set={set}
        mark={mark}
        setMark={setMark}
        current={loaded.branding.mark}
      />
      <Themes
        themes={loaded.themes}
        value={draft.defaultTheme}
        onChange={(defaultTheme) => set({ defaultTheme })}
      />
      <Sounds value={draft.sound} packs={loaded.packs} onChange={(sound) => set({ sound })} />
      <SaveBar
        dirty={dirty}
        saving={save.pending || uploadMark.pending || removeMark.pending}
        onDiscard={() => {
          setDraft(initial)
          setMark({ kind: 'keep' })
        }}
        onSave={submit}
      />
    </>
  )
}

// ---------------------------------------------------------------- identity

function Identity({
  draft,
  set,
  mark,
  setMark,
  current,
}: {
  draft: { name: string; accent: string | null }
  set: (p: { name?: string; accent?: string | null }) => void
  mark: MarkDraft
  setMark: (m: MarkDraft) => void
  /** Where the saved mark is served; null for the highsea mark. */
  current: string | null
}) {
  const t = useT(messages)
  const [markError, setMarkError] = useState<string | null>(null)
  // a fresh input after Discard or Save, so the chosen file's name doesn't linger
  const [inputKey, setInputKey] = useState(0)
  useEffect(() => {
    if (mark.kind === 'keep') setInputKey((k) => k + 1)
  }, [mark.kind])
  useEffect(
    () => (mark.kind === 'upload' ? () => URL.revokeObjectURL(mark.preview) : undefined),
    [mark],
  )
  const audit = useMemo(() => {
    if (!draft.accent) return null
    try {
      return createTheme({ accent: draft.accent }).audit
    } catch {
      return undefined
    }
  }, [draft.accent])
  const shown = mark.kind === 'upload' ? mark.preview : mark.kind === 'remove' ? null : current

  const choose = async (file: File | undefined) => {
    if (!file) return
    if (!MARK_TYPES.includes(file.type)) return setMarkError(t('identity.markType'))
    if (file.size > MARK_MAX_BYTES) return setMarkError(t('identity.markTooBig'))
    setMarkError(null)
    setMark({ kind: 'upload', data: await toBase64(file), preview: URL.createObjectURL(file) })
  }

  return (
    <Group title={t('identity.title')} description={t('identity.description')}>
      <div className="grid gap-4 expanded:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="grid content-start gap-4">
          <Field
            label={t('identity.name')}
            error={!draft.name.trim() ? t('identity.nameRequired') : undefined}
          >
            <Input
              value={draft.name}
              maxLength={40}
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          <Field
            label={t('identity.mark')}
            hint={t('identity.markHint')}
            error={markError ?? undefined}
          >
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={inputKey}
                type="file"
                accept={MARK_TYPES.join(',')}
                aria-label={t('identity.markUpload')}
                onChange={(e) => choose(e.target.files?.[0])}
                className="max-w-full text-caption text-text-2 file:me-3 file:cursor-pointer file:rounded-md file:border file:border-line-strong file:bg-s2 file:px-3 file:py-1.5 file:text-text file:text-ui"
              />
              {shown && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setMark(current ? { kind: 'remove' } : { kind: 'keep' })}
                >
                  {t('identity.markDefault')}
                </Button>
              )}
            </div>
          </Field>
          <div className="grid gap-2">
            <Field inline label={t('identity.useAccent')} hint={t('identity.useAccentHint')}>
              <Switch
                checked={draft.accent !== null}
                onCheckedChange={(on) => set({ accent: on ? '#8fbfb7' : null })}
              />
            </Field>
            {draft.accent !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="color"
                  aria-label={t('identity.accentColor')}
                  value={hex(audit === undefined ? '#8fbfb7' : draft.accent)}
                  onChange={(e) => set({ accent: e.target.value })}
                  className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s2 p-1"
                />
                <Input
                  aria-label={t('identity.accentValue')}
                  value={draft.accent}
                  onChange={(e) => set({ accent: e.target.value })}
                  className="w-32 font-mono"
                />
                {audit === undefined ? (
                  <Badge tone="danger">{t('notAColor')}</Badge>
                ) : audit?.pass ? (
                  <Badge tone="success">{t('accent.passes')}</Badge>
                ) : (
                  <Badge tone="warning">{t('accent.adjusted')}</Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <figure className="grid content-start gap-2">
          <figcaption className="font-mono text-label text-text-3 uppercase">
            {t('identity.preview')}
          </figcaption>
          <div className="flex items-center gap-2.5 rounded-md border border-line bg-bg p-3">
            {shown ? (
              // biome-ignore lint/performance/noImgElement: a blob preview or the served mark, which next/image can't optimize
              <img src={shown} alt="" className="size-7 rounded-sm object-contain" />
            ) : (
              <Mark size={28} />
            )}
            <span className="truncate font-semibold text-text text-ui">
              {draft.name || t('identity.placeholder')}
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
  const t = useT(messages)
  const [editing, setEditing] = useState<CustomTheme | null>(null)
  const remove = useAction((c, id: string) => c.appearance.deleteTheme({ params: { id } }))
  const css = useMemo(
    () =>
      themes
        .map((th) => {
          try {
            return themeCss(createTheme({ ...th, id: th.id }).theme, `[data-theme="${th.id}"]`)
          } catch {
            return ''
          }
        })
        .join('\n'),
    [themes],
  )
  const all = [
    ...builtIns.map((th) => ({ ...th, custom: false })),
    ...themes.map((th) => ({ id: th.id, name: th.name, custom: true })),
  ]
  return (
    <Group title={t('themes.title')} description={t('themes.description')}>
      <style>{css}</style>
      <fieldset className="grid gap-2">
        <legend className="sr-only">{t('themes.legend')}</legend>
        <div className="grid gap-2 medium:grid-cols-2 wide:grid-cols-3">
          {all.map((th) => (
            <label
              key={th.id}
              className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line bg-s2 p-3 has-checked:border-accent has-focus-visible:ring-focus"
            >
              <input
                type="radio"
                name="default-theme"
                value={th.id}
                checked={value === th.id}
                onChange={() => onChange(th.id)}
                className="size-4 accent-accent-fill"
              />
              <span className="grid min-w-0">
                <span className="truncate text-text text-ui">{th.name}</span>
                <span className="text-caption text-text-3">
                  {value === th.id
                    ? t('themes.default')
                    : th.custom
                      ? t('themes.custom')
                      : t('themes.builtIn')}
                </span>
              </span>
              {swatches(th.id)}
            </label>
          ))}
        </div>
      </fieldset>
      {themes.length > 0 && (
        <ul aria-label={t('themes.list')} className="grid gap-2">
          {themes.map((th) => (
            <li
              key={th.id}
              className="flex flex-wrap items-center gap-2 border-line border-t pt-2 text-ui"
            >
              <span className="me-auto text-text">{th.name}</span>
              <Button size="sm" icon="edit" onClick={() => setEditing(th)}>
                {t('themes.edit')}
              </Button>
              <Button
                size="sm"
                icon="copy"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(encodeTheme(th)).catch(() => {})
                  toast({
                    title: t('themes.copied'),
                    description: t('themes.copiedBody', { theme: th.name }),
                  })
                }}
              >
                {t('themes.copy')}
              </Button>
              <Button
                size="sm"
                icon="delete"
                variant="ghost"
                aria-label={t('themes.delete', { theme: th.name })}
                onClick={() =>
                  remove
                    .run(th.id)
                    .then(() => {
                      // the server puts the default back to Abyss Neutral; the draft follows
                      if (value === th.id) onChange('default')
                      toast({ title: t('themes.deleted', { theme: th.name }) })
                    })
                    .catch((e: Error) =>
                      toast.error(t('themes.deleteError', { theme: th.name }), {
                        description: e.message,
                      }),
                    )
                }
              />
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <ThemeEditor
          key={editing.id}
          theme={editing}
          isNew={!themes.some((th) => th.id === editing.id)}
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
          {t('themes.new')}
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
  const t = useT(messages)
  const [input, setInput] = useState(theme)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const save = useAction((c, { id, ...body }: CustomTheme) =>
    c.appearance.saveTheme({ params: { id }, body }),
  )
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
  const nameError = !input.name.trim() ? t('editor.nameRequired') : undefined
  const checkLabel = (fg: ColorRole) => t(`check.${fg}` as CheckKey)
  return (
    <section
      aria-label={isNew ? t('themes.new') : t('editor.editing', { theme: theme.name })}
      className="grid gap-4 rounded-md border border-line-strong bg-s2 p-4 expanded:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]"
    >
      {build && <style>{themeCss(build.theme, '[data-theme="editor"]')}</style>}
      <div className="grid content-start gap-4">
        <Field label={t('editor.name')} error={nameError}>
          <Input
            value={input.name}
            maxLength={40}
            onChange={(e) => setInput({ ...input, name: e.target.value })}
          />
        </Field>
        <Field label={t('editor.base')}>
          <Select
            value={input.base}
            onValueChange={(v) => setInput({ ...input, base: v as BuiltInThemeId })}
            options={builtIns.map((th) => ({ value: th.id, label: th.name }))}
          />
        </Field>
        <Field label={t('editor.accent')} hint={t('editor.accentHint')}>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label={t('editor.accentColor')}
              value={hex(build ? input.accent : '#d6cfc2')}
              onChange={(e) => setInput({ ...input, accent: e.target.value, colors: undefined })}
              className="h-(--size-input) w-12 cursor-pointer rounded-md border border-line-strong bg-s1 p-1"
            />
            <Input
              aria-label={t('editor.accentValue')}
              value={input.accent}
              onChange={(e) => setInput({ ...input, accent: e.target.value })}
              className="font-mono"
            />
          </div>
        </Field>
        <Field label={t('editor.quiet')} hint={t('editor.quietHint')}>
          <div className="flex gap-2">
            <input
              type="color"
              aria-label={t('editor.quietColor')}
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
              {t('editor.reset')}
            </Button>
          </div>
        </Field>
        <div className="grid gap-2 rounded-md bg-s1 p-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <span className="font-medium text-text text-ui">{t('editor.contrast')}</span>
            {build ? (
              <Badge tone={build.audit.pass ? 'success' : 'danger'}>
                {build.audit.pass
                  ? t('editor.passes')
                  : t('editor.failing', { count: failing.length })}
              </Badge>
            ) : (
              <Badge tone="danger">{t('notAColor')}</Badge>
            )}
          </div>
          {failing.map((r) => (
            <div key={r.fg} className="flex items-center justify-between gap-2 text-ui">
              <span>
                {checkLabel(r.fg)}{' '}
                <span className="font-mono text-figure text-text-3">
                  Lc {Math.round(r.lc)} / {r.min}
                </span>
              </span>
              {r.fg !== 'on-danger' && !r.fg.startsWith('badge') && (
                <Button size="sm" variant="ghost" onClick={() => fix(r.fg as ThemeableRole)}>
                  {t('editor.fix')}
                </Button>
              )}
            </div>
          ))}
          {build && !build.audit.pass && (
            <p className="text-caption text-text-3">{t('editor.failNote')}</p>
          )}
        </div>
        <div className="grid gap-2">
          <Field label={t('editor.code')} error={codeError ?? undefined}>
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
                    const th = decodeTheme(code)
                    setInput({
                      ...input,
                      name: th.name ?? input.name,
                      base: th.base ?? input.base,
                      accent: th.accent ?? input.accent,
                      colors: th.colors,
                    })
                    setCodeError(null)
                  } catch {
                    setCodeError(t('editor.codeError'))
                  }
                }}
              >
                {t('editor.load')}
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
              save
                .run(input)
                .then(() => {
                  toast.success(t('editor.saved', { theme: input.name }), {
                    description: t('editor.savedBody'),
                  })
                  onDone()
                })
                .catch((e: Error) => toast.error(t('saveError'), { description: e.message }))
            }
          >
            {isNew ? t('editor.add') : t('editor.save')}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            {t('editor.cancel')}
          </Button>
        </div>
      </div>
      <ThemeSample />
    </section>
  )
}

/** The product in miniature, in the theme being edited, with the design system's sample titles. */
function ThemeSample() {
  const t = useT(messages)
  const [lead] = titles
  return (
    <div data-theme="editor" className="rounded-md">
      <div className="grid gap-4 rounded-md bg-bg p-4 text-text">
        <div className="flex items-center gap-2">
          <Mark size={22} />
          <span className="font-semibold text-ui">Harbor</span>
          <span className="flex-1" />
          <Badge tone="accent">{t('sample.badge')}</Badge>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {titles.slice(0, 4).map((m) => (
            // biome-ignore lint/performance/noImgElement: generated SVG data URLs, nothing to optimize
            <img
              key={m.id}
              src={art(m).poster}
              alt=""
              className="aspect-poster w-full rounded-poster object-cover"
            />
          ))}
        </div>
        {lead && (
          <div className="grid gap-1">
            <p className="font-semibold text-title">{lead.title}</p>
            <p className="text-caption text-text-3">
              {lead.year} · {lead.runtime} · {lead.genre}
            </p>
            <p className="text-body text-text-2">{lead.synopsis}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon="play" tabIndex={-1}>
            {t('sample.play')}
          </Button>
          <Button tabIndex={-1}>{t('sample.details')}</Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sounds

function Sounds({
  value,
  packs,
  onChange,
}: {
  value: SoundDefaults
  packs: AppearanceData['packs']
  onChange: (s: SoundDefaults) => void
}) {
  const t = useT(messages)
  const locale = useLocale()
  const player = useSoundPlayer()
  const { run: recipe } = useAction((c, id: string) => c.appearance.soundPack({ params: { id } }))
  useEffect(() => player?.setVolume(value.volume), [player, value.volume])
  // Listen plays the chosen pack: the built-in one is in the design system, others come from here
  useEffect(() => {
    if (!player) return
    if (value.pack === defaultSoundPack.id) {
      player.setPack(defaultSoundPack)
      return
    }
    recipe(value.pack)
      .then((p) => player.setPack(p as unknown as SoundPack))
      .catch(() => player.setPack(defaultSoundPack))
  }, [player, recipe, value.pack])
  const percent = new Intl.NumberFormat(locale, { style: 'percent' }).format(value.volume)
  const toggle = (key: 'tv' | 'phone' | 'web') => (
    <Field inline label={t(`sounds.${key}`)} hint={t(`sounds.${key}Hint`)}>
      <Switch checked={value[key]} onCheckedChange={(on) => onChange({ ...value, [key]: on })} />
    </Field>
  )
  return (
    <Group title={t('sounds.title')} description={t('sounds.description')}>
      <div className="grid gap-3">
        {toggle('tv')}
        {toggle('phone')}
        {toggle('web')}
      </div>
      <div className="grid gap-4 medium:grid-cols-2">
        <Field label={t('sounds.volume')} hint={percent}>
          <input
            type="range"
            aria-label={t('sounds.volume')}
            aria-valuetext={percent}
            min={0}
            max={1}
            step={0.05}
            value={value.volume}
            onChange={(e) => onChange({ ...value, volume: Number(e.target.value) })}
            className="h-(--size-input) w-full cursor-pointer accent-accent-fill"
          />
        </Field>
        <Field label={t('sounds.pack')} hint={t('sounds.packHint')}>
          <Select
            value={value.pack}
            onValueChange={(pack) => onChange({ ...value, pack })}
            options={packs.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </div>
      <div className="grid gap-2">
        <span className="font-medium text-text text-ui">{t('sounds.listen')}</span>
        <div className="flex flex-wrap gap-1.5">
          {SOUND_EVENTS.map((e) => (
            <Button key={e} size="sm" icon="sound" onClick={() => player?.play(e, { force: true })}>
              {t(`sound.${e}`)}
            </Button>
          ))}
        </div>
      </div>
    </Group>
  )
}
