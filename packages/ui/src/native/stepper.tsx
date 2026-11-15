// SPDX-License-Identifier: AGPL-3.0-only
// The steps of a wizard (the web renderer's web/components/stepper.tsx, drawn once here since D3,
// one-client-platform-d.md): a vertical list beside the form in a regular window, where finished
// steps are buttons back to themselves and later ones plain text until reached; in a compact one
// (below 768, the form-factor rule), "Step 3 of 8" with the step's name and a bar. Its semantics
// are roles, which react-native-web writes as ARIA: a `navigation` round an ordered `list`, the
// step shown `aria-current="step"` (https://www.w3.org/TR/wai-aria-1.2/#aria-current). The app
// passes its words.
import { line, stepper, webText } from '@highsea-tv/tokens'
import { View } from 'react-native'
import { useRegularWindow } from './admin.tsx'
import { Icon } from './icon.tsx'
import { Press } from './press.tsx'
import { ProgressBar } from './progress.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const s = tokens.space
const ui = tokens.adminText.ui
/** A step's numbered disc (the web's size-5.5), its number in 11 mono. */
const DISC = stepper.disc
const DISC_TEXT = webText.label.size
/** A step's row (the web's h-9). */
const ROW = stepper.row

export type StepperStep = { id: string; label: string }

export type StepperProps = {
  steps: StepperStep[]
  current: number
  /** The furthest step reached: steps up to it can be revisited. */
  reached: number
  onSelect: (index: number) => void
  /** The list's name ("Setup steps"). */
  label: string
  /** The collapsed heading's words for a step, counted from 1 ("Step 2 of 3"). */
  stepOf: (current: number, total: number) => string
  /** The collapsed bar's name ("Setup progress"). */
  progressLabel: string
  /** Read after a finished step's name (", done"). */
  doneLabel: string
}

export function Stepper({
  steps,
  current,
  reached,
  onSelect,
  label,
  stepOf,
  progressLabel,
  doneLabel,
}: StepperProps) {
  const theme = useTheme()
  const regular = useRegularWindow()
  const step = steps[current]
  if (!regular)
    return (
      <View role="navigation" aria-label={label} style={{ gap: s['2'] }}>
        <Text variant="caption" color="text-2">
          {stepOf(current + 1, steps.length)}
          {step ? <Text variant="caption">{` · ${step.label}`}</Text> : null}
        </Text>
        <ProgressBar
          look="panel"
          value={((current + 1) / steps.length) * 100}
          label={progressLabel}
        />
      </View>
    )
  return (
    <View role="navigation" aria-label={label}>
      <View role="list" style={{ gap: s['0.5'] }}>
        {steps.map((st, i) => {
          const done = i < reached && i !== current
          const active = i === current
          const disc = (
            <View
              aria-hidden
              style={{
                width: DISC,
                height: DISC,
                flexShrink: 0,
                borderRadius: tokens.radius.pill,
                borderWidth: line.thin,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: theme.colors[active ? 'accent' : done ? 'line-strong' : 'line'],
                backgroundColor: active ? theme.colors.accent : done ? theme.colors.s3 : undefined,
              }}
            >
              {done ? (
                <Icon name="check" size={tokens.icon.size['2xs']} color="text" />
              ) : (
                <Text mono size={DISC_TEXT} leading={1} color={active ? 'on-accent' : 'text-3'}>
                  {String(i + 1)}
                </Text>
              )}
            </View>
          )
          const words = (color: 'text' | 'text-2' | 'text-3', weight?: 500) => (
            <Text
              size={ui.size}
              leading={ui.leading}
              weight={weight}
              color={color}
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0 }}
            >
              {st.label}
            </Text>
          )
          const row = {
            minHeight: ROW,
            flexDirection: 'row',
            alignItems: 'center',
            gap: s['2'] + s['0.5'],
            paddingHorizontal: s['2'],
            borderRadius: tokens.radius.sm,
          } as const
          return (
            <View key={st.id} role="listitem" aria-current={active ? 'step' : undefined}>
              {i <= reached && !active ? (
                <Press
                  onPress={() => onSelect(i)}
                  accessibilityRole="button"
                  // a finished step is a button only once reached, so it says it's done in its name
                  accessibilityLabel={done ? `${st.label}${doneLabel}` : st.label}
                  style={({ hovered }) => [
                    row,
                    hovered ? { backgroundColor: theme.colors.s2 } : null,
                  ]}
                >
                  {({ hovered }) => (
                    <>
                      {disc}
                      {words(hovered ? 'text' : 'text-2')}
                    </>
                  )}
                </Press>
              ) : (
                <View style={[row, active ? { backgroundColor: theme.colors.s2 } : null]}>
                  {disc}
                  {words(active ? 'text' : 'text-3', active ? 500 : undefined)}
                </View>
              )}
            </View>
          )
        })}
      </View>
    </View>
  )
}
