// SPDX-License-Identifier: AGPL-3.0-only
// The global download and upload limits: one token bucket each, shared by every peer. Downloads
// are limited by asking for blocks only when the bucket has room, uploads by holding a block back
// until it does. A limit of 0 is unlimited.

export type Bucket = ReturnType<typeof createBucket>

export function createBucket(now: () => number = () => performance.now()) {
  /** Bytes per second; 0 is unlimited. */
  let rate = 0
  let tokens = 0
  let last = now()
  const waiting: { bytes: number; resolve: () => void }[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const refill = () => {
    const t = now()
    // a burst of at most one second, so a pause doesn't save up a flood
    tokens = Math.min(rate, tokens + ((t - last) / 1000) * rate)
    last = t
  }

  const drain = () => {
    timer = null
    refill()
    while (waiting.length) {
      const next = waiting[0] as (typeof waiting)[number]
      if (rate > 0 && tokens < Math.min(next.bytes, rate)) break
      waiting.shift()
      if (rate > 0) tokens -= next.bytes
      next.resolve()
    }
    if (waiting.length && rate > 0) {
      const need = Math.min((waiting[0] as (typeof waiting)[number]).bytes, rate) - tokens
      timer = setTimeout(drain, Math.max(5, (need / rate) * 1000))
      timer.unref?.()
    }
  }

  return {
    rate: () => rate,
    setRate(bytesPerSecond: number) {
      refill()
      rate = Math.max(0, Math.floor(bytesPerSecond))
      tokens = Math.min(tokens, rate)
      drain()
    },
    /** Whether `bytes` can go now; takes them if so. */
    tryTake(bytes: number): boolean {
      if (rate === 0) return true
      refill()
      if (tokens < Math.min(bytes, rate)) return false
      tokens -= bytes
      return true
    },
    /** Resolves when `bytes` may go, in order. */
    take(bytes: number): Promise<void> {
      if (rate === 0 && !waiting.length) return Promise.resolve()
      return new Promise((resolve) => {
        waiting.push({ bytes, resolve })
        if (!timer) drain()
      })
    },
    /** Lets everything waiting go, at shutdown. */
    flush() {
      if (timer) clearTimeout(timer)
      timer = null
      for (const w of waiting.splice(0)) w.resolve()
    },
  }
}

/** Bytes per second over a sliding window of one-second slots. */
export function createMeter(seconds = 5, now: () => number = () => Date.now()) {
  const slots = new Float64Array(seconds)
  let slotAt = Math.floor(now() / 1000)
  const roll = () => {
    const s = Math.floor(now() / 1000)
    const gap = Math.min(seconds, s - slotAt)
    for (let i = 1; i <= gap; i++) slots[(slotAt + i) % seconds] = 0
    if (s > slotAt) slotAt = s
  }
  return {
    add(bytes: number) {
      roll()
      slots[slotAt % seconds] = (slots[slotAt % seconds] as number) + bytes
    },
    /** Bytes per second, averaged over the window's full seconds. */
    rate(): number {
      roll()
      let sum = 0
      for (let i = 1; i < seconds; i++) sum += slots[(slotAt - i + seconds * 2) % seconds] as number
      return sum / (seconds - 1)
    },
  }
}
