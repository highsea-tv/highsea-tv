// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./host.ts: the page is served by its server at /web, so it uses that server,
// at the page's own address (''), and signs in with the browser's session cookie. In mock mode the
// page stands for each device the prototypes' frame draws, so the device follows the frame's form
// factor: the TV and the phone frames name a device as they sign in, and keep a list of servers,
// as those apps do (connectivity.md).
import type { DeviceInput } from '@highsea-tv/api-contract'
import { appVersion } from '@highsea-tv/native/device'
import { useFormFactor } from '@highsea-tv/ui'
import { useFrameState } from './frame-channel.ts'
import type {
  Device,
  useDeviceClient as nativeClient,
  useDesktopApp as nativeDesktop,
  HOME_SERVER as nativeHome,
  useDeviceInput as nativeInput,
  useKeepsServers as nativeKeeps,
  useDesktopOs as nativeOs,
  useDevice as nativeUse,
} from './host.ts'
import { mock } from './transport.ts'

export type { Device }

export const HOME_SERVER: typeof nativeHome = ''

/**
 * The desktop app's webview: Tauri 2 puts `__TAURI_INTERNALS__` on every window it opens before
 * the page's scripts run (https://v2.tauri.app/develop/calling-rust/; ADR 0058). It keeps its
 * servers as the phone does.
 */
const desktopApp = () => '__TAURI_INTERNALS__' in globalThis

/**
 * Whether the client runs inside the desktop app, so its host compositions draw (desktop-app.md):
 * Tauri's webview in a real build, and the toolbar's Desktop app in mock mode (`?app=desktop`, or
 * the frame's state). The one answer for everything that differs in the app.
 */
export const useDesktopApp: typeof nativeDesktop = () => {
  const toolbar = useFrameState()
  return mock ? toolbar.app === 'desktop' : desktopApp()
}

export const useDevice: typeof nativeUse = () => {
  const input = useFormFactor().input
  if (!mock) return 'web'
  return input === 'tv' ? 'tv' : input === 'touch' ? 'phone' : 'web'
}

export const useDeviceClient: typeof nativeClient = () => {
  const device = useDevice()
  return device === 'tv' ? 'tvos' : device === 'phone' ? 'ios' : 'web'
}

/** A browser signs in by the cookie and names no device; a mock frame names the one it draws. */
export const useDeviceInput: typeof nativeInput = () => {
  const device = useDevice()
  return (): DeviceInput | undefined =>
    device === 'web'
      ? undefined
      : {
          name: device === 'tv' ? 'Apple TV' : 'iPhone',
          client: device === 'tv' ? 'tvos' : 'ios',
          appVersion,
        }
}

export const useKeepsServers: typeof nativeKeeps = () => {
  const device = useDevice()
  const desktop = useDesktopApp()
  return mock ? device !== 'web' || desktop : desktop
}

// About's line names them as desktop-app.md does: "highsea {version} for Mac" (or Windows, or Linux)
const OS_NAMES = { mac: 'Mac', windows: 'Windows', linux: 'Linux' } as const

/** The desktop app's system, as its webview's user agent names it (Tauri's webviews keep theirs). */
export const useDesktopOs: typeof nativeOs = () => {
  const toolbar = useFrameState()
  if (mock) return toolbar.app === 'desktop' ? OS_NAMES[toolbar.os ?? 'mac'] : undefined
  if (!desktopApp()) return undefined
  const agent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? ''
  return /Mac/.test(agent)
    ? OS_NAMES.mac
    : /Windows/.test(agent)
      ? OS_NAMES.windows
      : OS_NAMES.linux
}
