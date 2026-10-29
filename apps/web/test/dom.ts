// SPDX-License-Identifier: AGPL-3.0-only
// A DOM for the web app's screen tests, as the admin's have. Import it first.
import { GlobalRegistrator } from '@happy-dom/global-registrator'

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register({ url: 'http://localhost/web/' })
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Tests check state, not tweens: Motion jumps straight to each target (as with reduced motion)
const { MotionGlobalConfig } = await import('motion/react')
MotionGlobalConfig.skipAnimations = true
