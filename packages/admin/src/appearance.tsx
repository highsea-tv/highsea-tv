'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// A12 Appearance (docs/product/appearance.md), ported from the prototype: what every app inherits
// from the server. The name, mark and accent; the default theme, and custom themes built with the
// theme engine's editor (contrast audited, shareable by code); and sound defaults per kind of app.
// The identity, default theme, sounds and mark are one draft behind the save bar; themes save on
// their own. Drawn with the library's native renderer since D3 (one-client-platform-d.md): the
// themes' colours come from each theme resolved for React Native (`toNativeTheme`), and the
// editor's sample is drawn inside a ThemeProvider of the theme being edited, where the web set
// `data-theme` over CSS made by `themeCss`.
import type {
  Appearance as AppearanceData,
  CustomTheme,
  SoundDefaults,
} from '@highsea-tv/api-contract'
import { art, titles } from '@highsea-tv/fixtures'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import {
  type BuiltInThemeId,
  breakpoints,
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
} from '@highsea-tv/tokens'
import { type NativeTheme, nativeTokens, toNativeTheme } from '@highsea-tv/tokens/native'
import {
  Badge,
  Button,
  ColorWell,
  createSoundPlayer,
  Field,
  Icon,
  Image,
  Input,
  Mark,
  Press,
  RadioMark,
  Select,
  Slider,
  Switch,
  Text,
  ThemeProvider,
  toast,
  tokens,
  useTheme,
  useWindowAtLeast,
} from '@highsea-tv/ui/native'
import { useEffect, useMemo, useState } from 'react'
import { View, type ViewStyle } from 'react-native'
import { appearance as messages } from './appearance-messages.ts'
import { toBase64 } from './base64.ts'
import { Loadable } from './loadable.tsx'
import { pickFile } from './pick-file.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { Line, Note, WRAP_ANYWHERE } from './settings-card.tsx'
import { Columns } from './settings-columns.tsx'

const s = tokens.space
const ui = tokens.adminText.ui
const figure = tokens.adminText.figure
/** The preview's column beside the identity's fields from expanded widths (the web's 16rem). */
const PREVIEW_WIDTH = 256
/** The editor's fields' column beside its sample from expanded widths (the web's 20rem). */
const EDITOR_FIELDS_WIDTH = 320
/** The hex value's field beside the colour well (the web's w-32). */
const HEX_WIDTH = 128
/** The code's field before Load wraps below it (the web's basis-48). */
const CODE_BASIS = 192
/** The preview's mark, and the sample's. */
const PREVIEW_MARK = 28
const SAMPLE_MARK = 22
const [POSTER_W, POSTER_H] = tokens.aspect.poster

const hex = (c: string) => formatHex(parseColor(c)).slice(0, 7)

/** 1 MB, the server's limit (appearance.md › Data). */
const MARK_MAX_BYTES = 1_000_000
const MARK_TYPES = ['image/svg+xml', 'image/png']

/** The mark in the draft: as saved, a new file, or back to the highsea mark. */
type MarkDraft =
  | { kind: 'keep' }
  | { kind: 'upload'; data: string; preview: string; file: string }
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

/** A colour well and its hex value side by side (the accent's, the editor's). */
function ColorPair({
  well,
  value,
  onWell,
  onValue,
  wellLabel,
  valueLabel,
  fill,
}: {
  well: string
  value: string
  onWell: (v: string) => void
  onValue: (v: string) => void
  wellLabel: string
  valueLabel: string
  /** The value's field fills the row (the editor), or keeps the web's w-32 (the identity). */
  fill?: boolean
}) {
  return (
    <>
      <ColorWell aria-label={wellLabel} value={well} onChange={onWell} />
      <View style={fill ? { flex: 1, minWidth: 0 } : { width: HEX_WIDTH }}>
        <Input aria-label={valueLabel} mono value={value} onChangeText={onValue} />
      </View>
    </>
  )
}

const row: ViewStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }

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
  const { colors } = useTheme()
  const beside = useWindowAtLeast(breakpoints.expanded)
  const [markError, setMarkError] = useState<string | null>(null)
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

  const choose = async (file: File) => {
    if (!MARK_TYPES.includes(file.type)) return setMarkError(t('identity.markType'))
    if (file.size > MARK_MAX_BYTES) return setMarkError(t('identity.markTooBig'))
    setMarkError(null)
    setMark({
      kind: 'upload',
      data: await toBase64(file),
      preview: URL.createObjectURL(file),
      file: file.name,
    })
  }

  return (
    <Group title={t('identity.title')} description={t('identity.description')}>
      <View
        style={{
          flexDirection: beside ? 'row' : 'column',
          alignItems: beside ? 'flex-start' : 'stretch',
          gap: s['4'],
        }}
      >
        <View style={{ flex: beside ? 1 : undefined, minWidth: 0, gap: s['4'] }}>
          <Field
            label={t('identity.name')}
            error={!draft.name.trim() ? t('identity.nameRequired') : undefined}
          >
            <Input value={draft.name} maxLength={40} onChangeText={(name) => set({ name })} />
          </Field>
          <Field
            label={t('identity.mark')}
            hint={t('identity.markHint')}
            error={markError ?? undefined}
          >
            <View style={row}>
              <Button
                size="sm"
                icon="upload"
                onPress={() => pickFile(MARK_TYPES.join(','), (f) => void choose(f))}
              >
                {t('identity.markUpload')}
              </Button>
              {mark.kind === 'upload' ? (
                <Text size={ui.size} leading={ui.leading} color="text-2" style={WRAP_ANYWHERE}>
                  {mark.file}
                </Text>
              ) : null}
              {shown ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setMark(current ? { kind: 'remove' } : { kind: 'keep' })}
                >
                  {t('identity.markDefault')}
                </Button>
              ) : null}
            </View>
          </Field>
          <View style={{ gap: s['2'] }}>
            <Switch
              label={t('identity.useAccent')}
              hint={t('identity.useAccentHint')}
              checked={draft.accent !== null}
              onCheckedChange={(on) => set({ accent: on ? '#8fbfb7' : null })}
            />
            {draft.accent !== null ? (
              <View style={row}>
                <ColorPair
                  well={hex(audit ? draft.accent : '#8fbfb7')}
                  value={draft.accent}
                  onWell={(accent) => set({ accent })}
                  onValue={(accent) => set({ accent })}
                  wellLabel={t('identity.accentColor')}
                  valueLabel={t('identity.accentValue')}
                />
                {audit === undefined ? (
                  <Badge tone="danger">{t('notAColor')}</Badge>
                ) : audit?.pass ? (
                  <Badge tone="success">{t('accent.passes')}</Badge>
                ) : (
                  <Badge tone="warning">{t('accent.adjusted')}</Badge>
                )}
              </View>
            ) : null}
          </View>
        </View>
        <View
          role="figure"
          aria-label={t('identity.preview')}
          style={{ width: beside ? PREVIEW_WIDTH : undefined, gap: s['2'] }}
        >
          <Text variant="label" color="text-3" aria-hidden>
            {t('identity.preview')}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s['2'] + s['0.5'],
              padding: s['3'],
              borderRadius: tokens.radius.md,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.bg,
            }}
          >
            {shown ? (
              <Image
                source={{ uri: shown }}
                contentFit="contain"
                style={{
                  width: PREVIEW_MARK,
                  height: PREVIEW_MARK,
                  borderRadius: tokens.radius.sm,
                }}
              />
            ) : (
              <Mark size={PREVIEW_MARK} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text size={ui.size} leading={ui.leading} weight={600} numberOfLines={1}>
                {draft.name || t('identity.placeholder')}
              </Text>
            </View>
            <Icon name="chevron-down" size={14} color="text-3" />
          </View>
        </View>
      </View>
    </Group>
  )
}

// ---------------------------------------------------------------- themes

const builtIns = Object.values(builtInThemes).map((t) => ({ id: t.id, name: t.name }))

/** A custom theme resolved for React Native, or nothing when its colours don't parse. */
function resolve(th: CustomTheme): NativeTheme | null {
  try {
    return toNativeTheme(createTheme({ ...th, id: th.id }).theme)
  } catch {
    return null
  }
}

/** Four dots of a theme's colours, each ringed in the page's strong line. */
function Swatches({ theme }: { theme: NativeTheme | null }) {
  const { colors } = useTheme()
  if (!theme) return null
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: s['1'] }}
    >
      {(['bg', 's2', 'text-2', 'accent'] as const).map((r) => (
        <View
          key={r}
          style={{
            width: s['4'],
            height: s['4'],
            borderRadius: tokens.radius.pill,
            borderWidth: 1,
            borderColor: colors['line-strong'],
            backgroundColor: theme.colors[r],
          }}
        />
      ))}
    </View>
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
  const { colors } = useTheme()
  const medium = useWindowAtLeast(breakpoints.medium)
  const wide = useWindowAtLeast(breakpoints.wide)
  const [editing, setEditing] = useState<CustomTheme | null>(null)
  const remove = useAction((c, id: string) => c.appearance.deleteTheme({ params: { id } }))
  const all = useMemo(
    () => [
      ...builtIns.map((th) => ({
        ...th,
        custom: false,
        theme: (nativeTokens.themes as Record<string, NativeTheme>)[th.id] ?? null,
      })),
      ...themes.map((th) => ({ id: th.id, name: th.name, custom: true, theme: resolve(th) })),
    ],
    [themes],
  )
  const columns = wide ? 3 : medium ? 2 : 1
  return (
    <Group title={t('themes.title')} description={t('themes.description')}>
      <View
        accessibilityRole="radiogroup"
        aria-label={t('themes.legend')}
        style={
          {
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: s['2'],
          } as unknown as ViewStyle
        }
      >
        {all.map((th) => {
          const chosen = value === th.id
          const detail = chosen
            ? t('themes.default')
            : th.custom
              ? t('themes.custom')
              : t('themes.builtIn')
          return (
            <Press
              key={th.id}
              // the card is the radio, its mark inside (a radio's children are presentational)
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={th.name}
              onPress={() => onChange(th.id)}
              style={{
                height: '100%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: s['3'],
                padding: s['3'],
                borderWidth: 1,
                borderRadius: tokens.radius.md,
                borderColor: chosen ? colors.accent : colors.line,
                backgroundColor: colors.s2,
              }}
            >
              <RadioMark checked={chosen} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text size={ui.size} leading={ui.leading} numberOfLines={1}>
                  {th.name}
                </Text>
                <Text variant="caption" color="text-3">
                  {detail}
                </Text>
              </View>
              <Swatches theme={th.theme} />
            </Press>
          )
        })}
      </View>
      {themes.length > 0 ? (
        <View role="list" aria-label={t('themes.list')} style={{ gap: s['2'] }}>
          {themes.map((th) => (
            <View
              key={th.id}
              role="listitem"
              style={{
                ...row,
                borderTopWidth: 1,
                borderColor: colors.line,
                paddingTop: s['2'],
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Line>{th.name}</Line>
              </View>
              <Button size="sm" icon="edit" onPress={() => setEditing(th)}>
                {t('themes.edit')}
              </Button>
              <Button
                size="sm"
                icon="copy"
                variant="ghost"
                onPress={() => {
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
                accessibilityLabel={t('themes.delete', { theme: th.name })}
                onPress={() =>
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
            </View>
          ))}
        </View>
      ) : null}
      {editing ? (
        <ThemeEditor
          key={editing.id}
          theme={editing}
          isNew={!themes.some((th) => th.id === editing.id)}
          onDone={() => setEditing(null)}
        />
      ) : (
        <View style={{ flexDirection: 'row' }}>
          <Button
            icon="add"
            onPress={() =>
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
        </View>
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
  const { colors } = useTheme()
  const beside = useWindowAtLeast(breakpoints.expanded)
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
  const sample = useMemo(() => (build ? toNativeTheme(build.theme) : null), [build])
  const failing = build?.audit.results.filter((r) => !r.pass) ?? []
  const fix = (role: ThemeableRole) => {
    const v = nearestPassing({ ...input, colors: input.colors }, role)
    if (v) setInput((i) => ({ ...i, colors: { ...i.colors, [role]: v } }))
  }
  const nameError = !input.name.trim() ? t('editor.nameRequired') : undefined
  const checkLabel = (fg: ColorRole) => t(`check.${fg}` as CheckKey)
  const load = () => {
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
  }
  return (
    <View
      role="region"
      aria-label={isNew ? t('themes.new') : t('editor.editing', { theme: theme.name })}
      style={{
        flexDirection: beside ? 'row' : 'column',
        alignItems: beside ? 'flex-start' : 'stretch',
        gap: s['4'],
        padding: s['4'],
        borderRadius: tokens.radius.md,
        borderWidth: 1,
        borderColor: colors['line-strong'],
        backgroundColor: colors.s2,
      }}
    >
      <View style={{ width: beside ? EDITOR_FIELDS_WIDTH : undefined, minWidth: 0, gap: s['4'] }}>
        <Field label={t('editor.name')} error={nameError}>
          <Input
            value={input.name}
            maxLength={40}
            onChangeText={(name) => setInput({ ...input, name })}
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
          <View style={{ flexDirection: 'row', gap: s['2'] }}>
            <ColorPair
              fill
              well={hex(build ? input.accent : '#d6cfc2')}
              value={input.accent}
              onWell={(accent) => setInput({ ...input, accent, colors: undefined })}
              onValue={(accent) => setInput({ ...input, accent })}
              wellLabel={t('editor.accentColor')}
              valueLabel={t('editor.accentValue')}
            />
          </View>
        </Field>
        <Field label={t('editor.quiet')} hint={t('editor.quietHint')}>
          <View style={{ flexDirection: 'row', gap: s['2'] }}>
            <ColorWell
              aria-label={t('editor.quietColor')}
              value={hex(build?.theme.colors['text-3'] ?? '#a2a2a7')}
              onChange={(v) => setInput({ ...input, colors: { ...input.colors, 'text-3': v } })}
            />
            <Button
              variant="ghost"
              disabled={!input.colors}
              onPress={() => setInput({ ...input, colors: undefined })}
            >
              {t('editor.reset')}
            </Button>
          </View>
        </Field>
        <View
          aria-live="polite"
          style={{
            gap: s['2'],
            padding: s['3'],
            borderRadius: tokens.radius.md,
            backgroundColor: colors.s1,
          }}
        >
          <View style={{ ...row, justifyContent: 'space-between' }}>
            <Line weight={500}>{t('editor.contrast')}</Line>
            {build ? (
              <Badge tone={build.audit.pass ? 'success' : 'danger'}>
                {build.audit.pass
                  ? t('editor.passes')
                  : t('editor.failing', { count: failing.length })}
              </Badge>
            ) : (
              <Badge tone="danger">{t('notAColor')}</Badge>
            )}
          </View>
          {failing.map((r) => (
            <View key={r.fg} style={{ ...row, justifyContent: 'space-between' }}>
              <Text size={ui.size} leading={ui.leading}>
                {checkLabel(r.fg)}{' '}
                <Text mono size={figure.size} leading={figure.leading} color="text-3">
                  Lc {Math.round(r.lc)} / {r.min}
                </Text>
              </Text>
              {r.fg !== 'on-danger' && !r.fg.startsWith('badge') ? (
                <Button size="sm" variant="ghost" onPress={() => fix(r.fg as ThemeableRole)}>
                  {t('editor.fix')}
                </Button>
              ) : null}
            </View>
          ))}
          {build && !build.audit.pass ? <Note>{t('editor.failNote')}</Note> : null}
        </View>
        <Field label={t('editor.code')} error={codeError ?? undefined}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
            <View style={{ flexGrow: 1, flexBasis: CODE_BASIS, minWidth: 0 }}>
              <Input
                placeholder="hs1.…"
                mono
                value={code}
                onChangeText={setCode}
                onSubmitEditing={load}
              />
            </View>
            <Button onPress={load}>{t('editor.load')}</Button>
          </View>
        </Field>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}>
          <Button
            variant="primary"
            disabled={!build?.audit.pass || !!nameError}
            loading={save.pending}
            onPress={() =>
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
          <Button variant="ghost" onPress={onDone}>
            {t('editor.cancel')}
          </Button>
        </View>
      </View>
      <View style={{ flex: beside ? 1 : undefined, minWidth: 0 }}>
        {sample ? (
          <ThemeProvider theme={sample}>
            <ThemeSample />
          </ThemeProvider>
        ) : (
          <ThemeSample />
        )}
      </View>
    </View>
  )
}

/** The product in miniature, in the theme being edited, with the design system's sample titles. */
function ThemeSample() {
  const t = useT(messages)
  const { colors } = useTheme()
  const [lead] = titles
  return (
    <View
      style={{
        gap: s['4'],
        padding: s['4'],
        borderRadius: tokens.radius.md,
        backgroundColor: colors.bg,
      }}
    >
      <View style={row}>
        <Mark size={SAMPLE_MARK} />
        <Text size={ui.size} leading={ui.leading} weight={600}>
          Harbor
        </Text>
        <View style={{ flex: 1 }} />
        <Badge tone="accent">{t('sample.badge')}</Badge>
      </View>
      <View style={{ flexDirection: 'row', gap: s['2'] }}>
        {titles.slice(0, 4).map((m) => (
          <View key={m.id} style={{ flex: 1, minWidth: 0 }}>
            <Image
              source={{ uri: art(m).poster }}
              contentFit="cover"
              style={{
                width: '100%',
                aspectRatio: POSTER_W / POSTER_H,
                borderRadius: tokens.radius.poster,
              }}
            />
          </View>
        ))}
      </View>
      {lead ? (
        <View style={{ gap: s['1'] }}>
          <Text variant="title" weight={600} style={WRAP_ANYWHERE}>
            {lead.title}
          </Text>
          <Text variant="caption" color="text-3" style={WRAP_ANYWHERE}>
            {lead.year} · {lead.runtime} · {lead.genre}
          </Text>
          <Text variant="body" color="text-2" style={WRAP_ANYWHERE}>
            {lead.synopsis}
          </Text>
        </View>
      ) : null}
      {/* a picture of the product: its buttons are never reached by the keyboard */}
      <View
        aria-hidden
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['2'] }}
        {...({ inert: true } as object)}
      >
        <Button variant="primary" icon="play">
          {t('sample.play')}
        </Button>
        <Button>{t('sample.details')}</Button>
      </View>
    </View>
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
  // the page's own player for Listen, which plays even with sound off (the web renderer's came
  // from its SoundProvider; the native renderer has none, and the admin needs only previews)
  const [player] = useState(() => createSoundPlayer({ enabled: false }))
  useEffect(() => () => player.dispose(), [player])
  const { run: recipe } = useAction((c, id: string) => c.appearance.soundPack({ params: { id } }))
  useEffect(() => player.setVolume(value.volume), [player, value.volume])
  // Listen plays the chosen pack: the built-in one is in the design system, others come from here
  useEffect(() => {
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
    <Switch
      label={t(`sounds.${key}`)}
      hint={t(`sounds.${key}Hint`)}
      checked={value[key]}
      onCheckedChange={(on) => onChange({ ...value, [key]: on })}
    />
  )
  return (
    <Group title={t('sounds.title')} description={t('sounds.description')}>
      <View style={{ gap: s['3'] }}>
        {toggle('tv')}
        {toggle('phone')}
        {toggle('web')}
      </View>
      <Columns shares={[1, 1]}>
        <Field label={t('sounds.volume')} hint={percent}>
          <Slider
            label={t('sounds.volume')}
            valueText={percent}
            step={0.05}
            thumb={s['4']}
            value={value.volume}
            onChange={(volume) => onChange({ ...value, volume: Math.round(volume * 20) / 20 })}
          />
        </Field>
        <Field label={t('sounds.pack')} hint={t('sounds.packHint')}>
          <Select
            value={value.pack}
            onValueChange={(pack) => onChange({ ...value, pack })}
            options={packs.map((p) => ({ value: p.id, label: p.name }))}
          />
        </Field>
      </Columns>
      <View style={{ gap: s['2'] }}>
        <Line weight={500}>{t('sounds.listen')}</Line>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s['1'] + s['0.5'] }}>
          {SOUND_EVENTS.map((e) => (
            <Button key={e} size="sm" icon="sound" onPress={() => player.play(e, { force: true })}>
              {t(`sound.${e}`)}
            </Button>
          ))}
        </View>
      </View>
    </Group>
  )
}
