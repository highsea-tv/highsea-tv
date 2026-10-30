// SPDX-License-Identifier: AGPL-3.0-only
// Connect a device: the code in what the camera reads (C1, connectivity.md#signing-in-a-tv-from-the-phone).
import { codeFrom, normal } from '../src/app/link/index.tsx'

describe('codes', () => {
  test('typed codes lose their dashes and spaces, and are upper case', () => {
    expect(normal('kq7-4pm')).toBe('KQ74PM')
    expect(normal(' KQ7 4PM ')).toBe('KQ74PM')
  })

  test('a QR code holds the /link address, a highsea:// link, or the code', () => {
    expect(codeFrom('https://tv.example/link?code=kq7-4pm')).toBe('KQ74PM')
    expect(codeFrom('highsea://link/KQ74PM')).toBe('KQ74PM')
    expect(codeFrom('KQ7-4PM')).toBe('KQ74PM')
  })

  test('anything else is no code', () => {
    expect(codeFrom('https://example.com/')).toBeNull()
    expect(codeFrom('hello')).toBeNull()
  })
})
