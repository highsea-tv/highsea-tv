'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Labels, hints and errors wired to their control: accessibility.md#understandable
import { Label as LabelPrimitive } from 'radix-ui'
import { type ComponentProps, createContext, type ReactNode, useContext, useId } from 'react'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'

type FieldIds = { id: string; hintId?: string; errorId?: string; invalid: boolean }
const FieldContext = createContext<FieldIds | null>(null)

/** The ids and ARIA a control inside a `Field` should carry. */
export function useFieldControl(props: {
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling'
}) {
  const field = useContext(FieldContext)
  const describedBy =
    [props['aria-describedby'], field?.hintId, field?.errorId].filter(Boolean).join(' ') ||
    undefined
  return {
    id: props.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined),
  }
}

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('font-medium text-[13px] text-text-2', className)}
      {...props}
    />
  )
}

export type FieldProps = {
  label: ReactNode
  /** Help text under the control. */
  hint?: ReactNode
  /** Says what happened and what to do. Marks the control invalid. */
  error?: ReactNode
  /** Use when the control renders its own id. */
  id?: string
  /** The control first, with the label and hint beside it: for a Switch or Checkbox. */
  inline?: boolean
  className?: string
  children: ReactNode
}

/** A visible label, the control, then the hint or error, all tied together. */
export function Field({ label, hint, error, id, inline, className, children }: FieldProps) {
  const auto = useId()
  const controlId = id ?? `${auto}-control`
  const ids: FieldIds = {
    id: controlId,
    hintId: hint ? `${auto}-hint` : undefined,
    errorId: error ? `${auto}-error` : undefined,
    invalid: Boolean(error),
  }
  return (
    <FieldContext.Provider value={ids}>
      <div
        className={cn(
          'grid min-w-0',
          // inline: the control in the first column, aligned with the label; text in the second
          inline
            ? 'grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1'
            : 'grid-cols-[minmax(0,1fr)] gap-1.5',
          className,
        )}
      >
        {inline && children}
        <Label htmlFor={controlId}>{label}</Label>
        {!inline && children}
        {hint && (
          <p id={ids.hintId} className={cn('text-caption text-text-3', inline && 'col-start-2')}>
            {hint}
          </p>
        )}
        {error && (
          <p
            id={ids.errorId}
            className={cn(
              'flex items-start gap-1.5 text-badge-danger text-caption',
              inline && 'col-start-2',
            )}
          >
            <Icon name="alert" size={14} className="mt-px shrink-0" />
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

export const controlBase =
  'w-full min-w-0 max-w-full rounded-sm border border-line-strong bg-s1 text-form text-text outline-none transition-tint placeholder:text-text-3 focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-soft)] focus-visible:outline-none disabled:opacity-45 aria-[invalid=true]:border-danger'

export type InputProps = ComponentProps<'input'> & {
  /** An icon inside the start of the field. */
  icon?: IconName
  /** Content inside the end of the field (a `Kbd` hint, a unit). */
  end?: ReactNode
}

export function Input({ className, icon, end, ...props }: InputProps) {
  const control = useFieldControl(props)
  const input = (
    <input
      {...props}
      {...control}
      className={cn(
        controlBase,
        'h-(--size-input) px-3',
        icon && 'ps-9',
        end && 'pe-12',
        !icon && !end && className,
      )}
    />
  )
  if (!icon && !end) return input
  return (
    <div className={cn('relative flex items-center', className)}>
      {icon && (
        <Icon name={icon} size={16} className="pointer-events-none absolute start-3 text-text-3" />
      )}
      {input}
      {end && <div className="absolute end-2.5 flex items-center text-text-3">{end}</div>}
    </div>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  const control = useFieldControl(props)
  return (
    <textarea
      {...props}
      {...control}
      className={cn(controlBase, 'min-h-24 px-3 py-2 leading-[1.5]', className)}
    />
  )
}
