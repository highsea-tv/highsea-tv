// SPDX-License-Identifier: AGPL-3.0-only
// React Native's asset registry for a Next.js host: react-native-web's, which keeps one registry
// however it's imported (react-native.ts says why the shim exists).
export { getAssetByID, registerAsset } from 'react-native-web/dist/modules/AssetRegistry'
