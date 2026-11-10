'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Settings › VPN (docs/product/vpn.md), ported from the signed-off prototype
// (design/prototypes/src/admin/settings/vpn.tsx): status first, with the checks; then how highsea
// connects, and what it does with the tunnel. The owner's only (ADR 0032's answers). The secrets,
// a WireGuard configuration, PIA's password and gluetun's API key, are write-only: the settings
// say whether one is set, and the draft holds a new one until Save. Built-in mode (highsea
// connects) is 6b's, so its card is shown as the prototype has it but can't be picked yet. The
// interfaces, providers and compose block come from the server, not the prototype's tables, and
// the prototype's "Drop the tunnel" button, which only drove the mock, is left out. Drawn with the
// library's native renderer since D3 (one-client-platform-d.md).
import type {
  VpnCheck,
  VpnInterface,
  VpnProvider,
  VpnSettings,
  VpnSettingsInput,
  VpnStatus,
} from '@highsea-tv/api-contract'
import type { T as Translate } from '@highsea-tv/i18n'
import { useT } from '@highsea-tv/i18n/react'
import { useAction, useQuery } from '@highsea-tv/sdk/react'
import type { ColorRole } from '@highsea-tv/tokens'
import { admin, line, wrapBasis } from '@highsea-tv/tokens'
import {
  Badge,
  type BadgeTone,
  Button,
  Disclosure,
  Field,
  Icon,
  type IconName,
  Input,
  Press,
  RadioMark,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
  tokens,
  useMotionReduced,
  useRegularWindow,
  useTheme,
} from '@highsea-tv/ui/native'
import { composeFor } from '@highsea-tv/vpn/compose'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Animated, Easing, ScrollView, View, type ViewStyle } from 'react-native'
import { Loadable } from './loadable.tsx'
import { pickFile } from './pick-file.ts'
import { AreaPage, Group, SaveBar } from './settings.tsx'
import { useRelative } from './time.ts'
import { vpn as messages } from './vpn-messages.ts'

const s = tokens.space
const ui = tokens.adminText.ui

/** Columns in a regular window (the web's `medium:grid-cols-N`), one below. */
function Columns({ count = 2, children }: { count?: number; children: ReactNode }) {
  const medium = useRegularWindow()
  return (
    <View
      style={
        {
          display: 'grid',
          gridTemplateColumns: medium ? `repeat(${count}, minmax(0, 1fr))` : 'minmax(0, 1fr)',
          gap: s['4'],
        } as unknown as ViewStyle
      }
    >
      {children}
    </View>
  )
}

/** A section under a line, as the web's `border-t pt-4`. */
function Section({ children }: { children: ReactNode }) {
  const theme = useTheme()
  return (
    <View
      style={{
        gap: s['4'],
        borderTopWidth: line.thin,
        borderColor: theme.colors.line,
        paddingTop: s['4'],
      }}
    >
      {children}
    </View>
  )
}

/**
 * The icon turning while the tunnel connects, held still when motion is reduced (the web's
 * `animate-spin motion-reduce:animate-none`), through React Native's Animated
 * (https://reactnative.dev/docs/animated#loop).
 */
function Spinning({ children }: { children: ReactNode }) {
  const reduced = useMotionReduced()
  const turn = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduced) return
    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [reduced, turn])
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>
}

type T = Translate<typeof messages>

/** The settings with the secrets the owner has typed and not yet saved. */
type Draft = VpnSettings & { config?: string; piaPassword?: string; containerKey?: string }
type Set = (patch: Partial<Draft>) => void

const MODES = ['builtin', 'container', 'interface', 'off'] as const

const CONTAINER_URL = /^https?:\/\/[^\s/]+/

/**
 * Compose for highsea connects: the lines highsea's own service needs for the tunnel, from the
 * one writer the guide uses too (`@highsea-tv/vpn/compose`; proposed in one-compose-file.md's B).
 */
const CONNECTS_LINES = composeFor({ mode: 'builtin' })

const STATUS_TOPICS = ['vpn.updated']
const SETTINGS_TOPICS = ['vpn.updated', 'settings.updated']

/** The field a refused save names (`details.field`), to show its message under that field. */
function fieldOf(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details
  const field = (details as { field?: unknown } | undefined)?.field
  return typeof field === 'string' ? field : undefined
}

export function Vpn() {
  const t = useT(messages)
  const settings = useQuery('settings:vpn', (c) => c.vpn.settings(), SETTINGS_TOPICS)
  const status = useQuery('vpn:status', (c) => c.vpn.status(), STATUS_TOPICS)
  return (
    <AreaPage id="vpn">
      <Loadable query={settings} what={t('what')}>
        {/* a fresh draft whenever the saved settings change */}
        {(s) => (
          <Form key={JSON.stringify(s)} loaded={s} status={status.data} reload={settings.refetch} />
        )}
      </Loadable>
    </AreaPage>
  )
}

function Form({
  loaded,
  status,
  reload,
}: {
  loaded: VpnSettings
  status: VpnStatus | undefined
  reload: () => void
}) {
  const t = useT(messages)
  const [draft, setDraft] = useState<Draft>(loaded)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const save = useAction((c, body: VpnSettingsInput) => c.vpn.save({ body }))
  const set: Set = (patch) => {
    setErrors({})
    setDraft((d) => ({ ...d, ...patch }))
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(loaded)

  const submit = async () => {
    if (draft.mode === 'container' && !CONTAINER_URL.test(draft.containerUrl)) return
    const { piaPasswordSet, containerKeySet, config, piaPassword, containerKey, ...rest } = draft
    const body: VpnSettingsInput = {
      ...rest,
      ...(config !== undefined ? { config } : {}),
      ...(piaPassword ? { piaPassword } : {}),
      ...(containerKey ? { containerKey } : {}),
    }
    try {
      await save.run(body)
    } catch (e) {
      const field = fieldOf(e)
      if (field) setErrors({ [field]: (e as Error).message })
      return toast.error(t('saveError'), { description: (e as Error).message })
    }
    toast.success(t('saved'))
    reload()
  }

  return (
    <>
      {status && <StatusGroup status={status} />}
      <ConnectionGroup v={draft} set={set} errors={errors} status={status} />
      {draft.mode !== 'off' && <BehaviourGroup v={draft} set={set} />}
      <SaveBar
        dirty={dirty}
        saving={save.pending}
        onSave={submit}
        onDiscard={() => {
          setErrors({})
          setDraft(loaded)
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- status

const stateLine = (
  v: VpnStatus,
  t: T,
): { icon: IconName; tone: ColorRole; spin?: boolean; title: string; line: string } => {
  const provider = v.provider ?? ''
  switch (v.state) {
    case 'off':
      return {
        icon: 'warning',
        tone: 'warning',
        title: t('state.off'),
        line: t('state.off.line'),
      }
    case 'connecting':
      return {
        icon: 'loading',
        tone: 'text-2',
        spin: true,
        title: t('state.connecting', { provider }),
        line: t('state.connecting.line'),
      }
    case 'connected':
      return {
        icon: 'shield',
        tone: 'success',
        title:
          v.mode === 'interface'
            ? t('state.bound', { provider })
            : t('state.connected', { provider }),
        line: !v.exitIp
          ? t('state.connected.lineNoIp')
          : v.country
            ? t('state.connected.line', { ip: v.exitIp, country: v.country })
            : t('state.connected.lineNoCountry', { ip: v.exitIp }),
      }
    case 'down':
      return {
        icon: 'error',
        tone: 'danger',
        title: t('state.down', { provider }),
        line: t('state.down.line'),
      }
    case 'failed':
      return {
        icon: 'error',
        tone: 'danger',
        // only highsea connects minds host networking; an interface on the host usually needs it
        title:
          v.mode === 'builtin' && v.hostNetwork
            ? t('state.hostNetwork')
            : v.needsCapability
              ? t('state.capability')
              : t('state.failed'),
        line: v.message ?? '',
      }
  }
}

const marks: Record<VpnCheck['result'], { icon: IconName; tone: ColorRole }> = {
  pass: { icon: 'success', tone: 'success' },
  warn: { icon: 'warning', tone: 'warning' },
  fail: { icon: 'error', tone: 'danger' },
  info: { icon: 'info', tone: 'text-3' },
  pending: { icon: 'clock', tone: 'text-3' },
}

function StatusGroup({ status: v }: { status: VpnStatus }) {
  const t = useT(messages)
  const theme = useTheme()
  const medium = useRegularWindow()
  const { now, relative } = useRelative()
  const check = useAction((c) => c.vpn.check())
  const reconnect = useAction((c) => c.vpn.reconnect())
  const head = stateLine(v, t)
  const checkedJustNow = v.checkedAt !== null && now - Date.parse(v.checkedAt) < 60_000
  const icon = <Icon name={head.icon} size={tokens.icon.size.md} color={head.tone} />
  return (
    <Group title={t('status.title')}>
      <View role="status" style={{ flexDirection: 'row', gap: s['3'] }}>
        <View style={{ paddingTop: s['0.5'] }}>
          {head.spin ? <Spinning>{icon}</Spinning> : icon}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: s['0.5'] }}>
          <Text size={ui.size} leading={ui.leading} weight={600}>
            {head.title}
          </Text>
          <Text variant="caption" color="text-2">
            {head.line}
          </Text>
        </View>
      </View>
      {/* the host-networking line already names the lines; the capability's doesn't */}
      {v.needsCapability && !v.hostNetwork && (
        <Text variant="caption" color="text-2">
          {t('capabilityHelp')}
        </Text>
      )}
      {v.checks.length > 0 && (
        <View
          role="list"
          aria-label={t('checks')}
          style={{
            borderWidth: line.thin,
            borderColor: theme.colors.line,
            borderRadius: tokens.radius.md,
            overflow: 'hidden',
          }}
        >
          {v.checks.map((c, i) => {
            const m = marks[c.result]
            const detail = (
              <Text
                variant={medium ? undefined : 'caption'}
                size={medium ? ui.size : undefined}
                leading={medium ? ui.leading : undefined}
                color="text-2"
              >
                <Text size={medium ? ui.size : undefined} color="text">
                  {c.title}
                </Text>
                {c.detail ? ` · ${c.detail}` : c.title.endsWith('.') ? '' : '.'}
              </Text>
            )
            return (
              <View
                key={c.id}
                role="listitem"
                style={{
                  flexDirection: 'row',
                  gap: s['3'],
                  paddingHorizontal: s['3'],
                  paddingVertical: s['2'] + s['0.5'],
                  borderTopWidth: i ? line.thin : 0,
                  borderColor: theme.colors.line,
                }}
              >
                <View style={{ paddingTop: s['0.5'] }}>
                  <Icon
                    name={m.icon}
                    size={tokens.icon.size.sm}
                    color={m.tone}
                    label={t(`mark.${c.result}`)}
                  />
                </View>
                {medium ? (
                  <>
                    <Text
                      size={ui.size}
                      leading={ui.leading}
                      weight={500}
                      style={{ width: admin.vpn.labelWidth, flexShrink: 0 }}
                    >
                      {c.label}
                    </Text>
                    <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
                  </>
                ) : (
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text size={ui.size} leading={ui.leading} weight={500}>
                      {c.label}
                    </Text>
                    {detail}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      )}
      {v.state !== 'off' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: s['2'] }}>
          <Button
            size="sm"
            icon="refresh"
            loading={check.pending}
            disabled={v.state !== 'connected'}
            onPress={() =>
              check.run().then(
                () => toast.success(t('checkedNow')),
                (e: Error) => toast.error(t('checkError'), { description: e.message }),
              )
            }
          >
            {t('checkNow')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={reconnect.pending}
            disabled={
              v.state === 'connecting' ||
              v.needsCapability ||
              (v.mode === 'builtin' && v.hostNetwork === true)
            }
            onPress={() =>
              reconnect
                .run()
                .catch((e: Error) => toast.error(t('reconnectError'), { description: e.message }))
            }
          >
            {t('reconnect')}
          </Button>
          {v.checkedAt && v.state === 'connected' && (
            <Text variant="caption" color="text-3">
              {checkedJustNow ? t('checkedNow') : t('checkedAgo', { ago: relative(v.checkedAt) })}
            </Text>
          )}
        </View>
      )}
    </Group>
  )
}

/** react-native-web's `tabIndex`, which React Native's types don't name. */
const FOCUSABLE = { tabIndex: 0 } as object

export function CopyBlock({ label, text }: { label: string; text: string }) {
  const t = useT(messages)
  const theme = useTheme()
  return (
    <View role="figure" aria-label={label} style={{ gap: s['2'] }}>
      <ScrollView
        horizontal
        // it scrolls sideways when the lines are longer than the panel, and a scrolling region
        // must take focus to scroll by keyboard (axe's scrollable-region-focusable)
        {...FOCUSABLE}
        style={{
          borderWidth: line.thin,
          borderColor: theme.colors.line,
          borderRadius: tokens.radius.md,
          backgroundColor: theme.colors.s2,
        }}
        contentContainerStyle={{ padding: s['3'] }}
      >
        <Text
          mono
          size={tokens.adminText.figure.size}
          leading={tokens.adminText.figure.leading}
          color="text-2"
          style={{ whiteSpace: 'pre' } as object}
        >
          {text}
        </Text>
      </ScrollView>
      <Button
        size="sm"
        variant="secondary"
        icon="copy"
        onPress={() =>
          (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'))).then(
            () => toast.success(t('copied')),
            () => toast.error(t('copyError'), { description: t('copyErrorDetail') }),
          )
        }
      >
        {t('copy')}
      </Button>
    </View>
  )
}

// ---------------------------------------------------------------- connection

function ConnectionGroup({
  v,
  set,
  errors,
  status,
}: {
  v: Draft
  set: Set
  errors: Record<string, string>
  status: VpnStatus | undefined
}) {
  const t = useT(messages)
  const theme = useTheme()
  const medium = useRegularWindow()
  return (
    <Group title={t('connection.title')} description={t('connection.description')}>
      <View
        accessibilityRole="radiogroup"
        aria-label={t('mode.legend')}
        style={
          {
            display: 'grid',
            gridTemplateColumns: medium ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
            gap: s['2'],
          } as unknown as ViewStyle
        }
      >
        {MODES.map((m) => {
          const chosen = v.mode === m
          return (
            <Press
              key={m}
              // the card is the radio, its mark inside (a radio's children are presentational)
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={t(`mode.${m}`)}
              accessibilityHint={t(`mode.${m}.line`)}
              onPress={() => set({ mode: m })}
              style={({ hovered }) => ({
                height: '100%',
                flexDirection: 'row',
                gap: s['2'] + s['0.5'],
                padding: s['3'],
                borderWidth: line.thin,
                borderRadius: tokens.radius.md,
                borderColor: chosen ? theme.colors.accent : theme.colors.line,
                backgroundColor: chosen
                  ? theme.colors['accent-soft']
                  : hovered
                    ? theme.colors.s2
                    : 'transparent',
              })}
            >
              <View style={{ paddingTop: s['0.5'] }}>
                <RadioMark checked={chosen} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: s['0.5'] }}>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: s['2'],
                  }}
                >
                  <Text size={ui.size} leading={ui.leading} weight={600}>
                    {t(`mode.${m}`)}
                  </Text>
                  {m === 'builtin' && <Badge tone="accent">{t('recommended')}</Badge>}
                </View>
                <Text variant="caption" color="text-3">
                  {t(`mode.${m}.line`)}
                </Text>
              </View>
            </Press>
          )
        })}
      </View>
      {v.mode === 'builtin' && (
        <BuiltIn
          v={v}
          set={set}
          // the lines open by themselves when highsea can't run the tunnel as it's set up now
          linesNeeded={status?.hostNetwork === true || status?.needsCapability === true}
        />
      )}
      {v.mode === 'container' && <Container v={v} set={set} errors={errors} />}
      {v.mode === 'interface' && <InterfacePicker v={v} set={set} error={errors.interface} />}
    </Group>
  )
}

function InterfacePicker({ v, set, error }: { v: Draft; set: Set; error?: string }) {
  const t = useT(messages)
  const interfaces = useQuery('vpn:interfaces', (c) => c.vpn.interfaces())
  const label = (i: VpnInterface) => (i.ipv4 ? `${i.name} · ${i.ipv4}` : i.name)
  return (
    <Columns>
      <Loadable query={interfaces} what={t('interface').toLowerCase()} skeleton={null}>
        {(list) => {
          const options = list.map((i) => ({ value: i.name, label: label(i) }))
          // a saved interface that's gone stays visible, so the draft doesn't change by itself
          if (v.interface && !list.some((i) => i.name === v.interface))
            options.unshift({ value: v.interface, label: v.interface })
          return (
            <Field
              label={t('interface')}
              hint={options.length ? t('interfaceHint') : t('interfaceNone')}
              error={error}
            >
              <Select
                aria-label={t('interface')}
                value={v.interface || undefined}
                placeholder={t('interfaceChoose')}
                disabled={!options.length}
                onValueChange={(i) => set({ interface: i })}
                options={options}
              />
            </Field>
          )
        }}
      </Loadable>
    </Columns>
  )
}

function Steps({ provider }: { provider: VpnProvider }) {
  return (
    <View role="list" style={{ gap: s['1'] }}>
      {provider.steps.map((step, i) => (
        <View key={step} role="listitem" style={{ flexDirection: 'row', gap: s['2'] }}>
          <Text variant="caption" color="text-3" aria-hidden style={{ minWidth: s['3'] }}>
            {`${i + 1}.`}
          </Text>
          <Text
            variant="caption"
            color="text-2"
            style={[{ flex: 1, minWidth: 0 }, { overflowWrap: 'anywhere' } as object]}
          >
            {step}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Shown only when the stored mode is built-in, which the page can't pick until 6b. */
function BuiltIn({ v, set, linesNeeded }: { v: Draft; set: Set; linesNeeded: boolean }) {
  const t = useT(messages)
  const providers = useQuery('vpn:providers', (c) => c.vpn.providers())
  const [pasting, setPasting] = useState(false)
  return (
    <Loadable query={providers} what={t('provider').toLowerCase()} skeleton={null}>
      {(list) => {
        const provider = list.find((p) => p.id === v.provider) ?? list[0]
        if (!provider) return null
        return (
          <Section>
            <Columns>
              <Field label={t('provider')}>
                <Select
                  aria-label={t('provider')}
                  value={provider.id}
                  onValueChange={(id) =>
                    set({ provider: id, config: undefined, configName: null, staticPort: null })
                  }
                  options={list.map((p) => ({ value: p.id, label: p.name }))}
                />
              </Field>
            </Columns>
            <Steps provider={provider} />
            {provider.connect === 'account' ? (
              <Columns count={3}>
                <Field label={t('username')}>
                  <Input
                    mono
                    value={v.piaUsername}
                    autoComplete="off"
                    placeholder="p1234567"
                    onChangeText={(piaUsername) => set({ piaUsername })}
                  />
                </Field>
                <Field label={t('password')} hint={v.piaPasswordSet ? t('secretSet') : undefined}>
                  <Input
                    secureTextEntry
                    autoComplete="off"
                    value={v.piaPassword ?? ''}
                    placeholder={v.piaPasswordSet ? '••••••••' : ''}
                    onChangeText={(piaPassword) => set({ piaPassword })}
                  />
                </Field>
                <Field label={t('region')} hint={t('regionHint')}>
                  <Select
                    aria-label={t('region')}
                    value={v.piaRegion || undefined}
                    onValueChange={(piaRegion) => set({ piaRegion })}
                    options={(provider.regions ?? []).map((r) => ({ value: r, label: r }))}
                  />
                </Field>
              </Columns>
            ) : (
              <View style={{ gap: s['2'] }}>
                <Text size={ui.size} leading={ui.leading} weight={500}>
                  {t('config')}
                </Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: s['2'],
                  }}
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="upload"
                    onPress={() =>
                      pickFile('.conf,text/plain', (file) =>
                        file.text().then((config) => set({ config, configName: file.name })),
                      )
                    }
                  >
                    {v.configName || v.config !== undefined
                      ? t('configReplace')
                      : t('configUpload')}
                  </Button>
                  <Button size="sm" variant="ghost" onPress={() => setPasting((p) => !p)}>
                    {pasting ? t('configHide') : t('configPaste')}
                  </Button>
                  {v.configName && (
                    <View
                      style={{
                        flexDirection: 'row',
                        minWidth: 0,
                        flexShrink: 1,
                        alignItems: 'center',
                        gap: s['1'] + s['0.5'],
                      }}
                    >
                      <Icon name="check" size={tokens.icon.size.xs} color="success" />
                      <Text variant="caption" color="text-2" mono numberOfLines={1}>
                        {v.configName}
                      </Text>
                      {v.config === undefined && (
                        <Text variant="caption" color="text-3">
                          {t('configKept')}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
                {pasting && (
                  <Field label={t('configPasteLabel')}>
                    <Textarea
                      mono
                      numberOfLines={6}
                      spellCheck={false}
                      placeholder={
                        '[Interface]\nPrivateKey = …\nAddress = 10.2.0.2/32\n\n[Peer]\n…'
                      }
                      value={v.config ?? ''}
                      onChangeText={(config) =>
                        set({ config, configName: v.configName ?? 'pasted.conf' })
                      }
                    />
                  </Field>
                )}
                {provider.portForwarding === 'static' && (
                  <Columns count={3}>
                    <Field label={t('staticPort')} hint={t('staticPortHint')}>
                      <Input
                        mono
                        inputMode="numeric"
                        keyboardType="number-pad"
                        value={v.staticPort == null ? '' : String(v.staticPort)}
                        onChangeText={(port) =>
                          set({ staticPort: port.trim() ? Number(port) : null })
                        }
                      />
                    </Field>
                  </Columns>
                )}
              </View>
            )}
            <ConnectsCompose linesNeeded={linesNeeded} />
          </Section>
        )
      }}
    </Loadable>
  )
}

/** Compose for highsea connects, open by itself when highsea needs the lines (vpn.md, proposed). */
function ConnectsCompose({ linesNeeded }: { linesNeeded: boolean }) {
  const t = useT(messages)
  const [open, setOpen] = useState(linesNeeded)
  // the status comes after the settings, so the lines open when it says they're needed
  useEffect(() => {
    if (linesNeeded) setOpen(true)
  }, [linesNeeded])
  return (
    <ComposePanel
      title={t('compose.builtin')}
      body={t('compose.builtin.body')}
      open={open}
      onOpenChange={setOpen}
    >
      <CopyBlock label={t('composeLines')} text={CONNECTS_LINES} />
    </ComposePanel>
  )
}

/** A mode's compose lines, folded under a line in a bordered panel, as the container mode has them. */
function ComposePanel({
  title,
  body,
  open,
  onOpenChange,
  children,
}: {
  title: string
  body: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: ReactNode
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.md,
        paddingHorizontal: s['3'],
        paddingVertical: s['1'],
      }}
    >
      <Disclosure title={title} open={open} onOpenChange={onOpenChange}>
        <View style={{ gap: s['3'], paddingBottom: s['2'] }}>
          <Text variant="caption" color="text-2">
            {body}
          </Text>
          {children}
        </View>
      </Disclosure>
    </View>
  )
}

function Container({ v, set, errors }: { v: Draft; set: Set; errors: Record<string, string> }) {
  const t = useT(messages)
  const urlError = !CONTAINER_URL.test(v.containerUrl)
  return (
    <Section>
      <Columns>
        <Field
          label={t('controlServer')}
          hint={t('controlServerHint')}
          error={urlError ? t('controlServerInvalid') : errors.containerUrl}
        >
          <Input
            mono
            value={v.containerUrl}
            spellCheck={false}
            autoCapitalize="none"
            onChangeText={(containerUrl) => set({ containerUrl })}
          />
        </Field>
        <Field
          label={t('apiKey')}
          hint={v.containerKeySet ? t('secretSet') : t('apiKeyHint')}
          error={errors.containerKey}
        >
          <Input
            secureTextEntry
            autoComplete="off"
            value={v.containerKey ?? ''}
            placeholder={v.containerKeySet ? '••••••••' : ''}
            onChangeText={(containerKey) => set({ containerKey })}
          />
        </Field>
      </Columns>
      <ComposePanel title={t('compose')} body={t('composeBody')}>
        <Compose />
      </ComposePanel>
    </Section>
  )
}

/** The provider picker and its compose block, written by the server (`vpn.compose`). */
function Compose() {
  const t = useT(messages)
  const providers = useQuery('vpn:providers', (c) => c.vpn.providers())
  const [chosen, setChosen] = useState<string | null>(null)
  const id = chosen ?? (providers.status === 'success' ? (providers.data[0]?.id ?? null) : null)
  return (
    <Loadable query={providers} what={t('provider').toLowerCase()} skeleton={null}>
      {(list) => (
        <>
          <Columns>
            <Field label={t('provider')}>
              <Select
                aria-label={t('provider')}
                value={id ?? undefined}
                onValueChange={setChosen}
                options={list.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
          </Columns>
          {id && <ComposeBlock provider={id} />}
        </>
      )}
    </Loadable>
  )
}

function ComposeBlock({ provider }: { provider: string }) {
  const t = useT(messages)
  const block = useQuery(`vpn:compose:${provider}`, (c) => c.vpn.compose({ body: { provider } }))
  if (block.status === 'error')
    return (
      <Text variant="caption" color="danger">
        {t('composeError')}
      </Text>
    )
  if (block.status === 'loading') return null
  return <CopyBlock label={t('composeBlock')} text={block.data.yaml} />
}

// ---------------------------------------------------------------- behaviour

function BehaviourGroup({ v, set }: { v: Draft; set: Set }) {
  const t = useT(messages)
  const providers = useQuery('vpn:providers', (c) => c.vpn.providers())
  const provider =
    providers.status === 'success' ? providers.data.find((p) => p.id === v.provider) : undefined
  const forwards =
    v.mode === 'container' || (v.mode === 'builtin' && provider?.portForwarding !== 'none')
  return (
    <Group title={t('behaviour.title')}>
      <Switch
        label={t('stopWhenDown')}
        hint={
          v.mode === 'builtin'
            ? t('stopWhenDown.builtin')
            : v.mode === 'container'
              ? t('stopWhenDown.container')
              : t('stopWhenDown.interface')
        }
        checked
        disabled
      />
      {forwards && (
        <Switch
          label={t('useForwardedPort')}
          hint={t('useForwardedPortHint')}
          checked={v.useForwardedPort}
          onCheckedChange={(useForwardedPort) => set({ useForwardedPort })}
        />
      )}
      <Switch
        label={t('indexersThroughVpn')}
        hint={t('indexersThroughVpnHint')}
        checked={v.indexersThroughVpn}
        onCheckedChange={(indexersThroughVpn) => set({ indexersThroughVpn })}
      />
    </Group>
  )
}

// ---------------------------------------------------------------- elsewhere

const toneOf: Record<VpnStatus['state'], BadgeTone> = {
  off: 'warning',
  connecting: 'neutral',
  connected: 'success',
  down: 'danger',
  failed: 'danger',
}

/** Download client's VPN line: the status in one line, and the way to the VPN area. */
export function VpnSummary({ action }: { action: ReactNode }) {
  const t = useT(messages)
  const theme = useTheme()
  const status = useQuery('vpn:status', (c) => c.vpn.status(), STATUS_TOPICS)
  if (status.status !== 'success') return null
  const head = stateLine(status.data, t)
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: s['2'],
        padding: s['3'],
        borderWidth: line.thin,
        borderColor: theme.colors.line,
        borderRadius: tokens.radius.md,
        backgroundColor: theme.colors.s2,
      }}
    >
      <Badge tone={toneOf[status.data.state]}>{head.title}</Badge>
      <Text
        variant="caption"
        color="text-3"
        style={{ minWidth: 0, flexGrow: 1, flexBasis: wrapBasis }}
      >
        {head.line}
      </Text>
      {action}
    </View>
  )
}
