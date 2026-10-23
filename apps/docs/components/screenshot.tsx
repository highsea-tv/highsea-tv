// SPDX-License-Identifier: AGPL-3.0-only
// A screenshot that hasn't been taken yet: a dashed frame saying what it will show, so a guide reads
// whole in the meantime. The content test lists every one, so none ships unnoticed.
export function ScreenshotToCome({ shows }: { shows: string }) {
  return (
    <figure className="not-prose my-6 rounded-lg border border-dashed border-fd-border bg-fd-card px-4 py-8 text-center text-sm text-fd-muted-foreground">
      <span className="font-medium text-fd-foreground">Screenshot to come</span>
      <figcaption className="mt-1">{shows}</figcaption>
    </figure>
  )
}
