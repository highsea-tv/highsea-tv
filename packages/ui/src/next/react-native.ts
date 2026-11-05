// SPDX-License-Identifier: AGPL-3.0-only
// `react-native` for a Next.js host (one-client-platform-d.md › D1): react-native-web, as its setup
// asks a bundler to alias (https://necolas.github.io/react-native-web/docs/setup/), with the two
// native-only names the library's native dependencies import beside their `.web` files. Metro
// lets a missing export through as `undefined`; Turbopack checks ESM exports when it builds, so a
// missing one fails the build. Neither is called on the web: react-native-svg, safe-area-context
// and expo-modules-core take their `.web` paths there, and these only keep the build honest.
export * from 'react-native-web'
export { default as codegenNativeComponent } from './codegen-native-component.ts'

/** Native modules don't exist on the web: `get` finds none, `getEnforcing` says which was asked for. */
export const TurboModuleRegistry = {
  get: (_name: string) => null,
  getEnforcing: (name: string): never => {
    throw new Error(`${name} is a native module, which the web doesn't have`)
  },
}
