// SPDX-License-Identifier: AGPL-3.0-only
// Reanimated and its worklets need the native runtime, which Jest hasn't got. As their guides
// say: worklets' mock (https://docs.swmansion.com/react-native-worklets/docs/guides/testing/),
// then Reanimated's own set-up over its web build, which jest.config.js's resolver picks
// (https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/).
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
require('react-native-reanimated').setUpTests()
// react-native-webview's native view and module aren't in Jest: a host element named WebView
// stands in, with the props the app gives it, which the trailer's tests read
// (a module factory, https://jestjs.io/docs/jest-object#jestmockmodulename-factory-options), for
// the copy @highsea-tv/ui's StillFrame resolves (Bun's isolated store gives it its own path) and the app's.
jest.mock(
  require.resolve('react-native-webview', {
    paths: [require('node:path').resolve(__dirname, '../../packages/ui')],
  }),
  () => ({ WebView: (props) => require('react').createElement('WebView', props) }),
)
jest.mock('react-native-webview', () => ({
  WebView: (props) => require('react').createElement('WebView', props),
}))
