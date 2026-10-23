// SPDX-License-Identifier: AGPL-3.0-only
// `@echogarden/fvad-wasm` ships no types: it's libfvad built with Emscripten. These are libfvad's
// functions as `fvad.h` documents them (https://github.com/dpirch/libfvad/blob/master/include/fvad.h),
// with Emscripten's leading underscore, its heap view and its allocator.
declare module '@echogarden/fvad-wasm' {
  export type FvadModule = {
    /** `Fvad *fvad_new(void)`: a new instance, or 0 when memory runs out. */
    _fvad_new(): number
    _fvad_free(inst: number): void
    _fvad_reset(inst: number): void
    /** 0 (quality) to 3 (very aggressive); returns 0, or −1 for a bad mode. */
    _fvad_set_mode(inst: number, mode: number): number
    /** 8000, 16000, 32000 or 48000 Hz; returns 0, or −1 for a bad rate. */
    _fvad_set_sample_rate(inst: number, rate: number): number
    /** One 10, 20 or 30 ms frame of 16-bit samples: 1 speech, 0 not, −1 a bad frame length. */
    _fvad_process(inst: number, frame: number, length: number): number
    _malloc(bytes: number): number
    _free(ptr: number): void
    HEAP16: Int16Array
  }
  const fvad: (options?: Record<string, unknown>) => Promise<FvadModule>
  export default fvad
}
