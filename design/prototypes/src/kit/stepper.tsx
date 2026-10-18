// SPDX-License-Identifier: AGPL-3.0-only
// The steps of a wizard, as a vertical list beside the form. Finished steps are buttons, so you
// can go back to one; later steps are plain text until you reach them. Below `expanded` the list
// collapses to "Step 3 of 8" and a bar.
import { cn, Icon, Progress } from '@highsea/ui-web'

export type Step = { id: string; label: string }

export type StepperProps = {
  steps: Step[]
  current: number
  /** The furthest step reached: steps up to it can be revisited. */
  reached: number
  onSelect: (index: number) => void
  className?: string
}

export function Stepper({ steps, current, reached, onSelect, className }: StepperProps) {
  const step = steps[current]
  return (
    <nav aria-label="Setup steps" className={className}>
      <div className="grid gap-2 expanded:hidden">
        <p className="text-caption text-text-2">
          Step {current + 1} of {steps.length}
          {step && <span className="text-text"> · {step.label}</span>}
        </p>
        <Progress value={((current + 1) / steps.length) * 100} aria-label="Setup progress" />
      </div>
      <ol className="hidden gap-0.5 expanded:grid">
        {steps.map((s, i) => {
          const done = i < reached && i !== current
          const active = i === current
          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  'grid size-5.5 shrink-0 place-items-center rounded-full border font-mono text-[11px]',
                  active
                    ? 'border-accent bg-accent text-on-accent'
                    : done
                      ? 'border-line-strong bg-s3 text-text'
                      : 'border-line text-text-3',
                )}
              >
                {done ? <Icon name="check" size={12} /> : i + 1}
              </span>
              <span className="min-w-0 truncate">{s.label}</span>
              {done && <span className="sr-only">, done</span>}
            </>
          )
          const row = 'flex h-9 w-full items-center gap-2.5 rounded-sm px-2 text-start text-ui'
          return (
            <li key={s.id} aria-current={active ? 'step' : undefined}>
              {i <= reached && !active ? (
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  className={cn(row, 'text-text-2 transition-tint hover:bg-s2 hover:text-text')}
                >
                  {body}
                </button>
              ) : (
                <div className={cn(row, active ? 'bg-s2 font-medium text-text' : 'text-text-3')}>
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
