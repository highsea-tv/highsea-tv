// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./host.ts: the page is served by its server at /web, so it uses that server,
// at the page's own address (''), and signs in with the browser's session cookie. In mock mode the
// page stands for each device the prototypes' frame draws, so the device follows the frame's form
// factor: the TV and the phone frames name a device as they sign in, and keep a list of servers,
// as those apps do (connectivity.md).
import type { DeviceInput } from '@highsea-tv/api-contract'
import { appVersion } from '@highsea-tv/native/device'
import { useFormFactor } from '@highsea-tv/ui'
import { desktop } from './desktop/app.ts'
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
 * The desktop app: its own export, bundled with its host (./desktop/app.ts), which Tauri 2 loads
 * in its webview (ADR 0058). It keeps its servers as the phone does.
 */
const desktopApp = () => desktop !== undefined

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
  if (desktop) return 'desktop'
  return device === 'tv' ? 'tvos' : device === 'phone' ? 'ios' : 'web'
}

/**
 * A browser signs in by the cookie and names no device; the desktop app names this computer, as
 * its Rust side tells it (`app_device`); a mock frame names the one it draws.
 */
export const useDeviceInput: typeof nativeInput = () => {
  const device = useDevice()
  if (desktop) return desktop.deviceInput
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
  const inApp = useDesktopApp()
  return mock ? device !== 'web' || inApp : inApp
}

// About's line names them as desktop-app.md does: "highsea {version} for Mac" (or Windows, or Linux)
const OS_NAMES = { mac: 'Mac', windows: 'Windows', linux: 'Linux' } as const

/** The desktop app's system, as its webview's user agent names it (../desktop/tauri.tsx's `os`). */
export const useDesktopOs: typeof nativeOs = () => {
  const toolbar = useFrameState()
  if (mock) return toolbar.app === 'desktop' ? OS_NAMES[toolbar.os ?? 'mac'] : undefined
  return desktop ? OS_NAMES[desktop.os] : undefined
}
