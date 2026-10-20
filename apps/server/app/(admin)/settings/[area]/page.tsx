// SPDX-License-Identifier: AGPL-3.0-only
// The settings areas later checkpoints build, inside the settings frame; anything else is not found,
// and so are Security and Backups for an admin (ADR 0032).
import { notFound } from 'next/navigation'
import { currentSession } from '../../../../src/admin/session.ts'
import { LaterArea } from '../../../../src/admin/settings.tsx'
import { isArea, seesArea } from '../../../../src/admin/settings-areas.ts'

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  if (!isArea(area)) notFound()
  // the layout has already let only the owner and admins through
  const session = await currentSession()
  if (!session || !seesArea(area, session.role)) notFound()
  return <LaterArea id={area} />
}
