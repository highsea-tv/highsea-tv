// SPDX-License-Identifier: AGPL-3.0-only
// The TV waiting with its code, as the pairing route would find it (connectivity.md#pairing-a-tv-
// from-the-phone): what the phone's Connect a device and the web's /link both ask about.

export const waiting = {
  code: 'KQ7-4PM',
  device: 'Living room TV',
  app: 'highsea for Apple TV',
  address: '192.168.1.42',
}

/** A code as typed or scanned, without its dash or spaces, in capitals. */
export const normalCode = (code: string) => code.replace(/[^a-z0-9]/gi, '').toUpperCase()
