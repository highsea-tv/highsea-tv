// SPDX-License-Identifier: AGPL-3.0-only
// A DOM for the admin's component tests, as the prototype's has, with the library's
// native drawing on react-native-web. Import it first, before anything that touches `document`
// or the library.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered)
  GlobalRegistrator.register({
    url: 'http://localhost/',
    // trailers embed a player only once clicked; tests check the frame's address, not its page
    settings: { disableIframePageLoading: true },
  })

  // React's act() environment flag, so state updates in tests flush synchronously
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// happy-dom rejects a cancelled animation's `finished` promise, which Motion leaves unhandled.
// the library's native drawing, as Next draws it: react-native as react-native-web, each platform
// file's web half (@highsea-tv/ui/testing/react-native-web), before any test imports a screen
const { drawWithReactNativeWeb } = await import('@highsea-tv/ui/testing/react-native-web')
await drawWithReactNativeWeb()
