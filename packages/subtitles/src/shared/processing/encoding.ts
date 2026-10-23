// SPDX-License-Identifier: AGPL-3.0-only
// Bytes into text (checkpoint 7, Processing, step 2). A byte-order mark wins; bytes that are valid
// UTF-8 are UTF-8; anything else is chardet's guess, decoded by the WHATWG `TextDecoder`. Node's
// official builds are full-ICU and decode windows-1250 to 1258, the ISO 8859 family, GB18030,
// Big5, Shift_JIS, EUC-KR and KOI8-R (https://nodejs.org/api/util.html#whatwg-supported-encodings).
// Line endings become `\n`, and the BOM is dropped: the sidecar is written as UTF-8 without one.
import { detect } from 'chardet'

/** windows-1252 is the WHATWG fallback for labels it doesn't know and for chardet giving up. */
const FALLBACK = 'windows-1252'

function bom(bytes: Uint8Array): { label: string; length: number } | null {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { label: 'utf-8', length: 3 }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { label: 'utf-16le', length: 2 }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { label: 'utf-16be', length: 2 }
  return null
}

function decoder(label: string): TextDecoder {
  try {
    return new TextDecoder(label as ConstructorParameters<typeof TextDecoder>[0], { fatal: false })
  } catch {
    // A label the WHATWG list doesn't have (chardet's ISO-2022-CN, say).
    return new TextDecoder(FALLBACK, { fatal: false })
  }
}

const normalise = (text: string): string => text.replace(/\r\n?/g, '\n')

export function decodeSubtitle(bytes: Uint8Array): { text: string; encoding: string } {
  const mark = bom(bytes)
  if (mark) {
    const used = decoder(mark.label)
    return { text: normalise(used.decode(bytes.subarray(mark.length))), encoding: used.encoding }
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: normalise(text), encoding: 'utf-8' }
  } catch {
    // Not UTF-8: guess.
  }
  const used = decoder(detect(bytes) ?? FALLBACK)
  // `ignoreBOM: false` is the default, so a BOM the guess's encoding carries is dropped too.
  return { text: normalise(used.decode(bytes)).replace(/^﻿/, ''), encoding: used.encoding }
}
