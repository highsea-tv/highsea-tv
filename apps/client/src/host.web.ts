// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./host.ts: the page is served by its server at /web, so it uses that server,
// at the page's own address (''), and signs in with the browser's session cookie. In mock mode the
// page stands for each device the prototypes' frame draws, so the device follows the frame's form
// factor: the TV and the phone frames name a device as they sign in, and keep a list of servers,
// as those apps do (connectivity.md).
import type { DeviceInput } from '@highsea-tv/api-contract'
import { appVersion } from '@highsea-tv/native/device'
import { useFormFactor } from '@highsea-tv/ui'
import type {
  Device,
  useDeviceClient as nativeClient,
  HOME_SERVER as nativeHome,
  useDeviceInput as nativeInput,
  useKeepsServers as nativeKeeps,
  useDesktopOs as nativeOs,
  useDevice as nativeUse,
} from './host.ts'
import { mock } from './transport.ts'

export type { Device }

export const HOME_SERVER: typeof nativeHome = ''

/** The desktop app's webview (Tauri's global), which keeps its servers as the phone does. */
const desktopApp = () => '__TAURI_INTERNALS__' in globalThis

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
  return mock ? device !== 'web' : desktopApp()
}

/** The desktop app's system, as its webview's user agent names it (Tauri's webviews keep theirs). */
export const useDesktopOs: typeof nativeOs = () => {
  if (!desktopApp()) return undefined
  const agent = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? ''
  return /Mac/.test(agent) ? 'macOS' : /Windows/.test(agent) ? 'Windows' : 'Linux'
}
