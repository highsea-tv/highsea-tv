// SPDX-License-Identifier: AGPL-3.0-only
// The settings areas later checkpoints build, inside the settings frame; anything else is not found.
import { notFound } from 'next/navigation'
import { LaterArea } from '../../../../src/admin/settings.tsx'
import { isArea } from '../../../../src/admin/settings-areas.ts'

export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params
  if (!isArea(area)) notFound()
  return <LaterArea id={area} />
}
