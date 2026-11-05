// SPDX-License-Identifier: AGPL-3.0-only
// The phone's camera for Connect a device (connectivity.md#pairing-a-tv-from-the-phone): expo-
// camera's CameraView looking for QR codes only, and its permission, asked for the first time on
// the screen (https://docs.expo.dev/versions/latest/sdk/camera/). tvOS has no camera, and expo-
// camera no tvOS module, so the TV never loads it (as ../browser.ts does expo-web-browser): it's
// required only off the TV, when first used. A browser has no camera to point at a TV
// (the prototype's web/link.tsx), so the web's side is ./camera.web.tsx, which has none. The
// picture comes with the permission, so only a device with a camera has one to draw.
import type * as CameraModule from 'expo-camera'
import { Platform, type StyleProp, type ViewStyle } from 'react-native'

let loaded: typeof CameraModule | null | undefined

function camera(): typeof CameraModule | null {
  if (loaded === undefined)
    loaded = Platform.isTV ? null : (require('expo-camera') as typeof CameraModule)
  return loaded
}

/** The camera's permission and its picture, or null where there's no camera to ask for. */
export type CameraPermission = {
  granted: boolean
  /** Refused, and iOS won't ask again: only the Settings app can change it. */
  refused: boolean
  ask: () => void
  /** The camera's picture, once granted. */
  Scanner: typeof Scanner
} | null

/** The TV's has no camera; the phone's asks expo-camera, which loads as it's first asked. */
export const useCameraPermission: () => CameraPermission = Platform.isTV
  ? () => null
  : function usePermission() {
      const [permission, ask] = (camera() as typeof CameraModule).useCameraPermissions()
      return {
        granted: permission?.granted === true,
        refused: permission?.granted === false && !permission.canAskAgain,
        ask: () => void ask(),
        Scanner,
      }
    }

/** The camera's picture, telling `onScanned` what each QR code it sees holds. */
function Scanner({
  onScanned,
  style,
}: {
  onScanned: (data: string) => void
  style?: StyleProp<ViewStyle>
}) {
  const c = camera()
  if (!c) return null
  return (
    <c.CameraView
      style={style}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={({ data }) => onScanned(data)}
    />
  )
}
