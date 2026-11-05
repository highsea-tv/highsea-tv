// SPDX-License-Identifier: AGPL-3.0-only
// A file the admin picks, as base64 for a JSON body: Appearance's mark (`MarkUpload`) and Downloads'
// `.torrent` (`AddTorrentInput.torrent`).

export async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  // String.fromCharCode takes its arguments on the stack, so a big file goes in chunks
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
