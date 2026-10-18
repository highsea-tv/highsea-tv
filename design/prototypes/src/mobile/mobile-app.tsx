// SPDX-License-Identifier: AGPL-3.0-only
// The mobile client (C1–C8), drawn inside the phone's safe areas. Built at checkpoint 3.
import { MobileScreen } from '../kit/mobile/device.tsx'
import { NotBuilt } from '../kit/not-built.tsx'

export function MobileApp() {
  return (
    <MobileScreen>
      <NotBuilt what="The mobile app" checkpoint={3} className="min-h-full" />
    </MobileScreen>
  )
}
