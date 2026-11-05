// SPDX-License-Identifier: AGPL-3.0-only
// The one seam between the client and the desktop app around it (ADR 0058, desktop-app.md):
// the window's buttons, the app's own updates and the folder Kept in names. apps/web puts Tauri
// behind the same kind of interface (apps/web/src/host.ts's `desktop`, desktop/updates.ts,
// desktop/window.tsx); here nothing imports @tauri-apps, so the client builds without it and the
// mock answers in the prototypes' frames. Part C wraps the client's export in Tauri and provides
// the real host with DesktopHostProvider at the root:
// - `window`: getCurrentWindow()'s minimize, toggleMaximize and close
//   (https://v2.tauri.app/reference/javascript/api/namespacewindow/);
// - `updates`: the updater plugin's check and download at start and every 6 hours, install and
//   the process plugin's relaunch (https://v2.tauri.app/plugin/updater/), as apps/web's updates.ts;
// - `keptIn`: the dialog plugin's folder picker (https://v2.tauri.app/plugin/dialog/) and a Rust
//   command that moves the downloads (4.6).
// The client asks useDesktopHost(): the provided host, or in mock mode the toolbar's (`?app=desktop`,
// with `os` and `update`), or null outside the desktop app.
import { appVersion } from '@highsea-tv/native/device'
import { createContext, createElement, type ReactNode, useContext, useMemo } from 'react'
import { useFrameState } from '../frame-channel.ts'
import { mock } from '../transport.ts'

export type DesktopOs = 'mac' | 'windows' | 'linux'

/** The app's own update (desktop-app.md › Updates). */
export type AppUpdate = {
  /** This app's version. */
  current: string
  /** A newer version, downloaded and waiting for a restart; null when up to date. */
  ready: string | null
  /** When the app last asked, in ms since 1970; null before it has. */
  checkedAt: number | null
}

export type DesktopHost = {
  os: DesktopOs
  /**
   * The page draws macOS's three window buttons itself: only in the prototypes' frames, where no
   * system draws them. In the app, macOS draws its own over the top bar (`titleBarStyle: "Overlay"`).
   */
  drawsSystemButtons: boolean
  /** The window's own buttons, which Windows' and Linux's title bar draws (`decorations: false`). */
  window: { minimize(): void; toggleMaximize(): void; close(): void }
  updates: {
    get(): AppUpdate
    subscribe(listener: () => void): () => void
    /** Installs the waiting update and opens the app again where it was. */
    restart(): Promise<void>
  }
  keptIn: {
    /** The folder downloads are kept in now. */
    folder(): Promise<string>
    /** The system's folder picker: the folder chosen, or null if the person cancelled. */
    choose(): Promise<string | null>
    /** Moves what's downloaded to `to`, telling how far it's got (0 to 1); `to` is then the folder. */
    move(to: string, progress: (done: number) => void): Promise<void>
  }
}

const Host = createContext<DesktopHost | null>(null)

/** Part C's: the desktop app's page holds the client inside it, with Tauri's host. */
export function DesktopHostProvider({
  value,
  children,
}: {
  value: DesktopHost
  children: ReactNode
}) {
  return createElement(Host.Provider, { value }, children)
}

// ---------------------------------------------------------------- the mock's

/** Each OS's videos folder, where downloads go until the person chooses another (the prototype's). */
export const MOCK_FOLDERS: Record<DesktopOs, { first: string; picked: string }> = {
  mac: { first: '~/Movies/highsea', picked: '/Volumes/Films/highsea' },
  windows: { first: 'C:\\Users\\Ines\\Videos\\highsea', picked: 'D:\\Films\\highsea' },
  linux: { first: '~/Videos/highsea', picked: '/media/ines/Films/highsea' },
}

/** How long the mock takes to move everything, as the prototype's. */
export const MOCK_MOVE_MS = 6000

// the folder outlives the page, as the app's setting would
const chosen: Partial<Record<DesktopOs, string>> = {}

/** The next version, as the prototype's app-version.ts has one: the patch after this one. */
export const nextVersion = (v: string) => {
  const parts = v.split('.')
  const last = Number(parts[parts.length - 1])
  return Number.isFinite(last) ? [...parts.slice(0, -1), String(last + 1)].join('.') : `${v}.1`
}

const never = () => () => {}

/** What the prototypes' toolbar stands in for: its OS, and its update waiting or not. */
export function mockDesktopHost(
  os: DesktopOs,
  ready: boolean,
  checkedAt = Date.now(),
): DesktopHost {
  const update: AppUpdate = {
    current: appVersion,
    ready: ready ? nextVersion(appVersion) : null,
    checkedAt,
  }
  const folder = () => chosen[os] ?? MOCK_FOLDERS[os].first
  return {
    os,
    drawsSystemButtons: os === 'mac',
    // the frame has no window to move or close
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    updates: { get: () => update, subscribe: never, restart: async () => {} },
    keptIn: {
      folder: async () => folder(),
      // the prototype can't open a system dialog, so Change picks the folder on another drive
      choose: async () =>
        folder() === MOCK_FOLDERS[os].picked ? MOCK_FOLDERS[os].first : MOCK_FOLDERS[os].picked,
      move: (to, progress) =>
        new Promise((done) => {
          const started = Date.now()
          const timer = setInterval(() => {
            const part = Math.min(1, (Date.now() - started) / MOCK_MOVE_MS)
            progress(part)
            if (part < 1) return
            clearInterval(timer)
            chosen[os] = to
            done()
          }, 250)
        }),
    },
  }
}

/** For the tests: the mock's folders back to each OS's first. */
export function resetMockFolders() {
  for (const k of Object.keys(chosen) as DesktopOs[]) delete chosen[k]
}

/**
 * The desktop app's host, or null outside it. In a real build, the one part C provides; in mock
 * mode, the toolbar's Desktop app, OS and Update.
 */
export function useDesktopHost(): DesktopHost | null {
  const provided = useContext(Host)
  const toolbar = useFrameState()
  const os = toolbar.os ?? 'mac'
  const ready = toolbar.update === 'ready'
  const inMock = !!mock && toolbar.app === 'desktop'
  // made once per OS and update, so what reads it (the update's store) keeps its answer
  const fake = useMemo(() => (inMock ? mockDesktopHost(os, ready) : null), [inMock, os, ready])
  return provided ?? fake
}
