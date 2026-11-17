# @highsea-tv/ui

highsea's one component library (ADR 0060). Its React Native renderer (`src/native`) is the one drawing of each component: on the phone and the TV, and on the web through react-native-web, for every client and its prototype (one-client-platform.md). What react-native-web leaves to the page, the renderer does once, in `Press` and `ScrollView`: a pointer's hover (the looks' hover roles), the keyboard's focus ring on the web only (`:focus-visible`; the phone keeps the system's own) and Space on checkboxes, radios, switches and tabs, touch's 44 hit area as a layer (react-native-web drops `hitSlop`), and the web's scrollbar drawn over a scroller. `Text` takes its type scale by the input: the web's with a pointer, the phone's on touch, the TV's on the TV. Where the web needs other code, the module is a platform pair (`name.web.ts` beside `name.ts`; apps/client/README.md › Platform files). `src/shared/parity.ts` lists what's drawn twice and why.

Since D3 of [one-client-platform-d.md](../../docs/plans/one-client-platform-d.md) it's the only renderer: the web renderer (`src/web`, on Radix, Tailwind and `motion/react`) is removed, and the admin, the guides and the prototypes draw this one too. The values come from [`@highsea-tv/tokens`](../tokens/README.md); the rules they follow are in [`docs/design-language/`](../../docs/design-language/README.md).

## Setup

Wrap the app once in `ThemeProvider` (`import { ThemeProvider } from '@highsea-tv/ui'`), which gives every part the theme's colours and the form factor.

- **Expo** (`apps/client`): Metro resolves `react-native` and the platform files by itself.
- **A Next.js host** (the admin's server, the guides): build on webpack and take the library's setup from `@highsea-tv/ui/next/webpack`, whose `libraryWebpack(config, context)` aliases `react-native` to react-native-web, puts the `.web` files first and defines `__DEV__` and `EXPO_OS`. `@highsea-tv/ui/next/style-registry`'s `StyleRegistry` writes react-native-web's sheet into the server's HTML through Next's `useServerInsertedHTML`.
- **Tests** draw it in happy-dom through `@highsea-tv/ui/testing/react-native-web`.

## Components

`src/native/index.ts` exports them all, and `src/native/tv/index.ts` the TV's own parts (`@highsea-tv/ui/tv`). Every control takes its size, corner and colours from the control spec in the tokens ([controls.md](../../docs/design-language/controls.md)). Strings a part says itself are in `src/native/messages.ts`; everything else a part says, the app passes in.

## Sound

`createSoundPlayer()` returns a player whose `play(event)` plays the events in [sound.md](../../docs/design-language/sound.md). The player synthesizes the token sound pack with Web Audio, so it matches the WAV files native clients play. It starts on the first play (after a user gesture), throttles `navigate` and lets `notify` play over other sounds. Off the web (`sound.ts`), it stays silent until native sound comes.

## TV and spatial focus

The spatial focus engine lives in `src/native/tv/spatial/` (`@highsea-tv/ui/focus`): the model's scoring (`spatial.ts`) and the DOM navigator on it (`navigator.ts`). The native renderer's TV parts run it in a browser: `Focusable` and the TV's parts are written once against the engine pair `src/native/tv/engine.tsx` (react-native-tvos's own focus on tvOS and Android TV: `hasTVPreferredFocus`, `requestTVFocus`, `TVFocusGuideView`, `useTVEventHandler`, a scroll view's `scrollSnapOffset`) and `engine.web.tsx` (the same names on the navigator: stops and guides mark themselves through react-native-web's `dataSet`, and one navigator on the document moves focus while any stop is mounted). What a stop draws on focus is `Focusable`'s on every platform. `useRemote` gives the remote's presses on both: in a browser the arrows, Enter (`select`), Escape and Backspace (`menu`, Back) and the media key (`playPause`). On top of the reference board's markup, the library's stops add `data-trap` (a guide's `trapFocus*`), `data-guide` (its `destinations`, read through the navigator's `destinations` option) and `data-kept` (a TvPage's Kept part, landed as a whole).

The scoring is the reference board's ([tv.md](../../docs/design-language/platforms/tv.md#spatial-focus-model)): a candidate must be ahead, left and right need vertical overlap, and up and down also accept a 45° cone. Arrow keys inside text fields are left alone. With a pointer, a row is one Tab stop whose arrows move along it (`dom.web.ts`).

## Scripts and tests

- `bun run build` turns `design/assets/icons/*.svg` into `src/icons/glyphs.ts`. `bun run check` fails when it is stale.
- `bun test` (from the repo root or here) runs:
  - **behavior:** components in happy-dom with Testing Library;
  - **accessibility:** axe-core (WCAG 2.2 A and AA) on every component and every open overlay. Contrast is checked exactly by the token tests instead;
  - **sound and focus:** the audio graph and envelopes against a recording fake `AudioContext`; the spatial scoring.
