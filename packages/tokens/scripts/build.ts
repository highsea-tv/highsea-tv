// SPDX-License-Identifier: AGPL-3.0-only
// Writes the generated CSS. `--check` fails instead of writing when the files are stale (CI).
import { tailwindCss, tokensCss } from '../src/css.ts'

const outputs = {
  'generated/tokens.css': tokensCss(),
  'generated/tailwind.css': tailwindCss(),
}

const check = process.argv.includes('--check')
let stale = 0
for (const [path, content] of Object.entries(outputs)) {
  const file = Bun.file(new URL(`../${path}`, import.meta.url))
  const current = (await file.exists()) ? await file.text() : ''
  if (current === content) continue
  if (check) {
    console.error(`${path} is out of date; run \`bun run build\` in packages/tokens`)
    stale++
  } else {
    await Bun.write(file, content)
    console.log(`wrote ${path}`)
  }
}
if (stale) process.exit(1)
