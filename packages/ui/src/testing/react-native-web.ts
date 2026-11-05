// SPDX-License-Identifier: AGPL-3.0-only
// The library's native drawing in Bun's test runner, as Next draws it in the admin (apps/server's
// next.config.ts, one-client-platform-d.md › D1): react-native is react-native-web, and each
// `.web` platform file stands in for its pair, as a web bundler picks it by its suffix
// (https://necolas.github.io/react-native-web/docs/setup/). Bun has no such resolution, so the
// pairs are swapped with mock.module (https://bun.com/docs/test/mocks#module-mocks-with-mock-module),
// which must run before anything imports the library: a test file imports its DOM first, then
// awaits this, then imports what it tests. What the test runner can't run is stood in for, as the
// library's own tests do (test/native/parts.test.tsx): Reanimated's values are values (a spring's
// end is what's drawn), the icons and react-native-svg draw nothing, and haptics do nothing.
// Tests only: no bundle imports it (scripts/bundles.ts).
import { mock } from 'bun:test'
import { dirname, join } from 'node:path'

const native = join(import.meta.dir, '../native')

export async function drawWithReactNativeWeb(): Promise<void> {
  // react-native-web from the library's own dependencies, sharing the test's one React
  const rnw = Bun.resolveSync('react-native-web', join(import.meta.dir, '../../package.json'))
  for (const spec of ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client']) {
    const ours = await import(spec)
    mock.module(Bun.resolveSync(spec, dirname(rnw)), () => ours)
  }
  const React = await import('react')
  const web = await import(rnw)
  mock.module('react-native', () => web)

  const builder: Record<string, unknown> = {}
  for (const k of ['springify', 'stiffness', 'damping', 'mass', 'duration', 'delay'])
    builder[k] = () => builder
  mock.module('react-native-reanimated', () => ({
    default: { createAnimatedComponent: <T>(component: T) => component, View: web.View },
    FadeIn: builder,
    FadeOut: builder,
    useReducedMotion: () => true,
    useSharedValue: <T>(value: T) => React.useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: <T>(value: T) => value,
    withTiming: <T>(value: T) => value,
    withRepeat: <T>(value: T) => value,
    Easing: { linear: (t: number) => t },
  }))
  // an image as react-native-web draws one, which happy-dom needn't load
  mock.module('expo-image', () => ({
    Image: ({ source, accessibilityLabel, style }: Record<string, unknown>) =>
      React.createElement(web.Image, { source, accessibilityLabel, style }),
  }))
  mock.module('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
  }))
  const none = () => null
  mock.module('react-native-svg', () => ({
    default: none,
    Circle: none,
    Defs: none,
    LinearGradient: none,
    Mask: none,
    Path: none,
    Rect: none,
    Stop: none,
  }))
  mock.module(join(native, 'icons.ts'), () => ({ icons: new Proxy({}, { get: () => none }) }))
  mock.module('expo-haptics', () => ({
    impactAsync: async () => {},
    notificationAsync: async () => {},
    ImpactFeedbackStyle: {},
    NotificationFeedbackType: {},
  }))
  // the platform files' web halves
  for (const [file, webFile] of [
    ['tv/engine.tsx', 'tv/engine.web.tsx'],
    ['dom.ts', 'dom.web.ts'],
    ['announce.ts', 'announce.web.ts'],
    ['embed.tsx', 'embed.web.tsx'],
    ['scrollbar.tsx', 'scrollbar.web.tsx'],
  ] as const) {
    const half = await import(join(native, webFile))
    mock.module(join(native, file), () => half)
  }
}
