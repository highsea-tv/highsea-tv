// SPDX-License-Identifier: AGPL-3.0-only
// An image imported by a screen, as its host's bundler gives it: Next.js's static import, an
// object with the file's address and size (https://nextjs.org/docs/app/api-reference/components/image#src),
// or Vite's, the address alone (https://vite.dev/guide/assets#importing-asset-as-url), in the prototype.
declare module '*.svg' {
  const image: string | { src: string; width: number; height: number }
  export default image
}
