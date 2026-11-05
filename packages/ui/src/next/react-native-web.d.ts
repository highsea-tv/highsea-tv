// SPDX-License-Identifier: AGPL-3.0-only
// react-native-web ships no types (https://necolas.github.io/react-native-web/docs/setup/#types):
// its exports are React Native's, which the shim re-exports, and its asset registry's two functions.
declare module 'react-native-web' {
  export * from 'react-native'
}
declare module 'react-native-web/dist/modules/AssetRegistry' {
  export function registerAsset(asset: unknown): number
  export function getAssetByID(id: number): unknown
}
