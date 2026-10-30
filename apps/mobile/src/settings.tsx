// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings on the phone (client-settings.md), each section its own screen under You, ported
// from apps/web/src/settings.tsx with the prototype's mobile wording. Theme and sound are this
// device's, in the server's preference layers (ADR 0027), with Use on all my devices as the
// person's own theme; the home layout follows the person, its rows moved with buttons; Servers is
// every server this phone knows (connectivity.md), with Connect a device; Your devices signs
// others out; About names the app and the server.
import type { ClientType } from '@highsea-tv/api-contract'
import { useAppearance, useHomeLayout, useMyDevices, useServer } from '@highsea-tv/client/data'
import { SERVER_THEME, useDevicePrefs } from '@highsea-tv/client/prefs'
import { relative } from '@highsea-tv/core/format'
import { useLocale, useT } from '@highsea-tv/i18n/react'
import { appVersion } from '@highsea-tv/native/device'
import { useCurrent, useServers } from '@highsea-tv/native/servers'
import { useSessionData } from '@highsea-tv/native/session'
import { useAction } from '@highsea-tv/sdk/react'
import { builtInThemes, createTheme } from '@highsea-tv/tokens'
import { type NativeTheme, nativeTokens, toNativeTheme } from '@highsea-tv/tokens/native'
import {
  Badge,
  Button,
  Icon,
  type IconName,
  Mark,
  Press,
  SwitchRow,
  Text,
  useTheme,
} from '@highsea-tv/ui-native'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Alert, Switch, View } from 'react-native'
import { useForget } from './forget.ts'
import { Group, Row } from './kit.tsx'
import {
  forget as forgetMessages,
  home as homeMessages,
  you as messages,
  shell as shellMessages,
} from './messages.ts'
import { useServerName } from './shell.tsx'

export const SECTIONS = [
  { id: 'appearance', icon: 'palette' },
  { id: 'sounds', icon: 'sound' },
  { id: 'home', icon: 'home' },
  { id: 'servers', icon: 'server' },
  { id: 'devices', icon: 'phone' },
  { id: 'about', icon: 'info' },
] as const satisfies readonly { id: string; icon: IconName }[]

export type SectionId = (typeof SECTIONS)[number]['id']

const deviceIcon = (c: ClientType): IconName =>
  c === 'ios' || c === 'android'
    ? 'phone'
    : c === 'tvos' || c === 'androidtv' || c === 'webos' || c === 'tizen'
      ? 'tv'
      : 'laptop'

function useSaveFailed() {
  const t = useT(messages)
  return (e: Error) => Alert.alert(t('saveFailed', { message: e.message }))
}

function Quiet({ children }: { children: string }) {
  return (
    <Text variant="caption" size={13} color="text-3">
      {children}
    </Text>
  )
}

/** Three dots of a theme's colours, as the web's swatches. */
function Swatch({ theme }: { theme: NativeTheme }) {
  const current = useTheme()
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {(['bg', 's2', 'accent'] as const).map((r) => (
        <View
          key={r}
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: theme.colors[r],
            borderWidth: 1,
            borderColor: current.colors['line-strong'],
          }}
        />
      ))}
    </View>
  )
}

function ThemeSection() {
  const t = useT(messages)
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
    <View style={{ gap: 16 }}>
      <Quiet>{everywhere ? t('themeEverywhere') : t('themeDevice')}</Quiet>
      <View accessibilityRole="radiogroup">
        <Group>
          {choices.map((c) => {
            const chosen = p.chosen === c.id
            return (
              <Press
                key={c.id}
                onPress={() => void prefs.setTheme(c.id).catch(failed)}
                disabled={prefs.pending}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen }}
                accessibilityLabel={`${c.name}, ${c.detail}`}
                style={{
                  minHeight: 56,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="body" size={15} numberOfLines={1}>
                    {c.name}
                  </Text>
                  {c.detail ? <Quiet>{c.detail}</Quiet> : null}
                </View>
                {c.theme && <Swatch theme={c.theme} />}
                <View style={{ width: 20, alignItems: 'center' }}>
                  {chosen && <Icon name="check" size={18} color="accent-text" />}
                </View>
              </Press>
            )
          })}
        </Group>
      </View>
      <SwitchRow
        label={t('everywhere')}
        hint={everywhere ? t('everywhereOn') : t('everywhereOff')}
        value={everywhere}
        disabled={prefs.pending}
        onValueChange={(on) => void prefs.setEverywhere(on).catch(failed)}
      />
    </View>
  )
}

function SoundSection() {
  const t = useT(messages)
  const prefs = useDevicePrefs()
  const appearance = useAppearance()
  const name = useServerName()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <Quiet>{t('loading')}</Quiet>
  const fallback = appearance.data?.sound.phone ?? false
  return (
    <View style={{ gap: 16, alignItems: 'stretch' }}>
      <SwitchRow
        label={t('sounds')}
        hint={p.soundChosen ? t('setHere') : t(fallback ? 'followingOn' : 'followingOff', { name })}
        value={p.sound}
        onValueChange={(sound) => void prefs.setSound(sound).catch(failed)}
      />
      {p.soundChosen && (
        <View style={{ flexDirection: 'row' }}>
          <Button variant="ghost" onPress={() => void prefs.setSound(null).catch(failed)}>
            {t('followAgain', { name })}
          </Button>
        </View>
      )}
    </View>
  )
}

function HomeSection() {
  const t = useT(messages)
  const h = useT(homeMessages)
  const theme = useTheme()
  const home = useHomeLayout()
  const failed = useSaveFailed()
  if (home.status !== 'success') return <Quiet>{t('loading')}</Quiet>
  // built-in rows have no title from the server; this app names them
  const title = (r: { id: string; title: string | null }) =>
    r.title ?? (r.id === 'continue' ? h('continue') : r.id === 'recent' ? h('recent') : r.id)
  return (
    <View style={{ gap: 12 }}>
      <Quiet>{t('homeIntro')}</Quiet>
      <Group>
        {home.rows.map((r, i) => {
          const shown = !home.hidden.includes(r.id)
          return (
            <View
              key={r.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingStart: 12,
                paddingEnd: 12,
                minHeight: 56,
              }}
            >
              <Text
                variant="body"
                size={15}
                color={shown ? 'text' : 'text-3'}
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {title(r)}
              </Text>
              <Press
                onPress={() => void home.move(r.id, -1)?.catch(failed)}
                disabled={i === 0}
                accessibilityRole="button"
                accessibilityLabel={t('moveUp', { title: title(r) })}
                style={{
                  width: 40,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: i === 0 ? 0.35 : 1,
                }}
              >
                <Icon name="chevron-up" size={18} color="text-2" />
              </Press>
              <Press
                onPress={() => void home.move(r.id, 1)?.catch(failed)}
                disabled={i === home.rows.length - 1}
                accessibilityRole="button"
                accessibilityLabel={t('moveDown', { title: title(r) })}
                style={{
                  width: 40,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: i === home.rows.length - 1 ? 0.35 : 1,
                }}
              >
                <Icon name="chevron-down" size={18} color="text-2" />
              </Press>
              <Switch
                accessibilityLabel={t('showRow', { title: title(r) })}
                value={shown}
                trackColor={{ true: theme.colors['accent-fill'] }}
                onValueChange={(on) => void home.toggle(r.id, on).catch(failed)}
                // React Native's iOS Switch sets alignSelf: 'flex-start' (Switch.js), which beats
                // the row's centring and lifts it out of the row
                style={{ alignSelf: 'center' }}
              />
            </View>
          )
        })}
      </Group>
      <View style={{ flexDirection: 'row' }}>
        <Button variant="ghost" onPress={() => void home.reset().catch(failed)}>
          {t('serverOrder')}
        </Button>
      </View>
    </View>
  )
}

function ServersSection() {
  const t = useT(messages)
  const s = useT(shellMessages)
  const locale = useLocale()
  const servers = useServers()
  const current = useCurrent()
  const now = Date.now()
  const forget = useForget()
  const f = useT(forgetMessages)
  return (
    <View style={{ gap: 16 }}>
      <Group>
        {servers.known.map((k) => {
          const inUse = k.id === current.server.id
          return (
            <Row
              key={k.id}
              lead={<Mark size={30} />}
              title={k.name}
              detail={
                inUse
                  ? (current.base() ?? '')
                  : t(k.signedIn ? 'knownSignedIn' : 'knownSignedOut', {
                      when: relative(new Date(k.lastSeen).toISOString(), now, locale),
                    })
              }
              trailing={
                inUse ? (
                  <Badge tone="accent">{t('inUse')}</Badge>
                ) : (
                  <Press
                    onPress={() => forget(k.id, k.name)}
                    accessibilityRole="button"
                    accessibilityLabel={f('forget', { name: k.name })}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="delete" size={18} color="text-3" />
                  </Press>
                )
              }
              onPress={inUse ? undefined : () => void servers.use(k.id)}
            />
          )
        })}
      </Group>
      <Group>
        <Row icon="add" title={s('addServer')} onPress={() => router.push('/connect')} />
        <Row icon="tv" title={t('signInTv')} onPress={() => router.push('/link')} />
      </Group>
      <Group>
        <SignOutRow />
      </Group>
    </View>
  )
}

/** Sign out of the server in use, on You and in Servers as the prototype has it: the token is
 * forgotten here whether or not the server heard, since it's this phone's. */
export function SignOutRow() {
  const t = useT(messages)
  const servers = useServers()
  const name = useServerName()
  const out = useAction((c) => c.auth.signOut())
  return (
    <Row
      icon="sign-out"
      danger
      title={t('signOut', { name })}
      pending={out.pending}
      onPress={() =>
        out
          .run()
          .catch(() => {})
          .then(() => servers.signedOut())
          .catch(() => Alert.alert(t('signOutFailed')))
      }
    />
  )
}

function DevicesSection() {
  const t = useT(messages)
  const locale = useLocale()
  const session = useSessionData()
  const { devices, revoke } = useMyDevices()
  if (devices.status === 'loading') return <Quiet>{t('loading')}</Quiet>
  if (devices.status === 'error')
    return <Quiet>{t('failed', { message: devices.error.message })}</Quiet>
  const now = Date.now()
  return (
    <Group>
      {devices.data.map((d) => {
        const here = d.id === session.deviceId
        return (
          <Row
            key={d.id}
            icon={deviceIcon(d.client)}
            title={d.name}
            detail={
              here ? t('thisDevice') : t('lastUsed', { when: relative(d.lastSeen, now, locale) })
            }
            trailing={
              here ? undefined : (
                <Button
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
                  {t('signOutShort')}
                </Button>
              )
            }
          />
        )
      })}
    </Group>
  )
}

function AboutSection() {
  const t = useT(messages)
  const server = useServer()
  const name = useServerName()
  const version = server.data?.version ?? ''
  const line = (label: string, value: string, mono = true) => (
    <View style={{ flexDirection: 'row', gap: 16, paddingHorizontal: 12, paddingVertical: 12 }}>
      <Text variant="callout" color="text-3" style={{ width: 84 }}>
        {label}
      </Text>
      <Text variant="callout" mono={mono} style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  )
  return (
    <View style={{ gap: 16 }}>
      <Group>
        {line(t('thisApp'), t('appVersion', { version: appVersion }))}
        {line(t('server'), `${name} ${version}`)}
        {line(t('licence'), t('free'), false)}
      </Group>
      <View style={{ flexDirection: 'row' }}>
        <Button
          onPress={() =>
            void WebBrowser.openBrowserAsync('https://github.com/highsea-tv/highsea-tv')
          }
        >
          {t('source')}
        </Button>
      </View>
    </View>
  )
}

export function SectionBody({ id }: { id: SectionId }) {
  if (id === 'appearance') return <ThemeSection />
  if (id === 'sounds') return <SoundSection />
  if (id === 'home') return <HomeSection />
  if (id === 'servers') return <ServersSection />
  if (id === 'devices') return <DevicesSection />
  return <AboutSection />
}
