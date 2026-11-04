// SPDX-License-Identifier: AGPL-3.0-only
// C7 Settings (client-settings.md), one screen for every client, with every app's sections in the
// same order (settingsSections in @highsea-tv/client/prefs), laid out by the form factor:
// - touch, and a pointer in a compact window: the list of sections, then the one chosen on a
//   screen of its own (`?section=`), as the prototype's mobile/more.tsx;
// - a pointer in a regular window: the list beside the chosen section, as the prototype's
//   web/settings.tsx;
// - the TV: its own composition, as the prototype's tv/settings.tsx: the sections down the left,
//   each shown as focus reaches its name, with its hint above it; Playback's choices as rows of
//   chips and Home's rows moved by Up and Down. The section asked for (or the first) takes focus
//   as the screen opens, and only then (tv-choices-keep-focus).
// The sections are ported from the phone's (apps/mobile/src/settings.tsx), drawn as the prototype's
// client/settings-sections.tsx: each row its own card, radios and switches before their words.
// Theme and sound are this device's, in the server's preference layers (ADR 0027), with Use on all
// my devices as the person's own theme; Playback and the home layout follow the person; Servers is
// every server this device knows, with Add a server; Your devices signs others out; About names the
// app and the server. Signing out asks first.
import { useAppearance, useHomeLayout, useMyDevices, useServer } from '@highsea-tv/client/data'
import { forgetMessages, hostOf, shellMessages } from '@highsea-tv/client/gate'
import {
  deviceIcon,
  type PlaybackOption,
  type PlaybackPrefs,
  playbackOptions,
  SERVER_THEME,
  type SettingsSectionId,
  settingsMessages,
  settingsPageMessages,
  settingsSections,
  tvSettingsMessages,
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
  Chip,
  Field,
  Icon,
  Mark,
  Press,
  Radio,
  ScrollView,
  Select,
  SortableList,
  Switch,
  Text,
  tokens,
  useControl,
  useFormFactor,
  useTheme,
} from '@highsea-tv/ui'
import { Focusable, TV_HEAD_HEIGHT } from '@highsea-tv/ui/tv'
import { type Href, router, useLocalSearchParams } from 'expo-router'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
import { type StyleProp, StyleSheet, View, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBack } from '../../back.tsx'
import { useForget } from '../../forget.tsx'
import { useDesktopOs, useDevice, useKeepsServers } from '../../host'
import {
  ListItem,
  MARK,
  Notice,
  RADIO,
  radioState,
  Soon,
  TAB,
  TAB_ROW,
  useChromeOverlay,
  useConfirm,
  useSay,
  useServerName,
} from '../../kit.tsx'
import { LibraryTitle } from '../../library/parts.tsx'
import { TV_LIBRARY } from '../../library/sizes.ts'
import { useOpenServer } from '../../open-server.ts'

const { space } = tokens

/** A two-column page's list, beside the section: the prototype's web settings' 14rem. */
const LIST_WIDTH = space['16'] * 3 + space['8']

/** What went wrong saving, shown at the section's top, and how a section says so. */
const Failure = createContext<(e: Error) => void>(() => {})

const useSaveFailed = () => useContext(Failure)

function useSections() {
  const locale = useLocale()
  return useMemo(() => settingsSections(locale), [locale])
}

const isSection = (id: string | undefined): id is SettingsSectionId =>
  !!id && (settingsSections() as { id: string }[]).some((s) => s.id === id)

export default function Settings() {
  const { input, widthClass } = useFormFactor()
  const param = useLocalSearchParams<{ section?: string }>().section
  const chosen = isSection(param) ? param : undefined
  if (input === 'tv') return <TvSettings chosen={chosen ?? 'appearance'} />
  // a compact window has no room beside the list, so it lays out as the phone does
  if (input === 'pointer' && widthClass !== 'compact')
    return <PointerSettings chosen={chosen ?? 'appearance'} />
  return <TouchSettings chosen={chosen} />
}

const choose = (id: SettingsSectionId) => router.setParams({ section: id })

// ---------------------------------------------------------------- the layouts

/** The phone: the list, then each section on a screen of its own. */
function TouchSettings({ chosen }: { chosen: SettingsSectionId | undefined }) {
  const t = useT(settingsPageMessages)
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const sections = useSections()
  const section = sections.find((s) => s.id === chosen)
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{
        paddingTop: insets.top + space['4'],
        paddingBottom: space['6'],
        paddingHorizontal: tokens.mobile.gutter,
        gap: space['4'],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
        {section ? (
          <View style={{ marginStart: -space['2'] }}>
            <Button
              variant="ghost"
              iconOnly
              icon="arrow-left"
              accessibilityLabel={t('settings')}
              onPress={() => router.setParams({ section: undefined })}
            />
          </View>
        ) : null}
        <Text variant="largeTitle" accessibilityRole="header" style={{ flex: 1 }}>
          {section ? section.label : t('settings')}
        </Text>
      </View>
      {section ? (
        <Section id={section.id} />
      ) : (
        // no label on the list: a plain view isn't an element to VoiceOver, so iOS would drop it
        // while the web named a group the phone doesn't have; the screen's title names it
        <View style={{ gap: space['1'] }}>
          {sections.map((s) => (
            <ListItem
              key={s.id}
              icon={s.icon}
              title={s.label}
              detail={s.hint}
              onPress={() => choose(s.id)}
            />
          ))}
          <SignOutItem />
        </View>
      )}
    </ScrollView>
  )
}

/** A pointer: the list beside the section. */
function PointerSettings({ chosen }: { chosen: SettingsSectionId }) {
  const t = useT(settingsPageMessages)
  const theme = useTheme()
  const m = useControl()
  const sections = useSections()
  const section = sections.find((s) => s.id === chosen) ?? sections[0]
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      contentContainerStyle={{ padding: space['8'], gap: space['6'] }}
    >
      <Text variant="heading" accessibilityRole="header">
        {t('settings')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['8'] }}>
        <View
          collapsable={false}
          accessibilityRole={TAB_ROW}
          accessibilityLabel={t('sections')}
          style={{ width: LIST_WIDTH, gap: space['0.5'] }}
        >
          {sections.map((s) => {
            const here = s.id === section?.id
            return (
              <Press
                key={s.id}
                accessibilityRole={TAB}
                accessibilityState={{ selected: here }}
                accessibilityLabel={s.label}
                onPress={() => choose(s.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: m.gap,
                  minHeight: m.height,
                  paddingHorizontal: m.fieldPad,
                  borderRadius: m.radius,
                  backgroundColor: here ? theme.colors.s2 : 'transparent',
                }}
              >
                <Icon name={s.icon} size={tokens.icon.size.sm} color={here ? 'text' : 'text-3'} />
                <Text variant="body" weight={here ? 600 : 400} color={here ? 'text' : 'text-2'}>
                  {s.label}
                </Text>
              </Press>
            )
          })}
        </View>
        {section ? (
          <View style={{ flex: 1, minWidth: LIST_WIDTH, gap: space['4'] }}>
            <Text variant="title" accessibilityRole="header">
              {section.label}
            </Text>
            <Section id={section.id} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  )
}

/**
 * The TV: the sections down the left, and the one focus is on beside them, its hint above it, as
 * tvOS's own Settings does. Focus moving down the list shows each section without leaving the
 * name (tv-choices-keep-focus); Right enters the section, Left comes back.
 */
function TvSettings({ chosen }: { chosen: SettingsSectionId }) {
  const t = useT(settingsPageMessages)
  const theme = useTheme()
  const u = theme.u
  const m = useControl()
  const sections = useSections()
  const [section, setSection] = useState(chosen)
  // the section asked for takes focus as the screen opens, and only then: once focus has moved,
  // nothing hands it back to the first name
  const [opening, setOpening] = useState(true)
  const [first] = useState(chosen)
  const about = sections.find((s) => s.id === section) ?? sections[0]
  useBack(() => {
    router.navigate('/')
    return true
  })
  // the head lies over the page, as on every other page of the TV's, with the page's title under it
  useChromeOverlay()
  return (
    <View
      style={{
        flex: 1,
        gap: TV_LIBRARY.pageGap * u,
        paddingHorizontal: tokens.tv.safe.x * u,
        // clear of the head laid over the page
        paddingTop: (TV_HEAD_HEIGHT + TV_LIBRARY.pageGap) * u,
        paddingBottom: tokens.tv.safe.y * u,
        backgroundColor: theme.colors.bg,
      }}
    >
      {/* the title stays outside the tab row: a container with the tab bar trait gives
          assistive technology its tabs only, so a header inside it isn't read */}
      <LibraryTitle>{t('settings')}</LibraryTitle>
      <View style={{ flex: 1, flexDirection: 'row', gap: tokens.tv.rows.inset * u }}>
        {/* the sections are tabs, each showing its panel beside the list as focus reaches it. A
            view with only a role and a label is flattened away by Fabric, taking them with it
            (ViewShadowNode.cpp's formsView), so the labelled groups here keep their views */}
        <View
          collapsable={false}
          accessibilityRole={TAB_ROW}
          accessibilityLabel={t('sections')}
          style={{ width: tokens.tv.poster.width * 2 * u, gap: m.gap }}
        >
          {sections.map((s) => {
            const here = s.id === section
            return (
              <Focusable
                key={s.id}
                preferred={opening && s.id === first}
                selected={here}
                role={TAB}
                lift="row"
                ring={false}
                label={s.label}
                radius={m.radius}
                onFocus={() => {
                  setOpening(false)
                  setSection(s.id)
                }}
              >
                {(focused) => (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: m.gap,
                      minHeight: m.height,
                      paddingHorizontal: m.pad,
                      borderRadius: m.radius,
                      backgroundColor: focused
                        ? theme.colors.text
                        : here
                          ? theme.colors['control-overlay']
                          : 'transparent',
                    }}
                  >
                    {/* words only, as the prototype's tv/settings.tsx: the phone's and the web's
                      lists carry the icons */}
                    <Text
                      variant="button"
                      color={focused ? 'bg' : here ? 'text' : 'text-2'}
                      numberOfLines={1}
                    >
                      {s.label}
                    </Text>
                  </View>
                )}
              </Focusable>
            )
          })}
        </View>
        {about ? (
          <View key={about.id} style={{ flex: 1, gap: m.rowGap }}>
            <Text variant="meta" color="text-3">
              {about.hint}
            </Text>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ gap: m.rowGap, paddingBottom: m.height }}
            >
              <Section id={about.id} />
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  )
}

/** A section's body, with what went wrong saving at its top. */
function Section({ id }: { id: SettingsSectionId }) {
  const t = useT(settingsPageMessages)
  const [failure, setFailure] = useState<string | null>(null)
  const failed = useMemo(
    () => (e: Error) => setFailure(t('saveFailed', { message: e.message })),
    [t],
  )
  return (
    <Failure.Provider value={failed}>
      <View style={{ gap: space['4'] }}>
        {failure ? <Notice>{failure}</Notice> : null}
        <SectionBody id={id} />
      </View>
    </Failure.Provider>
  )
}

function SectionBody({ id }: { id: SettingsSectionId }) {
  if (id === 'appearance') return <ThemeSection />
  if (id === 'sounds') return <SoundSection />
  if (id === 'playback') return <PlaybackSection />
  if (id === 'home') return <HomeSection />
  if (id === 'servers') return <ServersSection />
  if (id === 'devices') return <DevicesSection />
  return <AboutSection />
}

// ---------------------------------------------------------------- the sections' parts

function Quiet({ children }: { children: string }) {
  return (
    <Text variant="caption" color="text-3">
      {children}
    </Text>
  )
}

/** A settings row on its own card, as the prototype's: s1, `line`, radius-md, a control's height and more. */
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
  const m = useControl()
  return (
    <View
      style={[
        {
          minHeight: m.height + space['5'],
          flexDirection: 'row',
          alignItems: 'center',
          gap: m.gap + space['1'],
          paddingHorizontal: m.fieldPad,
          paddingVertical: m.gap,
          borderRadius: tokens.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
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

/** A card's words: the name, and a quieter line under it. */
function Words({ title, detail, dim }: { title: string; detail?: string; dim?: boolean }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text variant="body" color={dim ? 'text-3' : 'text'} numberOfLines={1}>
        {title}
      </Text>
      {detail ? (
        <Text variant="caption" color="text-3" numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

/** Three dots of a theme's colours, as the web's swatches. */
function Swatch({
  theme,
  size = tokens.icon.size.sm,
  gap = space['1'],
}: {
  theme: NativeTheme
  /** A dot's width, and the space between dots: the TV passes its units. */
  size?: number
  gap?: number
}) {
  const current = useTheme()
  const dot = size
  return (
    <View style={{ flexDirection: 'row', gap }}>
      {(['bg', 's2', 'accent'] as const).map((r) => (
        <View
          key={r}
          style={{
            width: dot,
            height: dot,
            borderRadius: tokens.radius.pill,
            backgroundColor: theme.colors[r],
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: current.colors['line-strong'],
          }}
        />
      ))}
    </View>
  )
}

// ---------------------------------------------------------------- the sections

function ThemeSection() {
  const t = useT(settingsPageMessages)
  const s = useT(settingsMessages)
  const tv = useFormFactor().input === 'tv'
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
  const choices: ThemeChoice[] = [
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
  if (tv)
    return (
      <TvTheme
        label={s('appearance')}
        choices={choices}
        chosen={p.chosen}
        everywhere={everywhere}
        pending={prefs.pending}
        pick={(id) => void prefs.setTheme(id).catch(failed)}
        setEverywhere={(on) => void prefs.setEverywhere(on).catch(failed)}
      />
    )
  return (
    <View style={{ gap: space['4'] }}>
      <View accessibilityRole="radiogroup" style={{ gap: space['2'] }}>
        <Quiet>{everywhere ? t('themeEverywhere') : t('themeDevice')}</Quiet>
        {choices.map((c) => {
          const chosen = p.chosen === c.id
          const pick = () => void prefs.setTheme(c.id).catch(failed)
          return (
            <Press
              key={c.id}
              onPress={pick}
              disabled={prefs.pending}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={c.detail ? `${c.name}, ${c.detail}` : c.name}
            >
              <Card chosen={chosen}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Radio label={c.name} hideLabel checked={chosen} onCheckedChange={pick} />
                </View>
                <Words title={c.name} detail={c.detail} />
                {c.theme ? <Swatch theme={c.theme} /> : null}
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
  const t = useT(settingsPageMessages)
  const prefs = useDevicePrefs()
  const appearance = useAppearance()
  const name = useServerName()
  const failed = useSaveFailed()
  const p = prefs.current
  const device = useDevice()
  const tv = useFormFactor().input === 'tv'
  if (!p) return <Quiet>{t('loading')}</Quiet>
  const fallback = appearance.data?.sound[device] ?? false
  if (tv)
    return (
      <TvSounds
        on={p.sound}
        hint={
          p.soundChosen
            ? t('setHere')
            : t(fallback ? 'followingOn' : 'followingOff', { name, device })
        }
        set={(sound) => void prefs.setSound(sound).catch(failed)}
        follow={
          p.soundChosen
            ? {
                label: t('followAgain', { name }),
                run: () => void prefs.setSound(null).catch(failed),
              }
            : undefined
        }
      />
    )
  return (
    <View style={{ gap: space['4'], alignItems: 'stretch' }}>
      <Switch
        label={t('sounds')}
        hint={
          p.soundChosen
            ? t('setHere')
            : t(fallback ? 'followingOn' : 'followingOff', { name, device })
        }
        checked={p.sound}
        onCheckedChange={(sound) => void prefs.setSound(sound).catch(failed)}
      />
      {p.soundChosen ? (
        <View style={{ flexDirection: 'row' }}>
          <Button variant="ghost" onPress={() => void prefs.setSound(null).catch(failed)}>
            {t('followAgain', { name })}
          </Button>
        </View>
      ) : null}
    </View>
  )
}

/**
 * Playback: the languages a film starts in, subtitles only when the audio isn't in the person's
 * language, and how much the server sends at home and away. Saved to the person.
 */
function PlaybackSection() {
  const t = useT(settingsPageMessages)
  const locale = useLocale()
  const choices = useMemo(() => playbackOptions(locale), [locale])
  const tv = useFormFactor().input === 'tv'
  const prefs = usePlaybackPrefs()
  const failed = useSaveFailed()
  const p = prefs.current
  if (!p) return <Quiet>{t('loading')}</Quiet>
  const set = (patch: Partial<PlaybackPrefs>) => void prefs.set(patch).catch(failed)
  if (tv) return <TvPlayback p={p} set={set} />
  return (
    <View style={{ gap: space['5'] }}>
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
  const t = useT(settingsPageMessages)
  const home = useHomeLayout()
  const failed = useSaveFailed()
  const tv = useFormFactor().input === 'tv'
  if (home.status !== 'success') return <Quiet>{t('loading')}</Quiet>
  // built-in rows have no title from the server; the client names them
  const title = (r: { id: string; title: string | null }) =>
    r.title ??
    (r.id === 'continue' ? t('row.continue') : r.id === 'recent' ? t('row.recent') : r.id)
  if (tv) return <TvHome title={title} />
  return (
    <View style={{ gap: space['3'] }}>
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
  const t = useT(settingsPageMessages)
  const s = useT(shellMessages)
  const f = useT(forgetMessages)
  const locale = useLocale()
  const servers = useServers()
  const current = useCurrent()
  const { forget, prompt } = useForget()
  const device = useDevice()
  const keeps = useKeepsServers()
  const tv = useFormFactor().input === 'tv'
  const open = useOpenServer()
  const [refused, setRefused] = useState<string | null>(null)
  const now = Date.now()
  const at = current.connection.current()
  return (
    <View style={{ gap: space['3'] }}>
      <View accessibilityLabel={t('serversList')} style={{ gap: space['2'] }}>
        {servers.known.map((k) => {
          const inUse = k.id === current.server.id
          return (
            <Press
              key={k.id}
              // forgetting a server is VoiceOver's action and a long press, as Choose a server's
              onLongPress={inUse ? undefined : () => forget(k.id, k.name)}
              accessibilityActions={
                inUse ? undefined : [{ name: 'forget', label: f('forget', { name: k.name }) }]
              }
              onAccessibilityAction={inUse ? undefined : () => forget(k.id, k.name)}
            >
              <Card>
                <Mark size={MARK} />
                <Words
                  title={k.name}
                  detail={
                    inUse
                      ? at
                        ? t(at.kind === 'remote' ? 'remotely' : 'onNetwork', {
                            address: hostOf(at.url),
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
                  <Button
                    size="sm"
                    onPress={() => {
                      setRefused(null)
                      void open.openKnown(k.id).then(setRefused)
                    }}
                  >
                    {k.signedIn ? t('switchServer') : t('signInServer')}
                  </Button>
                )}
              </Card>
            </Press>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] }}>
        {keeps ? (
          <Button icon="add" onPress={() => router.push('/connect')}>
            {/* the TV lists what answers on its network, so it picks another rather than adding */}
            {tv ? s('anotherServer') : s('addServer')}
          </Button>
        ) : null}
        {device === 'phone' ? (
          // the phone approves a TV's code, so nobody types on the TV (connectivity.md › Sign in a
          // TV); its screen, /link, comes with part B
          <Button icon="tv" onPress={() => router.push('/link' as Href)}>
            {t('signInTv')}
          </Button>
        ) : null}
        <SignOutButton />
      </View>
      {refused ? <Notice>{refused}</Notice> : null}
      {device === 'web' ? <Quiet>{t('serversNote')}</Quiet> : null}
      {prompt}
    </View>
  )
}

/** Asks first, then forgets this device's sign-in whether or not the server heard. */
function useSignOut() {
  const t = useT(settingsPageMessages)
  const servers = useServers()
  const name = useServerName()
  const out = useAction((c) => c.auth.signOut())
  const { ask, prompt } = useConfirm()
  const device = useDevice()
  const current = useCurrent()
  const say = useSay()
  const [failure, setFailure] = useState<string | null>(null)
  const signOut = async () => {
    setFailure(null)
    try {
      await out.run()
    } catch {
      // a device token is this device's own sign-in, forgotten whether or not the server heard; a
      // browser's is the server's cookie, which only the server can end: starting again would
      // sign straight back in with it
      if (!current.token) return setFailure(t('signOutFailed'))
    }
    try {
      await servers.signedOut()
      say({
        title: t('signedOut', { name }),
        body: device === 'tv' ? undefined : t('signedOutBody'),
        next: true,
      })
    } catch {
      setFailure(t('signOutFailed'))
    }
  }
  const run = () =>
    ask({
      title: t('signOutAsk', { name }),
      body: t('signOutBody', { device }),
      cancel: t('cancel'),
      action: t('signOutShort'),
      icon: 'sign-out',
      run: () => void signOut(),
    })
  return { run, pending: out.pending, name, prompt, failure }
}

/** Servers' Sign out of {name}: a ghost button beside Add a server, as the prototype's. */
function SignOutButton() {
  const t = useT(settingsPageMessages)
  const out = useSignOut()
  return (
    <>
      <Button variant="ghost" icon="sign-out" loading={out.pending} onPress={out.run}>
        {t('signOut', { name: out.name })}
      </Button>
      {out.failure ? <Notice>{out.failure}</Notice> : null}
      {out.prompt}
    </>
  )
}

/** Sign out of the server in use, at the foot of the phone's list. */
function SignOutItem() {
  const t = useT(settingsPageMessages)
  const out = useSignOut()
  return (
    <>
      <ListItem
        icon="sign-out"
        danger
        title={t('signOut', { name: out.name })}
        pending={out.pending}
        onPress={out.run}
      />
      {out.failure ? <Notice>{out.failure}</Notice> : null}
      {out.prompt}
    </>
  )
}

function DevicesSection() {
  const t = useT(settingsPageMessages)
  const locale = useLocale()
  const session = useSessionData()
  const { devices, revoke } = useMyDevices()
  const failed = useSaveFailed()
  const [done, setDone] = useState<string | null>(null)
  // the TV asks first (client-settings.md › Stage 4): a press there is easily a slip of the remote
  const tv = useFormFactor().input === 'tv'
  const { ask, prompt } = useConfirm()
  if (devices.status === 'loading') return <Quiet>{t('loading')}</Quiet>
  if (devices.status === 'error')
    return <Quiet>{t('failed', { message: devices.error.message })}</Quiet>
  const now = Date.now()
  return (
    <View accessibilityLabel={t('devicesList')} style={{ gap: space['2'] }}>
      {done ? (
        <Text variant="callout" color="text-2" accessibilityLiveRegion="polite">
          {done}
        </Text>
      ) : null}
      {devices.data.map((d) => {
        const here = d.id === session.deviceId
        return (
          <Card key={d.id}>
            <Icon name={deviceIcon(d.client)} size={tokens.icon.size.md} color="text-3" />
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
                onPress={() => {
                  const go = () =>
                    void revoke(d.id).then(() => {
                      devices.refresh()
                      setDone(t('deviceSignedOut', { name: d.name }))
                    }, failed)
                  if (!tv) return go()
                  ask({
                    title: t('signOutDeviceAsk', { name: d.name }),
                    body: t('signOutDeviceBody'),
                    cancel: t('cancel'),
                    action: t('signOutShort'),
                    icon: 'sign-out',
                    run: go,
                  })
                }}
              >
                {t('signOutShort')}
              </Button>
            )}
          </Card>
        )
      })}
      {prompt}
    </View>
  )
}

function AboutSection() {
  const t = useT(settingsPageMessages)
  const server = useServer()
  const name = useServerName()
  const device = useDevice()
  // a browser offers the apps; the apps, the desktop app among them, don't (desktop-app.md)
  const keeps = useKeepsServers()
  const browser = device === 'web' && !keeps
  // the prototype's line: the OS only in the desktop app
  const os = useDesktopOs()
  const version = server.data?.version ?? ''
  // the prototype's two columns: the names in text-3 sized to the longest, the values beside them
  const lines: [string, string, boolean][] = [
    [t('thisApp'), t('appVersion', { version: appVersion, os: os ?? 'none' }), true],
    [t('server'), `${name} ${version}`, true],
    [t('licence'), t('free'), false],
  ]
  return (
    <View style={{ gap: space['4'] }}>
      <View style={{ flexDirection: 'row', columnGap: space['6'] }}>
        <View style={{ gap: space['2'] }}>
          {lines.map(([label]) => (
            <Text key={label} variant="body" color="text-3" numberOfLines={1}>
              {label}
            </Text>
          ))}
        </View>
        <View style={{ flex: 1, gap: space['2'] }}>
          {lines.map(([label, value, mono]) => (
            <Text key={label} variant="body" mono={mono} numberOfLines={1}>
              {value}
            </Text>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] }}>
        {/* Get the apps' dialog comes with part B */}
        {browser ? <Soon icon="laptop">{t('getApps')}</Soon> : null}
        <Soon>{t('licences')}</Soon>
        <Soon>{t('diagnostics')}</Soon>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------- the TV's own sections

type ThemeChoice = { id: string; name: string; detail: string; theme?: NativeTheme }

/**
 * The TV's Theme, as the prototype's tv/settings.tsx: one row a theme, its mark, name, where it's
 * from and its colours, focus filling the row, and below them a button that says whether the theme
 * goes to every device, with a line saying what that means. Sizes are the TV's units (1u, the
 * prototype's 1cqw).
 */
function TvTheme({
  label,
  choices,
  chosen,
  everywhere,
  pending,
  pick,
  setEverywhere,
}: {
  /** The section's name, for the list of themes. */
  label: string
  choices: ThemeChoice[]
  chosen: string
  everywhere: boolean
  pending: boolean
  pick: (id: string) => void
  setEverywhere: (on: boolean) => void
}) {
  const v = useT(tvSettingsMessages)
  const theme = useTheme()
  const u = theme.u
  // the rows are controls, measured by the control spec, corner included (radius-sm, the owner
  // 2026-11-03)
  const m = useControl()
  const corner = m.radius
  return (
    <View style={{ gap: tokens.tv.poster.gap * u }}>
      <View
        collapsable={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ gap: m.inset }}
      >
        {choices.map((c) => {
          const on = chosen === c.id
          return (
            <Focusable
              key={c.id}
              role={RADIO}
              state={radioState(on)}
              selected={radioState(on).selected}
              label={c.detail ? `${c.name}, ${c.detail}` : c.name}
              lift="row"
              ring={false}
              radius={corner}
              disabled={pending}
              onPress={() => pick(c.id)}
            >
              {(focused) => {
                const fg = focused ? 'bg' : on ? 'text' : 'text-2'
                return (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: m.fieldPad,
                      paddingHorizontal: m.pad,
                      paddingVertical: m.gap,
                      borderRadius: corner,
                      backgroundColor: focused ? theme.colors.text : 'transparent',
                    }}
                  >
                    <View
                      style={{
                        width: m.icon,
                        height: m.icon,
                        borderRadius: tokens.radius.pill,
                        borderWidth: tokens.focus.tv.width * u,
                        borderColor: theme.colors[fg],
                        backgroundColor: on ? theme.colors[fg] : 'transparent',
                      }}
                    />
                    <Text variant="button" color={fg} numberOfLines={1} style={{ flex: 1 }}>
                      {c.name}
                    </Text>
                    <Text variant="pill" color={fg} style={{ opacity: 0.7 }}>
                      {c.detail}
                    </Text>
                    {c.theme ? <Swatch theme={c.theme} size={m.icon} gap={m.inset} /> : null}
                  </View>
                )
              }}
            </Focusable>
          )
        })}
      </View>
      <View style={{ alignItems: 'flex-start', gap: m.gap }}>
        <Button
          variant={everywhere ? 'primary' : 'secondary'}
          disabled={pending}
          onPress={() => setEverywhere(!everywhere)}
        >
          {everywhere ? v('everywhereOn') : v('everywhereOff')}
        </Button>
        <Text variant="meta" color="text-3">
          {everywhere ? v('everywhereTv') : v('onlyThisTv')}
        </Text>
      </View>
    </View>
  )
}

/**
 * The TV's Sounds, as the prototype's tv/settings.tsx: a button that says whether interface sounds
 * are on, and where the setting comes from under it. The prototype's volume steps wait for the
 * apps' sound player, which isn't in part A.
 */
function TvSounds({
  on,
  hint,
  set,
  follow,
}: {
  on: boolean
  hint: string
  set: (on: boolean) => void
  follow?: { label: string; run: () => void }
}) {
  const v = useT(tvSettingsMessages)
  const m = useControl()
  return (
    <View style={{ alignItems: 'flex-start', gap: m.gap }}>
      <View style={{ flexDirection: 'row', gap: m.rowGap }}>
        <Button variant={on ? 'primary' : 'secondary'} onPress={() => set(!on)}>
          {on ? v('soundsOn') : v('soundsOff')}
        </Button>
        {follow ? (
          <Button variant="ghost" onPress={follow.run}>
            {follow.label}
          </Button>
        ) : null}
      </View>
      <Text variant="meta" color="text-3">
        {hint}
      </Text>
    </View>
  )
}

/**
 * The TV's Playback: each setting's name and its choices as a row of chips, the one chosen
 * pressed, as the prototype's tv/settings.tsx; Left and Right move along a row.
 */
function TvPlayback({
  p,
  set,
}: {
  p: PlaybackPrefs
  set: (patch: Partial<PlaybackPrefs>) => void
}) {
  const t = useT(settingsPageMessages)
  const v = useT(tvSettingsMessages)
  const locale = useLocale()
  const choices = useMemo(() => playbackOptions(locale), [locale])
  const m = useControl()
  return (
    <View style={{ gap: m.rowGap }}>
      <Choices
        label={v('audio')}
        options={choices.audio}
        value={p.audio}
        onPick={(audio) => set({ audio })}
      />
      <Choices
        label={v('subtitles')}
        options={choices.subtitles}
        value={p.subtitles}
        onPick={(subtitles) => set({ subtitles })}
      />
      {p.subtitles !== 'off' ? (
        <Switch
          label={t('onlyForeign')}
          checked={p.onlyForeign}
          onCheckedChange={(onlyForeign) => set({ onlyForeign })}
        />
      ) : null}
      <Choices
        label={v('atHome')}
        options={choices.quality}
        value={p.qualityHome}
        onPick={(q) => set({ qualityHome: q as PlaybackPrefs['qualityHome'] })}
      />
      <Choices
        label={v('away')}
        options={choices.quality}
        value={p.qualityAway}
        onPick={(q) => set({ qualityAway: q as PlaybackPrefs['qualityAway'] })}
      />
      <Quiet>{t('playbackFollows')}</Quiet>
    </View>
  )
}

/** A setting's name and its choices as chips, the one chosen pressed. */
function Choices({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: PlaybackOption[]
  value: string
  onPick: (v: string) => void
}) {
  const u = useTheme().u
  const m = useControl()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: m.gap }}>
      <Text variant="meta" color="text-2" style={{ width: tokens.tv.poster.width * u }}>
        {label}
      </Text>
      <View
        collapsable={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: m.gap }}
      >
        {options.map((o) => (
          <Chip
            key={o.value}
            // one choice of the group's, which Chip reads as checked and selected
            accessibilityRole="radio"
            selected={o.value === value}
            onPress={() => onPick(o.value)}
          >
            {o.short ?? o.label}
          </Chip>
        ))}
      </View>
    </View>
  )
}

/**
 * The TV's Home screen rows: OK on a row shows or hides it, and Up and Down beside it move it, as
 * the prototype's tv/settings.tsx; the remote has no drag.
 */
function TvHome({ title }: { title: (r: { id: string; title: string | null }) => string }) {
  const t = useT(settingsPageMessages)
  const v = useT(tvSettingsMessages)
  const m = useControl()
  const home = useHomeLayout()
  const failed = useSaveFailed()
  if (home.status !== 'success') return <Quiet>{t('loading')}</Quiet>
  return (
    <View style={{ gap: m.rowGap }}>
      <Quiet>{v('homeIntro')}</Quiet>
      <View accessibilityLabel={t('homeRows')} style={{ gap: m.gap }}>
        {home.rows.map((r, i) => {
          const shown = !home.hidden.includes(r.id)
          return (
            <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: m.gap }}>
              <View style={{ flex: 1 }}>
                <Switch
                  label={title(r)}
                  checked={shown}
                  onCheckedChange={(on) => void home.toggle(r.id, on).catch(failed)}
                />
              </View>
              <Button
                variant="overlay"
                accessibilityLabel={t('moveUp', { title: title(r) })}
                disabled={i === 0}
                onPress={() => void home.move(r.id, -1)?.catch(failed)}
              >
                {v('up')}
              </Button>
              <Button
                variant="overlay"
                accessibilityLabel={t('moveDown', { title: title(r) })}
                disabled={i === home.rows.length - 1}
                onPress={() => void home.move(r.id, 1)?.catch(failed)}
              >
                {v('down')}
              </Button>
            </View>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Button variant="overlay" onPress={() => void home.reset().catch(failed)}>
          {t('serverOrder')}
        </Button>
      </View>
    </View>
  )
}
