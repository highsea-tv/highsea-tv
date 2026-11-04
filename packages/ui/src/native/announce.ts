// SPDX-License-Identifier: AGPL-3.0-only
// Saying something to a screen reader without moving focus, on the phone and the TV: the web's
// side is ./announce.web.ts, a platform pair (apps/client/README.md › Platform files) imported as
// `./announce`. Internal: Toast uses it. Here it's AccessibilityInfo.announceForAccessibility
// (https://reactnative.dev/docs/accessibilityinfo#announceforaccessibility), which VoiceOver and
// TalkBack read politely; `accessibilityLiveRegion` would do it on Android only
// (https://reactnative.dev/docs/accessibility#accessibilityliveregion-android).
import { AccessibilityInfo } from 'react-native'

/** Says `words` politely, without moving focus. */
export const announce = (words: string) => AccessibilityInfo.announceForAccessibility(words)
