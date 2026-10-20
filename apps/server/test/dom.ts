// SPDX-License-Identifier: AGPL-3.0-only
// A DOM for the admin's component tests, as ui-web's and the prototype's have. Import it first,
// before anything that touches `document`.
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
// Tests check state, not tweens, so Motion jumps straight to each target (as with reduced motion).
const { MotionGlobalConfig } = await import('motion/react')
MotionGlobalConfig.skipAnimations = true
