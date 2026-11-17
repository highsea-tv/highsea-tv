// SPDX-License-Identifier: AGPL-3.0-only
// A DOM for component tests. Import it first, before anything that touches `document`.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered)
  GlobalRegistrator.register({
    url: 'http://localhost/',
    // the curation preview frames another copy of the app; tests check the composer, not the frame
    settings: { disableIframePageLoading: true },
  })

  // React's act() environment flag, so state updates in tests flush synchronously
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// happy-dom rejects a cancelled animation's `finished` promise, which Motion leaves unhandled.
// the admin's shared screens draw the library natively (src/admin/shared.tsx): react-native as
// react-native-web, each platform file's web half, as the admin's own tests have it
const { drawWithReactNativeWeb } = await import('@highsea-tv/ui/testing/react-native-web')
await drawWithReactNativeWeb()
