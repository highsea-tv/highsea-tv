// SPDX-License-Identifier: AGPL-3.0-only
// React Native's `codegenNativeComponent` for a Next.js host (react-native.ts says why): a native
// view's name, which the web never draws.
export default function codegenNativeComponent(name: string): never {
  throw new Error(`${name} is a native view, which the web doesn't have`)
}
