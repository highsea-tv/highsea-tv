// SPDX-License-Identifier: AGPL-3.0-only
// A real QR code as SVG: an authenticator app's otpauth:// link, or a TV's sign-in link. The
// symbol comes from `qrcode`'s create(), which runs anywhere (server components too). It's dark on
// light in every theme, as scanners expect, with the four-module quiet zone ISO/IEC 18004 asks
// for; the colours are the prototype's.
import { create, type QRCodeErrorCorrectionLevel } from 'qrcode'
import { cn } from '../lib/cn.ts'

export type QrCodeProps = {
  value: string
  /** What the code is for, for screen readers: "QR code for the sign-in link". */
  'aria-label': string
  /** M, the library's default, recovers about 15% of a damaged code. */
  level?: QRCodeErrorCorrectionLevel
  className?: string
}

const QUIET = 4

export function QrCode({ value, 'aria-label': label, level = 'M', className }: QrCodeProps) {
  const { size, data } = create(value, { errorCorrectionLevel: level }).modules
  // one path of unit squares: thousands of <rect>s would be heavy for a 57×57 symbol
  let d = ''
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-QUIET} ${-QUIET} ${size + QUIET * 2} ${size + QUIET * 2}`}
      shapeRendering="crispEdges"
      className={cn('block aspect-square rounded-sm bg-[#ededee]', className)}
    >
      <path d={d} fill="#0b0b0c" />
    </svg>
  )
}
