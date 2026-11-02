// SPDX-License-Identifier: AGPL-3.0-only
// Choices in iOS's action sheet (https://reactnative.dev/docs/actionsheetios), as the phone offers
// a card's menu and a film's picks: the options, then Cancel.
import { ActionSheetIOS } from 'react-native'

/** Resolves with the chosen value, or nothing on Cancel; the one in force is ticked. */
export function choose(
  title: string,
  options: { value: string; label: string }[],
  cancel: string,
  chosen?: string,
): Promise<string | undefined> {
  return new Promise((resolve) =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...options.map((o) => (o.value === chosen ? `${o.label} ✓` : o.label)), cancel],
        cancelButtonIndex: options.length,
        userInterfaceStyle: 'dark',
      },
      (i) => resolve(options[i]?.value),
    ),
  )
}
