// SPDX-License-Identifier: AGPL-3.0-only
// Home: a placeholder under the shell until part B ports the screen (one-client-platform.md › B).
// It's the TV's root: Back here leaves highsea, as apps/tv's Home did (../../back.tsx).
import { destinationMessages } from '@highsea-tv/client/gate'
import { useT } from '@highsea-tv/i18n/react'
import { useLeaveOnBack } from '../../back.tsx'
import { Coming } from '../../kit.tsx'

export default function Placeholder() {
  useLeaveOnBack(true)
  return <Coming title={useT(destinationMessages)('home')} />
}
