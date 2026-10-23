// SPDX-License-Identifier: AGPL-3.0-only
// RC4 for Message Stream Encryption, written here because Node 24's OpenSSL 3 doesn't offer it by
// default: OpenSSL 3 moved RC4 to the legacy provider (https://docs.openssl.org/3.0/man7/OSSL_PROVIDER-legacy/),
// which Node loads only with `--openssl-legacy-provider`
// (https://nodejs.org/docs/latest-v24.x/api/cli.html#--openssl-legacy-provider). On Node 24.21,
// `crypto.createCipheriv('rc4', …)` throws "unsupported". The cipher is the textbook key schedule
// and output loop; MSE discards the first 1024 bytes of keystream
// (https://wiki.vuze.com/w/Message_Stream_Encryption).

export type Rc4 = {
  /** XORs `data` with the next bytes of keystream, into a new array. */
  update(data: Uint8Array): Uint8Array
}

export function createRc4(key: Uint8Array, discard = 1024): Rc4 {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + (s[i] as number) + (key[i % key.length] as number)) & 0xff
    const t = s[i] as number
    s[i] = s[j] as number
    s[j] = t
  }
  let a = 0
  let b = 0
  const step = (): number => {
    a = (a + 1) & 0xff
    const sa = s[a] as number
    b = (b + sa) & 0xff
    const sb = s[b] as number
    s[a] = sb
    s[b] = sa
    return s[(sa + sb) & 0xff] as number
  }
  for (let i = 0; i < discard; i++) step()
  return {
    update(data) {
      const out = new Uint8Array(data.length)
      for (let i = 0; i < data.length; i++) out[i] = (data[i] as number) ^ step()
      return out
    },
  }
}
