// SPDX-License-Identifier: AGPL-3.0-only
// A date and a time, in local time, as the field look (controls.md): the value is the form HTML's
// `datetime-local` input takes, `YYYY-MM-DDTHH:MM`
// (https://html.spec.whatwg.org/multipage/input.html#local-date-and-time-state-(type=datetime-local)).
// In a browser it's that input, with the browser's own picker (date-time.web.tsx). React Native
// has no picker of its own (https://reactnative.dev/docs/components-and-apis), so here it's the
// text field, typed in that form, and a change is passed on once it's a whole date and time.
// Inside a Field, the field's label names it. The admin, the one place it's drawn, runs in a browser.
import { useEffect, useState } from 'react'
import type { FieldCommon } from '../shared/controls.ts'
import { Input } from './field.tsx'

export type DateTimeInputProps = Pick<FieldCommon, 'size' | 'disabled'> & {
  /** `YYYY-MM-DDTHH:MM`, in local time. */
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}

const WHOLE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function DateTimeInput({ value, onChange, size, disabled, invalid }: DateTimeInputProps) {
  const [text, setText] = useState(value.replace('T', ' '))
  useEffect(() => setText(value.replace('T', ' ')), [value])
  return (
    <Input
      value={text}
      size={size}
      disabled={disabled}
      invalid={invalid}
      mono
      placeholder="YYYY-MM-DD HH:MM"
      onChangeText={(next) => {
        setText(next)
        const v = next.trim().replace(' ', 'T')
        if (WHOLE.test(v) && !Number.isNaN(Date.parse(v))) onChange(v)
      }}
    />
  )
}
