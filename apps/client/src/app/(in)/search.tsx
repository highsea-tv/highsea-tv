// SPDX-License-Identifier: AGPL-3.0-only
// Search: a placeholder under the shell until part B ports the screen (one-client-platform.md › B).
import { destinationMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { Coming } from '../../kit.tsx'

export default function Placeholder() {
  return <Coming title={useT(destinationMessages)('search')} />
}
