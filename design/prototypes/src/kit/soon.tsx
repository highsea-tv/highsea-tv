// SPDX-License-Identifier: AGPL-3.0-only
// A control on a reference page that isn't wired up (plan › fidelity levels: "secondary controls
// may be inert, with a 'not in prototype' tooltip"). It stays focusable, so the tooltip is reachable.
import { Button, type ButtonProps, cn, Tooltip } from '@highsea-tv/ui-web'

export function Soon({ children, className, ...props }: Omit<ButtonProps, 'onClick' | 'disabled'>) {
  return (
    <Tooltip content="Not in the prototype">
      <Button {...props} aria-disabled className={cn('cursor-not-allowed opacity-60', className)}>
        {children}
      </Button>
    </Tooltip>
  )
}
