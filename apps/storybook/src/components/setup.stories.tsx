// SPDX-License-Identifier: AGPL-3.0-only
import { QrCode, Stepper } from '@highsea/ui-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'

const meta = { title: 'Components/Setup and sign-in' } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const steps = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'name', label: 'Name your server' },
  { id: 'owner', label: 'Your account' },
  { id: 'folders', label: 'Folders' },
  { id: 'remote', label: 'Remote access' },
  { id: 'done', label: 'Done' },
]

/** Finished steps can be revisited; resize below `expanded` for the collapsed form. */
export const WizardSteps: Story = {
  render: function Render() {
    const [current, setCurrent] = useState(3)
    return (
      <div className="w-64">
        <Stepper steps={steps} current={current} reached={3} onSelect={setCurrent} />
      </div>
    )
  },
}

/** A real code: scan it with an authenticator app. Dark on light in every theme, as scanners expect. */
export const AuthenticatorQr: Story = {
  render: () => (
    <QrCode
      value="otpauth://totp/highsea%20(Harbor):ines?secret=JBSWY3DPEHPK3PXP&issuer=highsea%20(Harbor)"
      aria-label="QR code for your authenticator app"
      className="w-48"
    />
  ),
}
