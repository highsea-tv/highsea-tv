// SPDX-License-Identifier: AGPL-3.0-only
// A show's page (client-shows.md), one screen for every client: ../../../shows/page.tsx, drawn
// from a film's page's parts. A server that doesn't serve shows sends its address Home.
import { usePublicInfo, useServes } from '@highsea-tv/client/data'
import { Redirect } from 'expo-router'
import { ShowScreen } from '../../../shows/page.tsx'

export default function ShowRoute() {
  const info = usePublicInfo()
  const serves = useServes('shows')
  if (info.status === 'success' && !serves) return <Redirect href="/" />
  return <ShowScreen />
}
