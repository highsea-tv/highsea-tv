// SPDX-License-Identifier: AGPL-3.0-only
// Reanimated and its worklets need the native runtime, which Jest hasn't got. As their guides
// say: worklets' mock (https://docs.swmansion.com/react-native-worklets/docs/guides/testing/),
// then Reanimated's own set-up over its web build, which jest.config.js's resolver picks
// (https://docs.swmansion.com/react-native-reanimated/docs/guides/testing/).
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))
require('react-native-reanimated').setUpTests()
