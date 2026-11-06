// SPDX-License-Identifier: AGPL-3.0-only
// A path outside the admin that doesn't exist, such as a mistyped link page. Its card is the
// admin's (`@highsea-tv/admin/not-found.tsx`), drawn with the library's native renderer since D3.
import { NotFoundCard } from '@highsea-tv/admin/not-found.tsx'

export default function NotFound() {
  return <NotFoundCard />
}
