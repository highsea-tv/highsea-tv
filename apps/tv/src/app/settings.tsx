// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings, TV (client-settings.md#tv, the prototype's tv/settings.tsx): the sections down the
// left, the chosen one on the right. Focus moving down the list shows each section, as tvOS's own
// Settings does; Right enters it and Left returns to the list, each a focus guide that remembers
// where focus was. Theme and sound are this TV's, in the server's preference layers (ADR 0027),
// with Use on all my devices as the person's own theme; the home layout follows the person; Your
// devices signs others out. The words are the prototype's, the choices the phone's
// (apps/mobile/src/settings.tsx).
import { useAppearance, useHomeLayout, useMyDevices, useServer } from '@highsea-tv/client/data'
import { SERVER_THEME, useDevicePrefs } from '@highsea-tv/client/prefs'
import { useT } from '@highsea-tv/i18n/react'
import { appVersion } from '@highsea-tv/native/device'
import { useServers } from '@highsea-tv/native/servers'
import { useSessionData } from '@highsea-tv/native/session'
import { useAction } from '@highsea-tv/sdk/react'
import { builtInThemes, createTheme } from '@highsea-tv/tokens'
import { type NativeTheme, nativeTokens, toNativeTheme } from '@highsea-tv/tokens/native'
import { Button, Text, tokens, useTheme } from '@highsea-tv/ui'
import { alpha, Focusable, type ViewHandle } from '@highsea-tv/ui/tv'
import { router } from 'expo-router'
import { type ReactNode, useState } from 'react'
import { Alert, ScrollView, TVFocusGuideView, View } from 'react-native'
import { GlobalNav, ServerIdentity } from '../kit.tsx'
import { home as homeMessages, settings as messages } from '../messages.ts'

const tv = tokens.tv

const SECTIONS = ['appearance', 'sounds', 'home', 'servers', 'devices', 'about'] as const
type Section = (typeof SECTIONS)[number]

/** The list's column, in units (the prototype's 24cqw). */
const MENU = 24

export default function Settings() {
  const t = useT(messages)
  const theme = useTheme()
  const u = theme.u
  const [section, setSection] = useState<Section>('appearance')
  // the section in use, as the navigation's Down goes to it
  const [chosen, setChosen] = useState<ViewHandle | null>(null)
  // the first section takes focus as the screen opens, and only then. It stays preferred until the
  // list has focus: dropped in an effect, it went before tvOS's focus update for the new screen
  // ran, and focus stayed on the navigation or fell on another section
  const [opening, setOpening] = useState(true)
  return (
    <View style={{ flex: 1 }}>
      <ServerIdentity />
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          gap: 4 * u,
          paddingHorizontal: tv.safe.x * u,
          paddingTop: 7 * u,
          paddingBottom: tv.safe.y * u,
        }}
      >
        <View accessibilityRole="menu" style={{ width: MENU * u, gap: 1.2 * u }}>
          <Text variant="heroTitle" size={2.6} accessibilityRole="header">
            {t('title')}
          </Text>
          {/* the whole column takes Left from the section, back to the one in use */}
          <TVFocusGuideView autoFocus style={{ flex: 1, gap: 0.3 * u }}>
            {SECTIONS.map((s, i) => (
              <Option
                key={s}
                ref={s === section ? setChosen : undefined}
                preferred={opening && i === 0}
                current={s === section}
                onFocus={() => {
                  setOpening(false)
                  setSection(s)
                }}
              >
                {t(`section.${s}`)}
              </Option>
            ))}
          </TVFocusGuideView>
        </View>
        {/* and this one Right from the list, into the section. One per section, so it never
        remembers a stop from another section that's gone (it would then pick its own) */}
        <TVFocusGuideView
          key={section}
          autoFocus
          accessibilityLabel={t(`section.${section}`)}
          style={{ flex: 1, gap: 1.4 * u, paddingTop: 3.6 * u }}
        >
          <Text variant="meta" color="text-3">
            {t(`hint.${section}`)}
          </Text>
          {/* a long section (a library's many genres on Home screen) scrolls, following focus as
          tvOS's scroll views do; it reaches past the column by the row's lift so that isn't cut, and
          its top edge fades as TvPage's does, so a line scrolled away isn't cut in half */}
          <View style={{ flex: 1, margin: -1 * u }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 1 * u }}
              showsVerticalScrollIndicator={false}
            >
              <Body section={section} />
            </ScrollView>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 1.6 * u,
                experimental_backgroundImage: `linear-gradient(180deg, ${theme.colors.bg}, transparent)`,
              }}
            />
          </View>
        </TVFocusGuideView>
      </View>
      <GlobalNav down={chosen} />
    </View>
  )
}

function Body({ section }: { section: Section }) {
  if (section === 'appearance') return <ThemeSection />
  if (section === 'sounds') return <SoundSection />
  if (section === 'home') return <HomeSection />
  if (section === 'servers') return <ServersSection />
  if (section === 'devices') return <DevicesSection />
  return <AboutSection />
}

/**
 * A row in a list (the prototype's `option`): `text-2` words that fill with `text` on focus, `text`
 * while checked or current, a faint fill while it's the section in use.
 */
function Option({
  ref,
  preferred,
  current,
  checked,
  role,
  label,
  onFocus,
  onPress,
  children,
  detail,
  swatch,
}: {
  ref?: (node: ViewHandle | null) => void
  preferred?: boolean
  current?: boolean
  checked?: boolean
  role?: 'radio' | 'switch'
  label?: string
  onFocus?: () => void
  onPress?: () => void
  children: string
  detail?: string
  swatch?: NativeTheme
}) {
  const theme = useTheme()
  const u = theme.u
  const marked = checked !== undefined
  return (
    <Focusable
      ref={ref}
      preferred={preferred}
      role={role ?? 'menuitem'}
      selected={current || checked}
      label={label ?? (detail ? `${children}, ${detail}` : children)}
      lift="row"
      ring={false}
      radius={0.5 * u}
      onFocus={onFocus}
      onPress={onPress}
    >
      {(focused) => {
        const fg = focused ? 'bg' : current || checked ? 'text' : 'text-2'
        return (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1 * u,
              borderRadius: 0.5 * u,
              paddingHorizontal: 1.2 * u,
              paddingVertical: 0.8 * u,
              backgroundColor: focused
                ? theme.colors.text
                : current
                  ? alpha(theme.colors.text, 0.1)
                  : 'transparent',
            }}
          >
            {marked ? (
              <View
                style={{
                  width: 1.3 * u,
                  height: 1.3 * u,
                  borderRadius: 0.65 * u,
                  borderWidth: 0.15 * u,
                  borderColor: theme.colors[fg],
                  backgroundColor: checked ? theme.colors[fg] : 'transparent',
                }}
              />
            ) : null}
            <Text variant="button" weight={500} color={fg} numberOfLines={1} style={{ flex: 1 }}>
              {children}
            </Text>
            {detail ? (
              <Text variant="pill" color={fg} numberOfLines={1} style={{ opacity: 0.7 }}>
                {detail}
              </Text>
            ) : null}
            {swatch ? <Swatch theme={swatch} /> : null}
          </View>
        )
      }}
    </Focusable>
  )
}

/** Three dots of a theme's colours, as the web's and the phone's swatches. */
function Swatch({ theme }: { theme: NativeTheme }) {
  const current = useTheme()
  const u = current.u
  return (
    <View style={{ flexDirection: 'row', gap: 0.4 * u }}>
      {(['bg', 's2', 'accent'] as const).map((r) => (
        <View
          key={r}
          style={{
            width: 1.1 * u,
            height: 1.1 * u,
            borderRadius: 0.55 * u,
            backgroundColor: theme.colors[r],
            borderWidth: 0.08 * u,
            borderColor: current.colors['line-strong'],
          }}
        />
      ))}
    </View>
  )
}

function useSaveFailed() {
  const t = useT(messages)
  return (e: Error) => Alert.alert(t('saveFailed', { message: e.message }))
}

function Quiet({ children }: { children: ReactNode }) {
  return (
    <Text variant="meta" color="text-3">
      {children}
    </Text>
  )
}

const useServerName = () => useServers().current?.server.name ?? ''

function ThemeSection() {
  const t = useT(messages)
  const u = useTheme().u
  const prefs = useDevicePrefs()
  const appearance = useAppearance()
  const name = useServerName()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <Quiet>{t('loading')}</Quiet>
  const a = appearance.data
  const builtIn = Object.values(builtInThemes)
  const defaultName =
    builtIn.find((b) => b.id === a?.defaultTheme)?.name ??
    a?.themes.find((c) => c.id === a?.defaultTheme)?.name ??
    ''
  const choices: { id: string; name: string; detail: string; theme?: NativeTheme }[] = [
    { id: SERVER_THEME, name: t('serverDefault', { name }), detail: defaultName },
    ...builtIn.map((b) => ({
      id: b.id,
      name: b.name,
      detail: t('builtIn'),
      theme: (nativeTokens.themes as Record<string, NativeTheme>)[b.id],
    })),
    ...(a?.themes ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      detail: t('fromServer', { name }),
      theme: toNativeTheme(createTheme({ ...c }).theme),
    })),
  ]
  const everywhere = p.everywhere !== null
  return (
    <View style={{ gap: 1.2 * u }}>
      <View accessibilityRole="radiogroup" style={{ gap: 0.4 * u }}>
        {choices.map((c) => (
          <Option
            key={c.id}
            role="radio"
            checked={p.chosen === c.id}
            detail={c.detail}
            swatch={c.theme}
            onPress={() => void prefs.setTheme(c.id).catch(failed)}
          >
            {c.name}
          </Option>
        ))}
      </View>
      <View style={{ alignItems: 'flex-start', gap: 0.6 * u }}>
        <Button
          variant={everywhere ? 'primary' : 'overlay'}
          disabled={prefs.pending}
          onPress={() => void prefs.setEverywhere(!everywhere).catch(failed)}
        >
          {everywhere ? t('everywhereOn') : t('everywhereOff')}
        </Button>
        <Quiet>{everywhere ? t('themeEverywhere') : t('themeTv')}</Quiet>
      </View>
    </View>
  )
}

function SoundSection() {
  const t = useT(messages)
  const u = useTheme().u
  const prefs = useDevicePrefs()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <Quiet>{t('loading')}</Quiet>
  const step = (by: number) =>
    void prefs
      .setVolume(Math.round(Math.min(1, Math.max(0, p.volume + by)) * 10) / 10)
      .catch(failed)
  return (
    <View style={{ gap: 1.2 * u, alignItems: 'flex-start' }}>
      <Button
        variant={p.sound ? 'primary' : 'overlay'}
        onPress={() => void prefs.setSound(!p.sound).catch(failed)}
      >
        {p.sound ? t('soundsOn') : t('soundsOff')}
      </Button>
      <View style={{ gap: 0.6 * u }}>
        <Text variant="meta" color="text-2">
          {t('volume', { percent: Math.round(p.volume * 100) })}
        </Text>
        <View style={{ flexDirection: 'row', gap: 1 * u }}>
          <Button variant="overlay" disabled={p.volume <= 0} onPress={() => step(-0.1)}>
            {t('quieter')}
          </Button>
          <Button variant="overlay" disabled={p.volume >= 1} onPress={() => step(0.1)}>
            {t('louder')}
          </Button>
        </View>
      </View>
    </View>
  )
}

function HomeSection() {
  const t = useT(messages)
  const h = useT(homeMessages)
  const u = useTheme().u
  const home = useHomeLayout()
  const failed = useSaveFailed()
  if (home.status !== 'success') return <Quiet>{t('loading')}</Quiet>
  // built-in rows have no title from the server; this app names them
  const title = (r: { id: string; title: string | null }) =>
    r.title ?? (r.id === 'continue' ? h('continue') : r.id === 'recent' ? h('recent') : r.id)
  return (
    <View style={{ gap: 0.8 * u }}>
      <Text variant="meta" color="text-2">
        {t('homeIntro')}
      </Text>
      <View style={{ gap: 0.4 * u }}>
        {home.rows.map((r, i) => {
          const shown = !home.hidden.includes(r.id)
          return (
            // each row is a guide, so Left from Up or Down comes back to its own toggle
            <TVFocusGuideView
              key={r.id}
              autoFocus
              style={{ flexDirection: 'row', alignItems: 'center', gap: 0.6 * u }}
            >
              <View style={{ flex: 1 }}>
                <Option
                  role="switch"
                  checked={shown}
                  detail={shown ? t('shown') : t('hidden')}
                  onPress={() => void home.toggle(r.id, !shown).catch(failed)}
                >
                  {title(r)}
                </Option>
              </View>
              <Button
                variant="overlay"
                accessibilityLabel={t('moveUp', { title: title(r) })}
                disabled={i === 0}
                onPress={() => void home.move(r.id, -1)?.catch(failed)}
              >
                {t('up')}
              </Button>
              <Button
                variant="overlay"
                accessibilityLabel={t('moveDown', { title: title(r) })}
                disabled={i === home.rows.length - 1}
                onPress={() => void home.move(r.id, 1)?.catch(failed)}
              >
                {t('down')}
              </Button>
            </TVFocusGuideView>
          )
        })}
      </View>
    </View>
  )
}

function ServersSection() {
  const t = useT(messages)
  const u = useTheme().u
  const servers = useServers()
  const session = useSessionData()
  const name = useServerName()
  const out = useAction((c) => c.auth.signOut())
  return (
    <View style={{ gap: 1.2 * u }}>
      <Text variant="synopsis" color="text-2">
        {t('watching', { name, person: session.user.displayName })}
      </Text>
      <View style={{ flexDirection: 'row', gap: 1 * u }}>
        <Button variant="overlay" icon="server" onPress={() => router.push('/connect')}>
          {t('anotherServer')}
        </Button>
        <Button
          variant="overlay"
          icon="sign-out"
          disabled={out.pending}
          // the token is forgotten here whether or not the server heard, since it's this TV's
          onPress={() =>
            void out
              .run()
              .catch(() => {})
              .then(() => servers.signedOut())
              .catch(() => Alert.alert(t('signOutFailed')))
          }
        >
          {t('signOut')}
        </Button>
      </View>
    </View>
  )
}

function DevicesSection() {
  const t = useT(messages)
  const u = useTheme().u
  const session = useSessionData()
  const { devices, revoke } = useMyDevices()
  if (devices.status === 'loading') return <Quiet>{t('loading')}</Quiet>
  if (devices.status === 'error')
    return <Quiet>{t('failed', { message: devices.error.message })}</Quiet>
  return (
    <View style={{ gap: 0.4 * u }}>
      {devices.data.map((d) => {
        const here = d.id === session.deviceId
        return (
          <View
            key={d.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1 * u,
              minHeight: 3.4 * u,
            }}
          >
            <Text variant="button" weight={500} numberOfLines={1} style={{ flex: 1 }}>
              {d.name}
              {here ? (
                <Text variant="button" weight={500} color="text-3">
                  {t('thisTv')}
                </Text>
              ) : null}
            </Text>
            {here || d.client === 'admin' ? null : (
              <Button
                variant="overlay"
                onPress={() =>
                  revoke(d.id).then(
                    () => {
                      devices.refresh()
                      Alert.alert(t('deviceSignedOut', { name: d.name }))
                    },
                    (e: Error) => Alert.alert(e.message),
                  )
                }
              >
                {t('signOut')}
              </Button>
            )}
          </View>
        )
      })}
    </View>
  )
}

function AboutSection() {
  const t = useT(messages)
  const u = useTheme().u
  const server = useServer()
  const name = useServerName()
  const line = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', gap: 2 * u }}>
      <Text variant="synopsis" color="text-3" style={{ width: 8 * u }}>
        {label}
      </Text>
      <Text variant="synopsis" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  )
  return (
    <View accessible style={{ gap: 0.6 * u }}>
      {line(t('thisApp'), t('appVersion', { version: appVersion }))}
      {line(t('server'), `${name} ${server.data?.version ?? ''}`.trim())}
      {line(t('licence'), t('free'))}
    </View>
  )
}
