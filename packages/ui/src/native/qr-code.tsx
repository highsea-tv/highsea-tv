// SPDX-License-Identifier: AGPL-3.0-only
// A real QR code (qr-code.tsx in ui-web): the TV's sign-in link, for the phone to scan. The symbol
// comes from `qrcode`'s create(), as on the web, drawn as one path with react-native-svg. It's
// dark on light in every theme, as scanners expect, with the four-module quiet zone ISO/IEC 18004
// asks for: the default theme's text and background, whatever the theme.
import { create, type QRCodeErrorCorrectionLevel } from 'qrcode'
import { useMemo } from 'react'
import { Platform } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { svgName } from './icon.tsx'
import { tokens } from './theme.tsx'

const QUIET = 4
/** Dark on light in every theme: the default theme's own pair, not the person's. */
const { bg: DARK, text: LIGHT } = tokens.themes.default.colors

export function QrCode({
  value,
  label,
  size,
  level = 'M',
}: {
  value: string
  /** What the code is for, for VoiceOver: "QR code for the sign-in link". */
  label: string
  /** Its width and height, in points. */
  size: number
  /** M, the library's default, recovers about 15% of a damaged code. */
  level?: QRCodeErrorCorrectionLevel
}) {
  const { n, d } = useMemo(() => {
    const { size: n, data } = create(value, { errorCorrectionLevel: level }).modules
    let d = ''
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (data[y * n + x]) d += `M${x} ${y}h1v1h-1z`
    return { n, d }
  }, [value, level])
  const box = n + QUIET * 2
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-QUIET} ${-QUIET} ${box} ${box}`}
      // named in each platform's terms: on the web react-native-svg hands React Native's
      // accessibility props to the `<svg>` as they are, so it takes ARIA's there (svgName)
      {...svgName(label)}
      {...(Platform.OS === 'web' ? null : { accessibilityRole: 'image' as const })}
    >
      <Rect x={-QUIET} y={-QUIET} width={box} height={box} rx={1.5} fill={LIGHT} />
      <Path d={d} fill={DARK} />
    </Svg>
  )
}
