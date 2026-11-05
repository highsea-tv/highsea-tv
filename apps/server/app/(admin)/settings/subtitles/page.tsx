// SPDX-License-Identifier: AGPL-3.0-only
// Settings › Subtitles lives on the Subtitles page (A10), opened on its settings (Providers), as
// Settings' nav links to it; an address typed by hand goes there too. Every other area has a page
// of its own.
import { redirect } from 'next/navigation'

export default function SubtitlesArea() {
  redirect('/subtitles/providers')
}
