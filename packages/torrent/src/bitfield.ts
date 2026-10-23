// SPDX-License-Identifier: AGPL-3.0-only
// A bitfield in BEP 3's layout: piece 0 is the high bit of the first byte.

export class Bitfield {
  readonly length: number
  readonly buffer: Uint8Array
  #count = 0

  constructor(length: number, data?: Uint8Array) {
    this.length = length
    this.buffer = new Uint8Array(Math.ceil(length / 8))
    if (data) {
      this.buffer.set(data.subarray(0, this.buffer.length))
      // spare bits past the last piece are cleared, so a peer can't make `count` lie
      const spare = this.buffer.length * 8 - length
      if (spare > 0 && this.buffer.length)
        this.buffer[this.buffer.length - 1] =
          (this.buffer[this.buffer.length - 1] as number) & (0xff << spare)
      for (let i = 0; i < length; i++) if (this.get(i)) this.#count++
    }
  }

  get(i: number): boolean {
    return i >= 0 && i < this.length && ((this.buffer[i >> 3] as number) & (0x80 >> (i & 7))) !== 0
  }

  set(i: number, value = true) {
    if (i < 0 || i >= this.length || this.get(i) === value) return
    const byte = i >> 3
    const bit = 0x80 >> (i & 7)
    this.buffer[byte] = value
      ? (this.buffer[byte] as number) | bit
      : (this.buffer[byte] as number) & ~bit
    this.#count += value ? 1 : -1
  }

  count() {
    return this.#count
  }

  full() {
    return this.#count === this.length
  }
}
