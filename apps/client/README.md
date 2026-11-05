# @highsea-tv/app

The client: one Expo project for the phone, the TV and the web ([one-client-platform.md › A](../../docs/plans/one-client-platform.md)), on Expo SDK 58, react-native-tvos 0.88 under the `react-native` alias, and Expo Router. The phone and the TV are its native builds; the web is the same screens through react-native-web, exported as a single-page app under `/web`. Every screen draws with `@highsea-tv/ui`'s React Native renderer on all three.

It's named `@highsea-tv/app` because `@highsea-tv/client` is the clients' shared logic ([packages/client](../../packages/client), ADR 0055). Part A built the foundation and one destination on every target: the gate (`src/app/_layout.tsx`), Choose a server (`connect.tsx`), its sign-in (`sign-in.tsx`), the signed-in shell (`(in)/_layout.tsx`) and Settings (`(in)/settings.tsx`), with their shared parts in `src/kit.tsx`. The other screens come in part B.

## Commands

```sh
bun run --cwd apps/client dev           # Metro for every platform
bun run --cwd apps/client web           # the web in Metro's dev server
bun run --cwd apps/client prebuild      # ios/ for the iPhone (generated, never committed)
bun run --cwd apps/client prebuild:tv   # ios/ for the Apple TV (EXPO_TV=1)
bun run --cwd apps/client ios           # build and run on the iPhone simulator, with Metro
bun run --cwd apps/client tv            # build and run on the Apple TV simulator, with Metro
bun run --cwd apps/client export:web    # the web's static export, in dist/
bun run --cwd apps/client serve         # dist/ at http://localhost:3300/web/, /api and /stream to bun run server
bun run --cwd apps/client typecheck
bun run --cwd apps/client test          # Jest (test/*.jest.tsx); bun run test runs it too
```

The phone and the TV share `ios/`, so each prebuild starts it afresh (`--clean`): run `prebuild` or `prebuild:tv` before building for the other one. A Release build needs no Metro, as the phone sweep's is made: in `ios/`, `xcodebuild -workspace highsea.xcworkspace -scheme highsea -configuration Release -sdk iphonesimulator -derivedDataPath build CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO build` (`-sdk appletvsimulator` for the TV). CocoaPods needs a UTF-8 locale (`LANG=en_US.UTF-8`).

Since part C's C2 the client is the shipping app: its bundle identifiers are `tv.highsea.mobile` and `tv.highsea.tv`, and its URL scheme is `highsea`, so it installs over the 4.5a app and keeps the servers it knew in the keychain ([Apple](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps)).

The desktop app is the same client exported for the web at the window's root with `EXPO_PUBLIC_HIGHSEA_APP=desktop` (`export:desktop`, into `dist-desktop/`; `web:desktop` is its dev server on port 3201, which `tauri dev` starts). Only that export loads `src/desktop/tauri.tsx`, its host on Tauri's Rust side (`src/desktop/app.ts`).

## Metro

[metro.config.js](metro.config.js) has three rules, each cited there: `react-native` always resolves from the app (two copies crash with "Tried to register two views with the same name RCTText"); on the web, React, react-dom, react-native-web and the app's other dependencies resolve from the app when our packages import them, so there's one copy of each and their contexts work; and on the web, our own `@highsea-tv/*` packages resolve under the `react-native` condition, so `@highsea-tv/ui` draws with its React Native renderer through react-native-web. Third-party packages keep Expo's web conditions. Vite, Next and Bun never read this file, so the admin and the prototypes keep the library's `default` export, its DOM renderer.

## Platform files

When the web needs other code than the phone and the TV, the module is a platform pair: `name.ts` for the phone and the TV, and `name.web.ts` beside it for the web, imported as `./name`. Metro picks the file per bundle. The web's video player and its TV focus engine are built this way.

The rules, and why:

1. **Import a pair without its extension.** Metro looks for the exact path first, and only when no file is there does it try `name.web.ts`, `name.ios.ts`, `name.native.ts`, then `name.ts` ([Module Resolution](https://metrobundler.dev/docs/resolution/)). So `import { x } from './name'` picks the platform's file, while `./name.ts` (the repo's usual style) takes `name.ts` on every platform, the web included. Type-only imports can keep the extension, since they're erased before Metro sees them.
2. **Both files take the same extension** (`.ts` beside `.web.ts`, `.tsx` beside `.web.tsx`). Metro tries the platforms within each extension in turn, so on the web a `name.ts` would be found before a `name.web.tsx`.
3. **A pair is never a package's exports target.** Metro takes a target exactly as written and doesn't look for platform files beside it ([Package Exports › Replacing platform-specific extensions](https://metrobundler.dev/docs/package-exports/#replacing-platform-specific-extensions)). The exported file stays whole and imports the pair relatively, as `@highsea-tv/native/intl` imports `./polyfills`. One exception, for the tools that don't run on Metro: a pair's web file may be a `default` target written after a `react-native` one, which Metro, asserting `react-native` for our packages on every platform and taking the first condition it asserts in the order written ([Node › Conditional exports](https://nodejs.org/api/packages.html#conditional-exports)), never reads. `@highsea-tv/native/playback` is `{ "react-native": "./src/playback-entry.ts", "default": "./src/playback.web.ts" }`, so TypeScript and Bun, which assert no `react-native` condition, read the web engine.
4. **The native file is the one TypeScript sees, and the web file is typed by it.** TypeScript resolves `./name` to `name.ts`; the web file declares its exports with the native file's types (`import type { x as native } from './name.ts'`, then `export const x: typeof native = …`; a web file whose exports differ by design, as the player's engine with its own picture handle, is typed by a shared type the native's must also satisfy, as `@highsea-tv/native/playback`'s `UsePlayback`), and both are compiled, since each package's `include` covers `src/`. So `tsc -p tsconfig.json` checks the native side against its callers and the web side against the native. Only Metro-bundled code (this app, `@highsea-tv/native`, `@highsea-tv/ui`'s native renderer, `@highsea-tv/client`) uses pairs: Next and Bun don't read `.web` files.

TypeScript's [`moduleSuffixes`](https://www.typescriptlang.org/tsconfig/#moduleSuffixes) would let a second, web tsconfig resolve `./name` to `name.web.ts`, but it applies to every import, third-party types included, and reads files Metro never would: expo-status-bar's `StatusBar.web.d.ts` takes no props, and react-native-svg's web types have no `SvgProps`, so the web project reports errors in code Metro bundles correctly. Typing each web file by its native sibling checks the same thing without that.

The pairs today:

| Pair | Native | Web |
| --- | --- | --- |
| [`packages/native/src/polyfills`](../../packages/native/src/polyfills.ts) | FormatJS's Intl polyfills for Hermes | nothing: browsers have Intl |
| [`src/fonts`](src/fonts.ts) | Geist is embedded at build time (expo-font's plugin) | `useFonts` loads it, since config plugins don't run on the web ([Fonts](https://docs.expo.dev/develop/user-interface/fonts/)) |
| [`src/form-factor`](src/form-factor.ts) | never framed | the prototype frame's input (`?ff=`) from the address |
| [`packages/native/src/playback`](../../packages/native/src/playback.ts) | the player's engine on expo-video | the `<video>` with hls.js (in its own chunk) or Safari's native HLS, since expo-video's web player only sets the `<video>`'s `src`; what both share is `playback-shared.ts` |
| [`packages/ui/src/native/dom`](../../packages/ui/src/native/dom.ts) | every focus shows the ring; the platform presses on its own keys; `hitSlop` is the hit area | the ring only at `:focus-visible`, Space presses checkboxes, radios, switches and tabs, and Press draws the hit area as a layer, since react-native-web drops `hitSlop` |
| [`packages/ui/src/native/scrollbar`](../../packages/ui/src/native/scrollbar.tsx) | the platform's own indicator | ScrollView's bar drawn over the scroller, in PageScrollbar's measures |
| [`packages/ui/src/native/tv/engine`](../../packages/ui/src/native/tv/engine.tsx) | the TVs' own focus engines: `hasTVPreferredFocus`, `requestTVFocus`, `TVFocusGuideView`, `useTVEventHandler` and a scroll view's `scrollSnapOffset` | the spatial focus engine the TV prototype signed off (`tv/spatial/`), behind the same names, since react-native-web has no TV focus |

[test/platform-files.test.ts](test/platform-files.test.ts) holds the rules across the app and the workspace's packages, and `scripts/bundles.ts` checks each bundle took its own side: the web's has no native side of a pair (so none of FormatJS's polyfills), and the phone's and the TV's have no `.web` file of ours.

## Seams for part B

- **Mock mode.** `EXPO_PUBLIC_HIGHSEA_MOCK=1` at build time gives the SDK client the mock server's `fetch`, `@highsea-tv/mock/transport`, with the prototypes' frame channel, `@highsea-tv/mock/frame`, beside it ([src/transport.ts](src/transport.ts)). Expo inlines `EXPO_PUBLIC_` variables when it bundles ([Environment variables](https://docs.expo.dev/guides/environment-variables/)), so without it the minifier drops the branch and both modules with it, and `scripts/bundles.ts` fails a bundle built without mock mode that carries `packages/mock/src` or the channel's name. `bun run export:web:mock` makes the mock web export in `dist-mock/`, which the prototypes' Vite server serves at `/web` and their chrome's frames hold on the routes the client has (`design/prototypes/src/chrome/client.ts`). Framed, the client follows the chrome over the channel ([src/frame-channel.ts](src/frame-channel.ts)): the frame's input, the toolbar's states (the transport's, the theme, 200% text as ThemeProvider's `fontScale` and reduced motion), and its navigation; it reports its route and the role after a sign-in. Opened on its own, as the sweeps open it, it reads the same states from the address (`/web/connect?ff=touch&theme=oled&text=200&motion=reduced`). The mock keeps sign-ins and its changes in the page's `localStorage`, which on the prototypes' server is one origin with the prototypes' own screens, so clearing site data clears both.
- **The form factor.** A prototype frame says which input it shows with `?ff=` in the address (`touch` for the phone's frame, `pointer`, or `tv` for the TV's), read once by the root layout ([src/form-factor.web.ts](src/form-factor.web.ts)). The layout hands it to ThemeProvider through `settingOf` ([src/frame.ts](src/frame.ts), on `@highsea-tv/tokens`' `formFactorSettingNamed`), which also takes a whole form factor such as `compact-touch`. Without it, or with a name that isn't one, the layout passes no override and the provider decides by the device (the TV's remote, touch, or a browser's pointer), so a desktop browser isn't forced onto touch. Screens ask `theme.formFactor.input === 'tv'` or `useFormFactor()`, never the OS.

## The web export

`export:web` turns on Expo's tree shaking (`EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH` and `EXPO_UNSTABLE_TREE_SHAKING`), which removes the exports nothing imports, such as the Lucide icons the library doesn't use. It's experimental in SDK 58 and production only ([Tree shaking](https://docs.expo.dev/guides/tree-shaking/#enabling-tree-shaking)); without it the export is about twice the size. The page is a single-page app (`web.output: 'single'`) with every address and asset under `/web` (`experiments.baseUrl`, [app config](https://docs.expo.dev/versions/latest/config/app/)), so a server answers any address under `/web` with `index.html`, as [serve.ts](scripts/serve.ts) does.
