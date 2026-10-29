// SPDX-License-Identifier: AGPL-3.0-only
// The desktop app's window chrome (desktop-web.md › Desktop app specifics; docs/product/desktop-app.md,
// checkpoint 4.4a). On macOS the window's own buttons sit over the top bar, which leaves room for
// them and is the window's drag region (Tauri's `titleBarStyle: "Overlay"`). On Windows and Linux
// the window has no system frame (`decorations: false`) and highsea draws a title bar in `bg`, with
// the platform's own minimise, maximise and close. In a browser there's none of it.
import { cn, Mark } from '@highsea-tv/ui-web'
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
