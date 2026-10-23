// SPDX-License-Identifier: AGPL-3.0-only
// Any other admin path: the not-found page inside the shell, for the pages later checkpoints build.
import { notFound } from 'next/navigation'

export default function Rest() {
  notFound()
}
