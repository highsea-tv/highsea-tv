// SPDX-License-Identifier: AGPL-3.0-only
// New results said aloud on iOS and tvOS. The web and Android read the results' live region
// (accessibilityLiveRegion), which iOS has no counterpart for, so VoiceOver is told with
// AccessibilityInfo.announceForAccessibility
// (https://reactnative.dev/docs/accessibilityinfo#announceforaccessibility), as the library's
// sortable list does: how many came, or the line saying nothing did.
import { useEffect } from 'react'
import { AccessibilityInfo, Platform } from 'react-native'

/** Says `words` once for each new set of results (`results`, by identity); nothing while there are none. */
export function useAnnounceResults(results: unknown, words: string | null) {
  useEffect(() => {
    if (Platform.OS !== 'ios' || results === undefined || !words) return
    AccessibilityInfo.announceForAccessibility(words)
  }, [results, words])
}
