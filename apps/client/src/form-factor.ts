// SPDX-License-Identifier: AGPL-3.0-only
// The input a frame asks for, whatever the device it runs on (one-client-platform.md › A):
// the prototypes draw a phone, a window and a TV side by side on web pages, so the web reads it from
// the address (./form-factor.web.ts). An installed app is its own device and is never framed.

/** The input a frame asks the client to draw for (`touch`, `pointer` or `tv`), if any. */
export const formFactorOverride = (): string | undefined => undefined
