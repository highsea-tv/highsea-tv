// SPDX-License-Identifier: AGPL-3.0-only
// The web's side of ./camera.tsx: a browser has no camera to point at a TV, so Connect a device
// asks for the code (the prototype's web/link.tsx), and expo-camera never joins the web's bundle.
import type { useCameraPermission as nativePermission } from './camera.tsx'

export type { CameraPermission } from './camera.tsx'

export const useCameraPermission: typeof nativePermission = () => null
