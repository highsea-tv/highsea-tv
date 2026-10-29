// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's window chrome (docs/product/desktop-app.md › The window), from the prototype's
// design/prototypes/src/web/window.tsx. On macOS the window's own buttons sit over the top bar
// (tauri.conf.json's `titleBarStyle: "Overlay"`), which leaves room for them and moves the window.
// On Windows and Linux the window has no system frame (`decorations: false`) and this draws a title
// bar with the platform's minimise, maximise and close, through Tauri's window API
// (https://v2.tauri.app/reference/javascript/api/namespacewindow/). In a browser there's none of it.
import { useT } from '@highsea-tv/i18n/react'
import { cn, Mark } from '@highsea-tv/ui-web'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { inApp } from '../host.ts'
import { desktopWindow as messages } from '../messages.ts'

export type WindowChrome = 'none' | 'mac' | 'bar'
export type DesktopOs = 'mac' | 'windows' | 'linux'

/** The computer the app runs on, from its webview's user agent. */
export const desktopOs: DesktopOs =
  typeof navigator === 'undefined' || /Mac/.test(navigator.userAgent)
    ? 'mac'
    : /Windows/.test(navigator.userAgent)
      ? 'windows'
      : 'linux'

export const windowChrome: WindowChrome = !inApp ? 'none' : desktopOs === 'mac' ? 'mac' : 'bar'

export function useWindowChrome(): WindowChrome {
  return windowChrome
}

/**
 * Room for macOS's three buttons at the start of the top bar: they sit 20px from the window's edge
 * and take 52px, so the bar's content starts at 84px whatever its gutter.
 */
export const trafficLightRoom = 'w-[68px] shrink-0 medium:w-[52px] wide:w-[20px]'

/** The title bar's height, which pushes the sticky top bar and the player's controls down. */
export const titleBarHeight = 'h-8'

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
  { kind: 'minimise', run: () => getCurrentWindow().minimize() },
  { kind: 'maximise', run: () => getCurrentWindow().toggleMaximize() },
  { kind: 'close', run: () => getCurrentWindow().close() },
] as const

/**
 * The title bar on Windows and Linux: the app's name, and the window's buttons in the platform's
 * shape (Windows' wide caption buttons, with close turning red; round buttons on Linux, as GNOME
 * and KDE draw them). Like the system's, the buttons aren't in the tab order: the keyboard has the
 * system's shortcuts for them. It stands in for the system's frame, so it stays above dialogs and
 * their scrim: the window moves and closes whatever is open.
 */
function TitleBar({ overlay }: { overlay: boolean }) {
  const t = useT(messages)
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
      <span
        data-tauri-drag-region
        className="flex min-w-0 items-center gap-2 ps-3 text-caption text-text-2"
      >
        <Mark size={14} />
        <span className="truncate">highsea</span>
      </span>
      <span
        className={cn('ms-auto flex h-full', desktopOs === 'linux' && 'items-center gap-2 pe-2')}
      >
        {captions.map((c) => (
          <button
            key={c.kind}
            type="button"
            tabIndex={-1}
            aria-label={t(c.kind)}
            onClick={() => void c.run()}
            className={cn(
              'grid cursor-default place-items-center text-text-2 outline-none',
              desktopOs === 'windows'
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

/**
 * The window's own chrome for the page under it; `overlay` on the player, over the film. macOS
 * draws its own buttons, so there it's only the room the top bar leaves for them.
 */
export function WindowFrame({ overlay = false }: { overlay?: boolean }) {
  if (windowChrome === 'bar') return <TitleBar overlay={overlay} />
  // on a Mac, the top of a page without the top bar (C1, sign-in) still moves the window; the
  // top bar, above it, moves it too
  if (windowChrome === 'mac' && !overlay)
    return <div data-tauri-drag-region aria-hidden className="fixed inset-x-0 top-0 z-20 h-8" />
  return null
}
