// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's window chrome (desktop-web.md › Desktop app specifics; docs/product/desktop-app.md,
// checkpoint 4.4a). On macOS the window's own buttons sit over the top bar, which leaves room for
// them and is the window's drag region (Tauri's `titleBarStyle: "Overlay"`). On Windows and Linux
// the window has no system frame (`decorations: false`) and highsea draws a title bar in `bg`, with
// the platform's own minimise, maximise and close. In a browser there's none of it.
import { Button, cn, Mark } from '@highsea-tv/ui'
import { useEffect, useSyncExternalStore } from 'react'
import { useLocation } from 'wouter'
import { useDesktopApp, useDesktopOs } from '../client/data.ts'

export type WindowChrome = 'none' | 'mac' | 'bar'

export function useWindowChrome(): WindowChrome {
  const desktop = useDesktopApp()
  const os = useDesktopOs()
  if (!desktop) return 'none'
  return os === 'mac' ? 'mac' : 'bar'
}

/**
 * Room for macOS's three buttons at the start of the top bar: they sit 20px from the window's edge
 * and take 52px, so the bar's content starts at 84px whatever its gutter.
 */
export const trafficLightRoom = 'w-[68px] shrink-0 medium:w-[52px] wide:w-[20px]'

/**
 * The same room for a bar centred at 1680px (the top bar), as its start padding in
 * place of the gutter's: the gutter, or as much as reaches 84px from the window's edge, whichever
 * is more. A wide window's margin already clears the buttons, so the content stays in line with
 * the page's.
 */
export const trafficLightInset =
  'ps-[max(1rem,calc(84px-max(0px,(100vw-1680px)/2)))] medium:ps-[max(2rem,calc(84px-max(0px,(100vw-1680px)/2)))] wide:ps-[max(4rem,calc(84px-max(0px,(100vw-1680px)/2)))]'

/** The title bar's height, which pushes the sticky top bar and the player's controls down. */
export const titleBarHeight = 'h-8'

/**
 * macOS's close, minimise and zoom, as the system draws them over the top bar: above everything
 * in the page, dialogs and their scrim included.
 */
function TrafficLights() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed start-5 top-[26px] z-[1000] flex gap-2"
      data-window-buttons="mac"
    >
      <span className="size-3 rounded-full bg-[#ff5f57]" />
      <span className="size-3 rounded-full bg-[#febc2e]" />
      <span className="size-3 rounded-full bg-[#28c840]" />
    </div>
  )
}

function Glyph({ kind }: { kind: 'minimise' | 'maximise' | 'close' }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className="size-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      {kind === 'minimise' && <path d="M0 5.5h10" />}
      {kind === 'maximise' && <rect x="0.5" y="0.5" width="9" height="9" />}
      {kind === 'close' && <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />}
    </svg>
  )
}

const captions = [
  { kind: 'minimise', label: 'Minimise' },
  { kind: 'maximise', label: 'Maximise' },
  { kind: 'close', label: 'Close' },
] as const

/**
 * The title bar on Windows and Linux: the app's name, and the window's buttons in the platform's
 * shape (Windows' wide caption buttons, with close turning red; round buttons on Linux, as GNOME
 * and KDE draw them). Like the system's, the buttons aren't in the tab order: the keyboard has the
 * system's shortcuts for them. It stands in for the system's frame, so it stays above dialogs and
 * their scrim: the window moves and closes whatever is open.
 */
function TitleBar({ overlay }: { overlay: boolean }) {
  const os = useDesktopOs()
  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex items-center select-none',
        titleBarHeight,
        overlay
          ? 'fixed inset-x-0 top-0 z-40 bg-transparent text-text'
          : 'sticky top-0 z-[1000] bg-bg',
      )}
    >
      <span className="flex min-w-0 items-center gap-2 ps-3 text-caption text-text-2">
        <Mark size={14} />
        <span className="truncate">highsea</span>
      </span>
      <span className={cn('ms-auto flex h-full', os === 'linux' && 'items-center gap-2 pe-2')}>
        {captions.map((c) => (
          <button
            key={c.kind}
            type="button"
            tabIndex={-1}
            aria-label={c.label}
            className={cn(
              'grid cursor-default place-items-center text-text-2 outline-none',
              os === 'windows'
                ? cn(
                    'h-full w-[46px] hover:bg-text/8 hover:text-text',
                    // Windows' own close colour on hover
                    c.kind === 'close' && 'hover:bg-[#c42b1c] hover:text-[#fff]',
                  )
                : 'size-6 rounded-full bg-text/8 hover:bg-text/14 hover:text-text',
            )}
          >
            <Glyph kind={c.kind} />
          </button>
        ))}
      </span>
    </div>
  )
}

/** The window's own chrome for the page under it; `overlay` on the player, over the film. */
export function WindowFrame({ overlay = false }: { overlay?: boolean }) {
  const chrome = useWindowChrome()
  if (chrome === 'mac') return <TrafficLights />
  if (chrome === 'bar') return <TitleBar overlay={overlay} />
  return null
}

// Back and Forward (prototype-gaps.md › 4.1). A browser has its own; the desktop app's webview has
// none, so highsea draws them, as Spotify's, Slack's and Music's windows do: two chevrons at the
// start of the top bar, after macOS's buttons, with the platform's keys (Cmd+[ and Cmd+] on a Mac,
// Alt with the arrows on Windows and Linux, as their browsers have it) and the mouse's back and
// forward buttons. The app keeps where it is in its own history, so each is off when there's
// nowhere to go.
const trail = { entries: [] as string[], at: -1 }
const listeners = new Set<() => void>()
let version = 0

function visit(location: string) {
  const { entries, at } = trail
  if (entries[at] === location) return
  // Back and Forward land on a neighbour; anything else is a new step, dropping what was ahead
  if (entries[at - 1] === location) trail.at--
  else if (entries[at + 1] === location) trail.at++
  else {
    trail.entries = [...entries.slice(0, at + 1), location]
    trail.at = trail.entries.length - 1
  }
  version++
  for (const l of listeners) l()
}

function useTrail(location: string) {
  useEffect(() => visit(location), [location])
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
  return { back: trail.at > 0, forward: trail.at < trail.entries.length - 1 }
}

export function HistoryButtons() {
  const [location] = useLocation()
  const os = useDesktopOs()
  const can = useTrail(location)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mac = os === 'mac'
      const back = mac ? e.metaKey && e.key === '[' : e.altKey && e.key === 'ArrowLeft'
      const forward = mac ? e.metaKey && e.key === ']' : e.altKey && e.key === 'ArrowRight'
      if (!back && !forward) return
      e.preventDefault()
      if (back) history.back()
      else history.forward()
    }
    // the mouse's side buttons: 3 is back and 4 is forward (https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button)
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) history.back()
      else if (e.button === 4) history.forward()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [os])
  const keys = os === 'mac' ? ['⌘[', '⌘]'] : ['Alt+Left', 'Alt+Right']
  return (
    // a window narrower than medium has no room for them beside the server's name; the keys and
    // the mouse's buttons still work there
    <div className="hidden shrink-0 items-center gap-2 medium:flex">
      <Button
        variant="ghost"
        iconOnly
        icon="chevron-left"
        aria-label="Back"
        title={`Back (${keys[0]})`}
        disabled={!can.back}
        onClick={() => history.back()}
      />
      <Button
        variant="ghost"
        iconOnly
        icon="chevron-right"
        aria-label="Forward"
        title={`Forward (${keys[1]})`}
        disabled={!can.forward}
        onClick={() => history.forward()}
      />
    </div>
  )
}
