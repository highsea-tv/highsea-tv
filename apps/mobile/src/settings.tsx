// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings on the phone (client-settings.md), each section its own screen under You, ported
// from apps/web/src/settings.tsx with the prototype's mobile wording. Theme and sound are this
// device's, in the server's preference layers (ADR 0027), with Use on all my devices as the
// person's own theme; Playback (the languages and the quality at home and away) and the home
// layout follow the person, the rows dragged by their handles; the sections are every app's
// (settingsSections in @highsea-tv/client/prefs). Servers is every server this phone knows
// (connectivity.md), with Add a server and Sign in a TV; Your devices signs others out; About names
// the app and the server. Signing out asks first, as the prototype's does. Drawn as the prototype's
// settings-sections.tsx: each row its own card (`Card`), radios and switches before their words.
import { useAppearance, useHomeLayout, useMyDevices, useServer } from '@highsea-tv/client/data'
import {
  deviceIcon,
  type PlaybackPrefs,
  playbackOptions,
  SERVER_THEME,
  type SettingsSectionId,
  SOURCE,
  settingsSections,
  useDevicePrefs,
  usePlaybackPrefs,
} from '@highsea-tv/client/prefs'
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
  Field,
  Icon,
  Mark,
  Press,
  Radio,
  Select,
  SortableList,
  Switch,
  Text,
  tokens,
  useTheme,
} from '@highsea-tv/ui'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { type ReactNode, useMemo } from 'react'
import { Alert, type StyleProp, View, type ViewStyle } from 'react-native'
import { useForget } from './forget.ts'
import { Row } from './kit.tsx'
import {
  forget as forgetMessages,
  home as homeMessages,
  you as messages,
  shell as shellMessages,
} from './messages.ts'
import { useServerName } from './shell.tsx'

/** Settings' sections with their names and icons, the same in every app and in this order. */
export function useSections() {
  const locale = useLocale()
  return useMemo(() => settingsSections(locale), [locale])
}

export type SectionId = SettingsSectionId

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

/** A settings row on its own card, as the prototype's: s1, `line`, radius-md, at least 56 tall. */
function Card({
  children,
  chosen,
  style,
}: {
  children: ReactNode
  chosen?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  return (
    <View
      style={[
        {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderRadius: tokens.radius.md,
          borderWidth: 1,
          borderColor: theme.colors[chosen ? 'accent' : 'line'],
          backgroundColor: theme.colors.s1,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** A card's words: the name, and a quieter line under it, at kit's Row's sizes. */
function Words({ title, detail, dim }: { title: string; detail?: string; dim?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="body" size={15} color={dim ? 'text-3' : 'text'} numberOfLines={1}>
        {title}
      </Text>
      {detail ? (
        <Text variant="caption" size={13} color="text-3" numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </View>
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
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        <Quiet>{everywhere ? t('themeEverywhere') : t('themeDevice')}</Quiet>
        {choices.map((c) => {
          const chosen = p.chosen === c.id
          const choose = () => void prefs.setTheme(c.id).catch(failed)
          return (
            <Press
              key={c.id}
              onPress={choose}
              disabled={prefs.pending}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={c.detail ? `${c.name}, ${c.detail}` : c.name}
            >
              <Card chosen={chosen}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Radio label={c.name} hideLabel checked={chosen} onCheckedChange={choose} />
                </View>
                <Words title={c.name} detail={c.detail} />
                {c.theme && <Swatch theme={c.theme} />}
              </Card>
            </Press>
          )
        })}
      </View>
      <Switch
        label={t('everywhere')}
        hint={everywhere ? t('everywhereOn') : t('everywhereOff')}
        checked={everywhere}
        disabled={prefs.pending}
        onCheckedChange={(on) => void prefs.setEverywhere(on).catch(failed)}
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
      <Switch
        label={t('sounds')}
        hint={
          p.soundChosen
            ? t('setHere')
            : t(fallback ? 'followingOn' : 'followingOff', { name, device: 'phone' })
        }
        checked={p.sound}
        onCheckedChange={(sound) => void prefs.setSound(sound).catch(failed)}
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

/**
 * Playback, as the prototype has it: the languages a film starts in, subtitles only when the audio
 * isn't in the person's language, and how much the server sends at home and away. Saved to the
 * person, so every device follows. Episodes' rows (the next one, intros) wait for shows.
 */
function PlaybackSection() {
  const t = useT(messages)
  const locale = useLocale()
  const choices = useMemo(() => playbackOptions(locale), [locale])
  const prefs = usePlaybackPrefs()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <Quiet>{t('loading')}</Quiet>
  const set = (patch: Partial<PlaybackPrefs>) => void prefs.set(patch).catch(failed)
  return (
    <View style={{ gap: 20 }}>
      <Field label={t('audioLanguage')} hint={t('audioLanguageHint')}>
        <Select value={p.audio} onValueChange={(audio) => set({ audio })} options={choices.audio} />
      </Field>
      <Field label={t('subtitleLanguage')}>
        <Select
          value={p.subtitles}
          onValueChange={(subtitles) => set({ subtitles })}
          options={choices.subtitles}
        />
      </Field>
      <Switch
        label={t('onlyForeign')}
        hint={t('onlyForeignHint')}
        checked={p.onlyForeign}
        disabled={p.subtitles === 'off'}
        onCheckedChange={(onlyForeign) => set({ onlyForeign })}
      />
      <Field label={t('qualityHome')} hint={t('qualityHomeHint')}>
        <Select
          value={p.qualityHome}
          onValueChange={(v) => set({ qualityHome: v as PlaybackPrefs['qualityHome'] })}
          options={choices.quality}
        />
      </Field>
      <Field label={t('qualityAway')} hint={t('qualityAwayHint')}>
        <Select
          value={p.qualityAway}
          onValueChange={(v) => set({ qualityAway: v as PlaybackPrefs['qualityAway'] })}
          options={choices.quality}
        />
      </Field>
      <Quiet>{t('playbackFollows')}</Quiet>
    </View>
  )
}

function HomeSection() {
  const t = useT(messages)
  const h = useT(homeMessages)
  const home = useHomeLayout()
  const failed = useSaveFailed()
  if (home.status !== 'success') return <Quiet>{t('loading')}</Quiet>
  // built-in rows have no title from the server; this app names them
  const title = (r: { id: string; title: string | null }) =>
    r.title ?? (r.id === 'continue' ? h('continue') : r.id === 'recent' ? h('recent') : r.id)
  return (
    <View style={{ gap: 12 }}>
      <Quiet>{t('homeIntro')}</Quiet>
      <SortableList
        accessibilityLabel={t('homeRows')}
        items={home.rows}
        id={(r) => r.id}
        label={title}
        onChange={(next) => void home.reorder(next.map((r) => r.id)).catch(failed)}
        messages={{
          move: (name) => t('moveRow', { title: name }),
          moveUp: (name) => t('moveUp', { title: name }),
          moveDown: (name) => t('moveDown', { title: name }),
          moved: (name, index, count) => t('moved', { title: name, index, count }),
        }}
      >
        {(r, handle) => {
          const shown = !home.hidden.includes(r.id)
          return (
            <>
              {handle}
              <Words title={title(r)} dim={!shown} />
              <Switch
                label={t('showRow', { title: title(r) })}
                hideLabel
                checked={shown}
                onCheckedChange={(on) => void home.toggle(r.id, on).catch(failed)}
              />
            </>
          )
        }}
      </SortableList>
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
  const name = useServerName()
  const at = current.connection.current()
  const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <View style={{ gap: 12 }}>
      <View accessibilityLabel={t('serversList')} style={{ gap: 8 }}>
        {servers.known.map((k) => {
          const inUse = k.id === current.server.id
          return (
            <Press
              key={k.id}
              // forgetting a server is VoiceOver's action and a long press, as You's rows are
              onLongPress={inUse ? undefined : () => forget(k.id, k.name)}
              accessibilityActions={
                inUse ? undefined : [{ name: 'forget', label: f('forget', { name: k.name }) }]
              }
              onAccessibilityAction={inUse ? undefined : () => forget(k.id, k.name)}
            >
              <Card>
                <Mark size={26} />
                <Words
                  title={k.name}
                  detail={
                    inUse
                      ? at
                        ? t(at.kind === 'remote' ? 'remotely' : 'onNetwork', {
                            address: host(at.url),
                          })
                        : t('unreachable')
                      : t(k.signedIn ? 'knownSignedIn' : 'knownSignedOut', {
                          when: relative(new Date(k.lastSeen).toISOString(), now, locale),
                        })
                  }
                />
                {inUse ? (
                  <Badge tone="accent">{t('inUse')}</Badge>
                ) : (
                  <Button size="sm" onPress={() => void servers.use(k.id)}>
                    {k.signedIn ? t('switchServer') : t('signInServer')}
                  </Button>
                )}
              </Card>
            </Press>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button icon="add" onPress={() => router.push('/connect')}>
          {s('addServer')}
        </Button>
        <Button icon="tv" onPress={() => router.push('/link')}>
          {t('signInTv')}
        </Button>
        <SignOutButton name={name} />
      </View>
    </View>
  )
}

/** Asks first, then forgets this phone's token whether or not the server heard, since it's this phone's. */
function useSignOut() {
  const t = useT(messages)
  const servers = useServers()
  const name = useServerName()
  const out = useAction((c) => c.auth.signOut())
  const ask = () =>
    Alert.alert(t('signOutAsk', { name }), t('signOutBody', { device: 'phone' }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('signOutShort'),
        style: 'destructive',
        onPress: () =>
          void out
            .run()
            .catch(() => {})
            .then(() => servers.signedOut())
            .catch(() => Alert.alert(t('signOutFailed'))),
      },
    ])
  return { ask, pending: out.pending }
}

/** Servers' Sign out of {name}: a ghost button beside Add a server, as the prototype's. */
function SignOutButton({ name }: { name: string }) {
  const t = useT(messages)
  const out = useSignOut()
  return (
    <Button variant="ghost" icon="sign-out" loading={out.pending} onPress={out.ask}>
      {t('signOut', { name })}
    </Button>
  )
}

/** Sign out of the server in use, on You as the prototype has it. */
export function SignOutRow() {
  const t = useT(messages)
  const name = useServerName()
  const out = useSignOut()
  return (
    <Row
      icon="sign-out"
      danger
      title={t('signOut', { name })}
      pending={out.pending}
      onPress={out.ask}
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
    <View accessibilityLabel={t('devicesList')} style={{ gap: 8 }}>
      {devices.data.map((d) => {
        const here = d.id === session.deviceId
        return (
          <Card key={d.id}>
            <Icon name={deviceIcon(d.client)} size={18} color="text-3" />
            <Words
              title={d.name}
              detail={
                here ? t('thisDevice') : t('lastUsed', { when: relative(d.lastSeen, now, locale) })
              }
            />
            {here || d.client === 'admin' ? null : (
              <Button
                size="sm"
                accessibilityLabel={t('signOutDevice', { name: d.name })}
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
            )}
          </Card>
        )
      })}
    </View>
  )
}

function AboutSection() {
  const t = useT(messages)
  const server = useServer()
  const name = useServerName()
  const version = server.data?.version ?? ''
  // the prototype's two columns: the names in text-3 sized to the longest, the values beside them
  const lines: [string, string, boolean][] = [
    [t('thisApp'), t('appVersion', { version: appVersion, os: 'iPhone' }), true],
    [t('server'), `${name} ${version}`, true],
    [t('licence'), t('free'), false],
  ]
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', columnGap: 24 }}>
        <View style={{ gap: 8 }}>
          {lines.map(([label]) => (
            <Text key={label} variant="body" color="text-3" numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1, gap: 8 }}>
          {lines.map(([label, value, mono]) => (
            <Text key={label} variant="body" mono={mono} numberOfLines={1}>
              {value}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button size="sm" onPress={() => void WebBrowser.openBrowserAsync(SOURCE)}>
          {t('source')}
        </Button>
      </View>
    </View>
  )
}

export function SectionBody({ id }: { id: SectionId }) {
  if (id === 'appearance') return <ThemeSection />
  if (id === 'sounds') return <SoundSection />
  if (id === 'playback') return <PlaybackSection />
  if (id === 'home') return <HomeSection />
  if (id === 'servers') return <ServersSection />
  if (id === 'devices') return <DevicesSection />
  return <AboutSection />
}
