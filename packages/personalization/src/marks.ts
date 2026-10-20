// SPDX-License-Identifier: AGPL-3.0-only
// The server's mark (ADR 0028): a square SVG or PNG, at least 256 px, at most 1 MB. The type comes
// from the bytes, never from the client's word (OWASP File Upload Cheat Sheet: validate the file
// type by its content, not its name or Content-Type).
import { AppError } from '@highsea/core'

export const MARK_MAX_BYTES = 1_000_000
export const MARK_MIN_PX = 256

export type MarkType = 'image/png' | 'image/svg+xml'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const invalid = (message: string, reason: string) => new AppError('invalid', message, { reason })

/**
 * PNG (RFC 2083 / W3C PNG § 5.2, § 11.2.2): the 8-byte signature, then the IHDR chunk first, whose
 * data starts with the width and height as 4-byte big-endian integers.
 */
function checkPng(bytes: Uint8Array) {
  if (bytes.length < 24) throw invalid('That PNG is damaged.', 'damaged')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunk = String.fromCharCode(...bytes.subarray(12, 16))
  if (chunk !== 'IHDR') throw invalid('That PNG is damaged.', 'damaged')
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (width !== height) throw invalid('The mark needs to be square.', 'not-square')
  if (width < MARK_MIN_PX)
    throw invalid(`The mark needs to be at least ${MARK_MIN_PX} px across.`, 'too-small')
}

/**
 * SVG: the root element must be `<svg>` in the SVG namespace (an `<img>` won't draw it otherwise),
 * with a square `viewBox`. A DOCTYPE is refused: SVG needs none, and it's how entity-expansion
 * attacks get in (OWASP XML External Entity Prevention Cheat Sheet).
 */
function checkSvg(bytes: Uint8Array) {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw invalid('The mark needs to be an SVG or PNG file.', 'type')
  }
  // the prolog: a BOM, an XML declaration, comments, processing instructions, whitespace
  const prolog = /^﻿?(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->)*/
  const rest = text.replace(prolog, '')
  if (/^<!DOCTYPE/i.test(rest))
    throw invalid('SVG files with a DOCTYPE aren’t accepted.', 'doctype')
  const root = /^<svg(?=[\s/>])([^>]*)>/.exec(rest)
  if (!root) throw invalid('The mark needs to be an SVG or PNG file.', 'type')
  const attrs = root[1] ?? ''
  if (!/\sxmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(attrs))
    throw invalid('The SVG needs the SVG namespace (xmlns) on its root.', 'namespace')
  const box = /\sviewBox\s*=\s*["']([^"']*)["']/.exec(attrs)?.[1]
  const numbers = box
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)
  if (numbers?.length !== 4 || numbers.some((n) => !Number.isFinite(n)))
    throw invalid('An SVG mark needs a square viewBox.', 'not-square')
  const [, , w, h] = numbers as [number, number, number, number]
  if (w <= 0 || w !== h) throw invalid('An SVG mark needs a square viewBox.', 'not-square')
}

/** Checks an uploaded mark and says what it is. Throws `invalid` with a reason otherwise. */
export function checkMark(bytes: Uint8Array): MarkType {
  if (bytes.length === 0) throw invalid('That file is empty.', 'empty')
  if (bytes.length > MARK_MAX_BYTES) throw invalid('The mark needs to be 1 MB or smaller.', 'size')
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) {
    checkPng(bytes)
    return 'image/png'
  }
  checkSvg(bytes)
  return 'image/svg+xml'
}
