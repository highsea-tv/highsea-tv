// SPDX-License-Identifier: AGPL-3.0-only
// The TV client (C1–C7), in screen units. Built at checkpoint 3.
import { TvRoot } from '../kit/tv/tv-root.tsx'

export function TvApp() {
  return (
    <TvRoot>
      <main className="grid h-full place-items-center">
        <div className="grid gap-[1cqw] text-center">
          <p className="font-mono text-(length:--tv-text-eyebrow) text-text-3 uppercase tracking-label">
            Not in the prototype yet
          </p>
          <h1 className="font-semibold text-(length:--tv-text-row-title)">The TV app</h1>
          <button
            type="button"
            data-focusable
            data-initial
            className="mx-auto rounded-(--tv-radius-button) bg-s2 px-[1.6cqw] py-[0.8cqw] text-(length:--tv-text-button) outline-none transition-lift focus-visible:scale-(--scale-button) focus-visible:bg-text focus-visible:text-bg"
          >
            Checkpoint 3 builds this screen
          </button>
        </div>
      </main>
    </TvRoot>
  )
}
