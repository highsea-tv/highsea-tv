// SPDX-License-Identifier: AGPL-3.0-only
import './dom.ts'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { cleanup, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { create } from 'qrcode'
import { QrCode, Stepper } from '../src/index.ts'

afterEach(cleanup)

const steps = [
  { id: 'name', label: 'Name' },
  { id: 'owner', label: 'Your account' },
  { id: 'folders', label: 'Folders' },
  { id: 'remote', label: 'Remote access' },
]

describe('Stepper', () => {
  test('reached steps are buttons; the current one is marked; later ones are text', async () => {
    const onSelect = mock()
    const { getByRole } = render(
      <Stepper steps={steps} current={1} reached={2} onSelect={onSelect} />,
    )
    const nav = getByRole('navigation', { name: 'Setup steps' })
    const list = within(nav).getByRole('list')
    expect(
      within(list)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Name, done', '3Folders'])
    expect(within(list).getByText('Your account').closest('li')?.getAttribute('aria-current')).toBe(
      'step',
    )
    await userEvent.click(within(list).getByRole('button', { name: /Name/ }))
    expect(onSelect).toHaveBeenCalledWith(0)
    // a finished step shows a check, not its number; collapsed, it reads "Step 2 of 4"
    expect(nav.textContent).toContain('Step 2 of 4')
  })

  test('its words can be translated', () => {
    const { getByRole } = render(
      <Stepper
        steps={steps}
        current={0}
        reached={0}
        onSelect={() => {}}
        aria-label="Étapes"
        stepOf="Étape {current} sur {total}"
      />,
    )
    expect(getByRole('navigation', { name: 'Étapes' }).textContent).toContain('Étape 1 sur 4')
  })
})

describe('QrCode', () => {
  test('draws the symbol qrcode computes, with a quiet zone, named for screen readers', () => {
    const value = 'otpauth://totp/highsea:ines?secret=JBSWY3DPEHPK3PXP&issuer=highsea'
    const { getByRole } = render(
      <QrCode value={value} aria-label="QR code for your authenticator app" />,
    )
    const svg = getByRole('img', { name: 'QR code for your authenticator app' })
    const { size, data } = create(value, { errorCorrectionLevel: 'M' }).modules
    expect(svg.getAttribute('viewBox')).toBe(`-4 -4 ${size + 8} ${size + 8}`)
    const squares = (svg.querySelector('path')?.getAttribute('d') ?? '').match(/M/g)?.length
    expect(squares).toBe(data.reduce((n, b) => n + (b ? 1 : 0), 0))
  })
})
