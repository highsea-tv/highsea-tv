'use client'
// SPDX-License-Identifier: AGPL-3.0-only
// Labels, hints and errors wired to their control (accessibility.md#understandable), and the text
// controls on the control spec (controls.md): a field is as tall as a button, 36 or 30, with the
// `control-edge` that reaches 3:1 (WCAG 1.4.11). Props are the shared `FieldCommon` plus the DOM's.
import { Label as LabelPrimitive } from 'radix-ui'
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useRef,
  useState,
} from 'react'
import type { FieldCommon } from '../../shared/controls.ts'
import { Icon, type IconName } from '../icons/icon.tsx'
import { cn } from '../lib/cn.ts'
import {
  type ControlSize,
  controlHit,
  controlInnerShape,
  controlShape,
  controlSizes,
  fieldIconStart,
  fieldLook,
} from '../lib/control.ts'

type FieldIds = {
  id: string
  hintId?: string
  errorId?: string
  invalid: boolean
  size?: ControlSize
  disabled?: boolean
}
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

/** The size and disabled state a control inside a `Field` takes, unless it sets its own. */
export function useFieldState(own: { size?: ControlSize; disabled?: boolean }) {
  const field = useContext(FieldContext)
  return {
    size: own.size ?? field?.size ?? 'md',
    disabled: own.disabled ?? field?.disabled,
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

/** `FieldCommon`, with the web's room for rich content in the label, hint and error. */
export type FieldProps = Omit<FieldCommon, 'label' | 'hint' | 'error'> & {
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
export function Field({
  label,
  hint,
  error,
  id,
  inline,
  hideLabel,
  size,
  disabled,
  className,
  children,
}: FieldProps) {
  const auto = useId()
  const controlId = id ?? `${auto}-control`
  const ids: FieldIds = {
    id: controlId,
    hintId: hint ? `${auto}-hint` : undefined,
    errorId: error ? `${auto}-error` : undefined,
    invalid: Boolean(error),
    size,
    disabled,
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
        <Label htmlFor={controlId} className={cn(hideLabel && 'sr-only')}>
          {label}
        </Label>
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

/** A text control's look and shape, at any size: fields, selects and text areas share it. */
export const controlBase = `w-full min-w-0 max-w-full ${controlShape} ${fieldLook}`

export type InputProps = Omit<ComponentProps<'input'>, 'size'> & {
  size?: ControlSize
  /** An icon inside the start of the field. */
  icon?: IconName
  /** Content inside the end of the field (a `Kbd` hint, a unit, a clear button). */
  end?: ReactNode
}

/** End padding when the field has content at its end: room for a `Kbd` or an icon button. */
const endPad: Record<ControlSize, string> = {
  md: 'pe-[calc(var(--control-h)+var(--control-gap))]',
  sm: 'pe-[calc(var(--control-h-sm)+var(--control-gap-sm))]',
}

export function Input({
  className,
  icon,
  end,
  size: ownSize,
  disabled: ownDisabled,
  'data-control': kind = 'input',
  ...props
}: InputProps & { 'data-control'?: string }) {
  const control = useFieldControl(props)
  const { size, disabled } = useFieldState({ size: ownSize, disabled: ownDisabled })
  const s = controlSizes[size]
  const wrapped = Boolean(icon || end)
  const input = (
    <input
      data-control={wrapped ? undefined : kind}
      {...props}
      {...control}
      disabled={disabled}
      className={cn(
        controlBase,
        s.h,
        s.text,
        icon ? s.fieldIconPad : s.fieldPad,
        end && endPad[size],
        !wrapped && className,
      )}
    />
  )
  if (!wrapped) return input
  // the wrapper carries the touch hit area, which an <input> can't (it has no ::after), and the
  // field's corner and text, so the control it marks has the input's shape and what sits at its
  // end (a unit) the input's size
  return (
    <div
      data-control={kind}
      className={cn(controlHit, controlShape, s.text, 'flex items-center', className)}
    >
      {icon && (
        <Icon
          name={icon}
          className={cn(s.icon, fieldIconStart[size], 'pointer-events-none absolute text-text-3')}
        />
      )}
      {input}
      {end && (
        <div className="absolute inset-y-(--control-inset) end-(--control-inset) flex items-center text-text-3">
          {end}
        </div>
      )}
    </div>
  )
}

export type TextareaProps = Omit<ComponentProps<'textarea'>, 'size'> & { size?: ControlSize }

export function Textarea({
  className,
  size: ownSize,
  disabled: ownDisabled,
  ...props
}: TextareaProps) {
  const control = useFieldControl(props)
  const { size, disabled } = useFieldState({ size: ownSize, disabled: ownDisabled })
  const s = controlSizes[size]
  return (
    <textarea
      data-control="textarea"
      {...props}
      {...control}
      disabled={disabled}
      className={cn(controlBase, s.fieldPad, s.text, 'min-h-24 py-2', className)}
    />
  )
}

export type SearchFieldProps = Omit<InputProps, 'icon' | 'type' | 'value' | 'defaultValue'> &
  Pick<FieldCommon, 'label' | 'hideLabel'> & {
    value?: string
    defaultValue?: string
    /** Each change, the clear button's included. */
    onValueChange?: (value: string) => void
    /** The clear button's name. */
    clearLabel?: string
  }

/**
 * A search field: a field with the search icon at its start and, once something is typed, a clear
 * button at its end that empties it and keeps focus in it. `type="search"` gives it the searchbox
 * role (https://www.w3.org/TR/html-aria/#el-input-search); its label is read, and shown only when
 * `hideLabel` is false.
 */
export function SearchField({
  label,
  hideLabel = true,
  value: controlled,
  defaultValue = '',
  onValueChange,
  onChange,
  clearLabel = 'Clear search',
  end,
  size: ownSize,
  className,
  ...props
}: SearchFieldProps) {
  const field = useContext(FieldContext)
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const value = controlled ?? uncontrolled
  const ref = useRef<HTMLInputElement>(null)
  const { size } = useFieldState({ size: ownSize })
  const set = (next: string) => {
    setUncontrolled(next)
    onValueChange?.(next)
  }
  const clear = value ? (
    <button
      type="button"
      aria-label={clearLabel}
      onClick={() => {
        set('')
        ref.current?.focus()
      }}
      className={cn(
        controlInnerShape,
        'inline-grid aspect-square h-full cursor-pointer place-items-center text-text-3 transition-tint hover:bg-s2 hover:text-text',
      )}
    >
      <Icon name="close" className={controlSizes[size].icon} />
    </button>
  ) : (
    end
  )
  const input = (
    <Input
      ref={ref}
      type="search"
      icon="search"
      size={ownSize}
      data-control="search-field"
      aria-label={field || !hideLabel ? undefined : label}
      {...props}
      value={value}
      onChange={(e) => {
        set(e.target.value)
        onChange?.(e)
      }}
      end={clear}
      className={cn('[&_input::-webkit-search-cancel-button]:appearance-none', className)}
    />
  )
  // inside a Field, or with its label hidden, it's the field alone
  if (field || hideLabel) return input
  return (
    <Field label={label} size={ownSize}>
      {input}
    </Field>
  )
}
