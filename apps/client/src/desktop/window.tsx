// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's window chrome (desktop-app.md › The window), from the prototype's
// web/window.tsx and apps/web's desktop/window.tsx, drawn only in the desktop app (useDesktopHost):
// - macOS: the window has no title bar; its own buttons sit over the top bar, 20 from the window's
//   edge (Tauri's `titleBarStyle: "Overlay"`), and the top bar leaves 84 for them and moves the
//   window. Only the prototypes' frames draw the buttons themselves (`drawsSystemButtons`). A page
//   without the top bar (Choose a server, its sign-in) has a 32 strip at the top that moves it.
// - Windows and Linux: no system frame (`decorations: false`), so a 32 title bar in `bg` above
//   the top bar: the mark and "highsea", then the window's buttons in the platform's shape. They
//   aren't in the tab order, as the system's aren't; the system's shortcuts work. On the player it
//   lies over the film without its background (`overlay`).
// - Back and Forward at the start of the top bar (prototype-gaps stage 4): the webview has none of
//   a browser's, so the app keeps its own trail, with the platform's keys and the mouse's buttons.
// Tauri moves the window from any element marked `data-tauri-drag-region`
// (https://v2.tauri.app/learn/window-customization/), which react-native-web writes from `dataSet`.
import { useT } from '@highsea-tv/i18n/react'
import { web } from '@highsea-tv/tokens'
import { Button, Mark, Press, Text, tokens, useTheme } from '@highsea-tv/ui'
import { router, useGlobalSearchParams, usePathname } from 'expo-router'
import { useEffect, useSyncExternalStore } from 'react'
import { Platform, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native'
import { type DesktopOs, useDesktopHost } from './host.ts'
import { desktopWindowMessages } from './messages.ts'

const { space } = tokens

/** The title bar's height on Windows and Linux (the prototype's `h-8`). */
export const TITLE_BAR_HEIGHT = space['8']

/** Where the top bar's content may start on a Mac: macOS's buttons take 20 + 52 and a 12 gap. */
export const TRAFFIC_LIGHT_ROOM = space['16'] + space['5']

/** Windows' caption buttons are 46 wide (Windows' own title bar). */
const CAPTION_WIDTH = 46
/** Windows' Close on hover, the system's red (the prototype's #c42b1c). */
const WINDOWS_CLOSE = { fill: '#c42b1c', glyph: '#ffffff' }
/** macOS's close, minimise and zoom, as the system draws them (the prototype's stand-ins). */
const TRAFFIC_LIGHTS = ['#ff5f57', '#febc2e', '#28c840'] as const

/** react-native-web's `dataSet`, which React Native's types don't list. */
const DRAG = { dataSet: { tauriDragRegion: '' } } as object
/** Marks the prototypes' stand-ins for macOS's buttons (`data-window-buttons="mac"`). */
const MAC_BUTTONS = { dataSet: { windowButtons: 'mac' } } as object

/** What the window draws for its chrome: none, macOS's overlay, or Windows' and Linux's bar. */
export type WindowChromeKind = 'none' | 'mac' | 'bar'

export function useWindowChrome(): WindowChromeKind {
  const host = useDesktopHost()
  if (!host) return 'none'
  return host.os === 'mac' ? 'mac' : 'bar'
}

/** The drag region's props for a part that moves the window (the top bar), in the desktop app. */
export function useDragRegion(): object | null {
  return useWindowChrome() === 'none' ? null : DRAG
}

/**
 * The top bar's start inset on a Mac: its gutter, or as much as reaches 84 from the window's edge
 * for a bar centred at `maxWidth`, whichever is more (the prototype's trafficLightInset). A wide
 * window's margin already clears the buttons, so the content stays in line with the page's.
 */
export const trafficLightInset = (gutter: number, windowWidth: number, maxWidth: number) =>
  Math.max(gutter, TRAFFIC_LIGHT_ROOM - Math.max(0, (windowWidth - maxWidth) / 2))

/** macOS's three buttons, over everything in the page, as the system draws them. */
function TrafficLights() {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...MAC_BUTTONS}
      style={{
        position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
        start: space['5'],
        top: space['6'] + space['0.5'],
        zIndex: 1000,
        flexDirection: 'row',
        gap: space['2'],
      }}
    >
      {TRAFFIC_LIGHTS.map((fill) => (
        <View
          key={fill}
          style={{
            width: space['3'],
            height: space['3'],
            borderRadius: tokens.radius.pill,
            backgroundColor: fill,
          }}
        />
      ))}
    </View>
  )
}

type Caption = 'minimise' | 'maximise' | 'close'
const CAPTIONS: Caption[] = ['minimise', 'maximise', 'close']

/** A caption button's glyph, the prototype's 10 × 10 drawn in lines. */
function Glyph({ kind, color }: { kind: Caption; color: string }) {
  const line = StyleSheet.hairlineWidth > 0.5 ? 1 : StyleSheet.hairlineWidth * 2
  const box: ViewStyle = { width: 10, height: 10 }
  if (kind === 'minimise')
    return (
      <View style={box}>
        <View style={{ marginTop: 5, height: line, backgroundColor: color }} />
      </View>
    )
  if (kind === 'maximise') return <View style={[box, { borderWidth: line, borderColor: color }]} />
  // the close's two strokes, corner to corner
  const stroke: ViewStyle = {
    position: 'absolute',
    top: 5 - line / 2,
    start: -2,
    width: 14,
    height: line,
    backgroundColor: color,
  }
  return (
    <View style={box}>
      <View style={[stroke, { transform: [{ rotate: '45deg' }] }]} />
      <View style={[stroke, { transform: [{ rotate: '-45deg' }] }]} />
    </View>
  )
}

/** The window's buttons on Windows (wide caption buttons) and Linux (round, as GNOME's and KDE's). */
function CaptionButton({ kind, os }: { kind: Caption; os: DesktopOs }) {
  const t = useT(desktopWindowMessages)
  const theme = useTheme()
  const host = useDesktopHost()
  const run = () => {
    if (!host) return
    if (kind === 'minimise') host.window.minimize()
    else if (kind === 'maximise') host.window.toggleMaximize()
    else host.window.close()
  }
  const windows = os === 'windows'
  return (
    <Press
      accessibilityLabel={t(kind)}
      // not in the tab order, as the system's aren't
      focusable={false}
      ring={false}
      onPress={run}
      style={({ hovered }) => ({
        alignItems: 'center',
        justifyContent: 'center',
        ...(windows
          ? {
              height: '100%',
              width: CAPTION_WIDTH,
              backgroundColor: hovered
                ? kind === 'close'
                  ? WINDOWS_CLOSE.fill
                  : `${theme.colors.text}14`
                : 'transparent',
            }
          : {
              width: space['6'],
              height: space['6'],
              borderRadius: tokens.radius.pill,
              backgroundColor: `${theme.colors.text}${hovered ? '24' : '14'}`,
            }),
      })}
    >
      {({ hovered }) => (
        <Glyph
          kind={kind}
          color={
            hovered && windows && kind === 'close'
              ? WINDOWS_CLOSE.glyph
              : hovered
                ? theme.colors.text
                : theme.colors['text-2']
          }
        />
      )}
    </Press>
  )
}

/** The title bar on Windows and Linux: it stands in for the system's frame, so it's above dialogs. */
function TitleBar({ os, overlay }: { os: DesktopOs; overlay: boolean }) {
  const theme = useTheme()
  return (
    <View
      {...DRAG}
      accessibilityRole="toolbar"
      style={{
        height: TITLE_BAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: overlay ? 'transparent' : theme.colors.bg,
        zIndex: 1000,
        ...(overlay
          ? {
              position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
              top: 0,
              start: 0,
              end: 0,
            }
          : null),
      }}
    >
      <View
        {...DRAG}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space['2'],
          paddingStart: space['3'],
          flexShrink: 1,
        }}
      >
        <Mark size={14} />
        <Text variant="caption" color="text-2" numberOfLines={1}>
          highsea
        </Text>
      </View>
      <View
        style={{
          marginStart: 'auto',
          flexDirection: 'row',
          height: '100%',
          ...(os === 'linux'
            ? { alignItems: 'center', gap: space['2'], paddingEnd: space['2'] }
            : null),
        }}
      >
        {CAPTIONS.map((kind) => (
          <CaptionButton key={kind} kind={kind} os={os} />
        ))}
      </View>
    </View>
  )
}

/**
 * The window's own chrome, for the page under it. `drag` adds macOS's 32 strip that moves the
 * window where there's no top bar (the gate's screens); `overlay` is the player's, over the film.
 * Nothing outside the desktop app.
 */
export function WindowChrome({
  overlay = false,
  drag = false,
}: {
  overlay?: boolean
  drag?: boolean
}) {
  const host = useDesktopHost()
  if (!host) return null
  if (host.os !== 'mac') return <TitleBar os={host.os} overlay={overlay} />
  return (
    <>
      {host.drawsSystemButtons ? <TrafficLights /> : null}
      {drag && !overlay ? (
        <View
          {...DRAG}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: Platform.OS === 'web' ? ('fixed' as 'absolute') : 'absolute',
            top: 0,
            start: 0,
            end: 0,
            height: TITLE_BAR_HEIGHT,
            zIndex: 20,
          }}
        />
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------- Back and Forward

/** The app's own trail of where it's been, so each of Back and Forward knows when it's off. */
const trail = { entries: [] as string[], at: -1 }
const listeners = new Set<() => void>()
let version = 0

/** A step to `location`: Back and Forward land on a neighbour; anything else drops what was ahead. */
export function visit(location: string) {
  const { entries, at } = trail
  if (entries[at] === location) return
  if (entries[at - 1] === location) trail.at--
  else if (entries[at + 1] === location) trail.at++
  else {
    trail.entries = [...entries.slice(0, at + 1), location]
    trail.at = trail.entries.length - 1
  }
  version++
  for (const l of [...listeners]) l()
}

/** For the tests: an empty trail. */
export function resetTrail() {
  trail.entries = []
  trail.at = -1
  version++
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** The webview's history, which Expo Router's web navigation keeps (it's the browser's). */
const history = () => (globalThis as { history?: { back(): void; forward(): void } }).history
const back = () => (history() ? history()?.back() : router.back())
const forward = () => history()?.forward()

type KeyLike = { key: string; metaKey: boolean; altKey: boolean; preventDefault(): void }

/** Whether a key is Back or Forward: Cmd+[ and Cmd+] on a Mac, Alt with the arrows elsewhere. */
export function historyKey(e: Pick<KeyLike, 'key' | 'metaKey' | 'altKey'>, os: DesktopOs) {
  const mac = os === 'mac'
  if (mac ? e.metaKey && e.key === '[' : e.altKey && e.key === 'ArrowLeft') return 'back'
  if (mac ? e.metaKey && e.key === ']' : e.altKey && e.key === 'ArrowRight') return 'forward'
  return null
}

/**
 * Back and Forward, after macOS's buttons and before the server, in the desktop app only: two
 * ghost chevrons, each off when there's nowhere to go. The top bar leaves them out below 768,
 * where the keys and the mouse's buttons still work.
 */
export function HistoryButtons({ shown = true }: { shown?: boolean }) {
  const t = useT(desktopWindowMessages)
  const host = useDesktopHost()
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      (Array.isArray(v) ? v : [v]).filter((x) => x !== undefined).map((x) => [k, String(x)]),
    ),
  ).toString()
  const location = query ? `${pathname}?${query}` : pathname
  useEffect(() => {
    if (host) visit(location)
  }, [host, location])
  useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  )
  const os = host?.os
  useEffect(() => {
    if (!os || Platform.OS !== 'web' || typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      const which = historyKey(e, os)
      if (!which) return
      e.preventDefault()
      if (which === 'back') back()
      else forward()
    }
    // the mouse's side buttons: 3 is back and 4 is forward
    // (https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button)
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) back()
      else if (e.button === 4) forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [os])
  if (!host || !shown) return null
  const can = { back: trail.at > 0, forward: trail.at < trail.entries.length - 1 }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'], flexShrink: 0 }}>
      <Button
        variant="ghost"
        iconOnly
        icon="chevron-left"
        accessibilityLabel={t('back')}
        disabled={!can.back}
        onPress={back}
      />
      <Button
        variant="ghost"
        iconOnly
        icon="chevron-right"
        accessibilityLabel={t('forward')}
        disabled={!can.forward}
        onPress={forward}
      />
    </View>
  )
}

/**
 * What the top bar takes in the desktop app: the drag region on its fill, and on a Mac the start
 * inset that leaves macOS's buttons their room (`paddingStart`, after the gutter's padding). Both
 * null outside the desktop app.
 */
export function useDesktopTopBar(gutter: number): {
  drag: object | null
  start: { paddingStart: number } | null
} {
  const chrome = useWindowChrome()
  const { width } = useWindowDimensions()
  if (chrome === 'none') return { drag: null, start: null }
  return {
    drag: DRAG,
    start:
      chrome === 'mac' ? { paddingStart: trafficLightInset(gutter, width, web.maxWidth) } : null,
  }
}
