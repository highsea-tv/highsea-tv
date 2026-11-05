// SPDX-License-Identifier: AGPL-3.0-only
// The server this build belongs to, if it belongs to one (one-client-platform.md › A), and the kind
// of device it is. An app on the phone or the TV belongs to none: it starts at Choose a server and
// keeps a list of servers. The web's side (./host.web.ts) is served by its server, which is the
// one it uses.
import type { DeviceInput } from '@highsea-tv/api-contract'
import { deviceClient, deviceInput } from '@highsea-tv/native/device'
import { Platform } from 'react-native'

/** The address of the server that serves this build, '' for the page's own; none in an app. */
export const HOME_SERVER: string | undefined = undefined

export type Device = 'phone' | 'tv' | 'web'

/**
 * The kind of device this is, as the words and the server's sound defaults name it. It's the
 * device's, not how a screen is drawn: screens ask the form factor (controls.md).
 */
export const useDevice = (): Device => (Platform.isTV ? 'tv' : 'phone')

/** The kind of app as announcements and Settings › Devices name it. */
export const useDeviceClient = (): DeviceInput['client'] => deviceClient

/** What signing in names this device as: the phone and the TV always sign in as a device. */
export const useDeviceInput = (): (() => DeviceInput | undefined) => deviceInput

/**
 * Whether this app keeps a list of servers, so it can forget one and go back to them
 * (connectivity.md): the phone, the TV and the desktop app do; a plain browser has only its own.
 */
export const useKeepsServers = () => true

/** The desktop app's system, for About's "for Mac"; none outside the desktop app. */
export const useDesktopOs = (): string | undefined => undefined

/**
 * Whether the client runs inside the desktop app, so its host compositions draw (the window's
 * chrome, Kept in, an update waiting; desktop-app.md): never on the phone or the TV.
 */
export const useDesktopApp = (): boolean => false
