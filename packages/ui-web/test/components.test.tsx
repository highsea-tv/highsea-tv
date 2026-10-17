// SPDX-License-Identifier: AGPL-3.0-only
import './dom.ts'
import { afterEach, describe, expect, mock, test } from 'bun:test'
import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import {
  BackdropHero,
  Badge,
  Banner,
  Button,
  CarouselRow,
  CommandPalette,
  ConfirmDialog,
  Field,
  Input,
  Lockup,
  Mark,
  NavGroup,
  NavItem,
  Poster,
  Progress,
  Rating,
  RatingInput,
  SegmentedControl,
  ServerCard,
  Sidebar,
  SoundProvider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toaster,
  toast,
  UIProvider,
  useCommandPaletteShortcut,
} from '../src/index.ts'
import type { SoundPlayer } from '../src/sound/player.ts'

afterEach(() => {
  cleanup()
  toast.clear()
})

function fakePlayer() {
  const played: string[] = []
  const player: SoundPlayer = {
    play: (e) => void played.push(e),
    enabled: true,
    setEnabled() {},
    setVolume() {},
    setPack() {},
    dispose() {},
  }
  return { played, player }
}

describe('Button', () => {
  test('is a plain button by default', () => {
    const { getByRole } = render(<Button>Save</Button>)
    expect(getByRole('button', { name: 'Save' }).getAttribute('type')).toBe('button')
  })

  test('loading disables it and marks it busy', () => {
    const onClick = mock()
    const { getByRole } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )
    const button = getByRole('button', { name: 'Save' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })

  test('asChild styles a link as a button', () => {
    const { getByRole } = render(
      <Button asChild variant="primary">
        <a href="/x">Go</a>
      </Button>,
    )
    const link = getByRole('link', { name: 'Go' })
    expect(link.className).toContain('bg-accent-fill')
  })
})

describe('Field', () => {
  test('ties the label, hint and error to the control', () => {
    const { getByLabelText } = render(
      <Field label="Name" hint="Shown to everyone." error="Required.">
        <Input />
      </Field>,
    )
    const input = getByLabelText('Name')
    const described = (input.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent)
    expect(described).toEqual(['Shown to everyone.', 'Required.'])
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  test('without an error the control is valid', () => {
    const { getByLabelText } = render(
      <Field label="Name">
        <Input />
      </Field>,
    )
    expect(getByLabelText('Name').hasAttribute('aria-invalid')).toBe(false)
  })
})

describe('status never relies on color alone', () => {
  test('badges carry a dot and a label', () => {
    const { container } = render(<Badge tone="success">Seeding</Badge>)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.textContent).toBe('Seeding')
    expect(badge.querySelector('[aria-hidden]')).not.toBeNull()
  })

  test('progress shows its percentage and exposes its value', () => {
    const { getByRole, getByText } = render(<Progress value={42.4} showValue aria-label="Sintel" />)
    expect(getByRole('progressbar', { name: 'Sintel' }).getAttribute('aria-valuenow')).toBe('42.4')
    expect(getByText('42%')).toBeTruthy()
  })

  test('indeterminate progress has no value', () => {
    const { getByRole } = render(<Progress value={null} aria-label="Waiting" />)
    expect(getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false)
  })
})

describe('Tabs', () => {
  test('arrow keys move between tabs and show the panel', async () => {
    const user = userEvent.setup()
    const { getByRole } = render(
      <UIProvider toaster={false}>
        <Tabs defaultValue="a">
          <TabsList aria-label="Sections">
            <TabsTrigger value="a">Queue</TabsTrigger>
            <TabsTrigger value="b">History</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Queue panel</TabsContent>
          <TabsContent value="b">History panel</TabsContent>
        </Tabs>
      </UIProvider>,
    )
    await user.click(getByRole('tab', { name: 'Queue' }))
    await user.keyboard('{ArrowRight}')
    expect(getByRole('tab', { name: 'History' }).getAttribute('aria-selected')).toBe('true')
    expect(getByRole('tabpanel').textContent).toBe('History panel')
  })
})

describe('SegmentedControl', () => {
  test('is a radio group with one choice', async () => {
    const user = userEvent.setup()
    const onValueChange = mock()
    const { getByRole } = render(
      <SegmentedControl
        aria-label="View"
        onValueChange={onValueChange}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
      />,
    )
    expect(getByRole('radiogroup', { name: 'View' })).toBeTruthy()
    await user.click(getByRole('radio', { name: 'List' }))
    expect(onValueChange).toHaveBeenCalledWith('list')
    expect(getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true')
  })
})

describe('ConfirmDialog', () => {
  test('destructive confirmations focus Cancel and use the danger fill', () => {
    const onConfirm = mock()
    const { getByRole } = render(
      <ConfirmDialog
        open
        title="Delete Sintel?"
        description="This deletes the file from disk."
        confirmLabel="Delete"
        destructive
        onConfirm={onConfirm}
      />,
    )
    const dialog = getByRole('alertdialog', { name: 'Delete Sintel?' })
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }))
    const del = within(dialog).getByRole('button', { name: 'Delete' })
    expect(del.className).toContain('bg-danger-fill')
    fireEvent.click(del)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('Escape closes it', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(true)
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Leave?"
          description="Unsaved changes are lost."
          confirmLabel="Leave"
          onConfirm={() => {}}
        />
      )
    }
    const { queryByRole } = render(<Harness />)
    await user.keyboard('{Escape}')
    expect(queryByRole('alertdialog')).toBeNull()
  })
})

describe('Toast', () => {
  test('shows toasts politely, with an action that stays', async () => {
    const onClick = mock()
    const { findByText, getByRole } = render(<Toaster />)
    act(() => {
      toast({ title: 'Grab failed', tone: 'danger', action: { label: 'Retry', onClick } })
    })
    expect(await findByText('Grab failed')).toBeTruthy()
    fireEvent.click(getByRole('button', { name: 'Retry' }))
    expect(onClick).toHaveBeenCalled()
  })

  test('keeps at most three on screen', async () => {
    const { findAllByRole } = render(<Toaster />)
    act(() => {
      for (let i = 0; i < 5; i++) toast({ title: `Toast ${i}` })
    })
    const items = await findAllByRole('status')
    expect(items.length).toBeLessThanOrEqual(3)
  })
})

describe('CarouselRow', () => {
  function Row() {
    return (
      <CarouselRow title="Recently added">
        <Poster title="Sintel" href="/1" />
        <Poster title="Spring" href="/2" />
        <Poster title="Cosmos Laundromat" href="/3" />
      </CarouselRow>
    )
  }

  test('is one tab stop, labelled by its title', () => {
    const { getByRole, getAllByRole } = render(<Row />)
    expect(getByRole('region', { name: 'Recently added' })).toBeTruthy()
    const tabbable = getAllByRole('link').filter((l) => l.tabIndex === 0)
    expect(tabbable.map((l) => l.getAttribute('href'))).toEqual(['/1'])
  })

  test('arrow keys move focus and play navigate; the ends stay silent', () => {
    const { played, player } = fakePlayer()
    const { getAllByRole } = render(
      <SoundProvider player={player} enabled>
        <Row />
      </SoundProvider>,
    )
    const links = getAllByRole('link')
    const [first, second, third] = links as [HTMLElement, HTMLElement, HTMLElement]
    act(() => first.focus())
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(second)
    expect(second.tabIndex).toBe(0)
    expect(first.tabIndex).toBe(-1)
    fireEvent.keyDown(second, { key: 'End' })
    expect(document.activeElement).toBe(third)
    fireEvent.keyDown(third, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(third)
    expect(played).toEqual(['navigate', 'navigate'])
  })
})

describe('Poster', () => {
  test('the link is named by the title', () => {
    const { getByRole } = render(<Poster title="Sintel" href="/m/1" src="/sintel.jpg" />)
    expect(getByRole('link', { name: 'Sintel' })).toBeTruthy()
  })

  test('with a visible title the image is not announced twice', () => {
    const { getByRole, container } = render(
      <Poster title="Sintel" href="/m/1" src="/sintel.jpg" showTitle caption="2010" />,
    )
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
    expect(getByRole('link').textContent).toContain('Sintel')
  })

  test('falls back to the title when the art fails', () => {
    const { container, getByRole } = render(<Poster title="Sintel" href="/m/1" src="/x.jpg" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(getByRole('link', { name: 'Sintel' })).toBeTruthy()
  })

  test('continue-watching progress is exposed', () => {
    const { getByRole } = render(<Poster title="Sintel" aspect="still" progress={40} />)
    expect(getByRole('progressbar', { name: 'Watched' }).getAttribute('aria-valuenow')).toBe('40')
  })
})

describe('BackdropHero', () => {
  test('artwork is decorative; the copy names the region', () => {
    const { getByRole, container } = render(
      <UIProvider toaster={false}>
        <BackdropHero
          item={{ id: '1', title: 'Sintel', backdrop: '/s.jpg', eyebrow: 'Featured' }}
        />
      </UIProvider>,
    )
    expect(getByRole('region', { name: 'Sintel' })).toBeTruthy()
    expect(getByRole('heading', { name: 'Sintel' })).toBeTruthy()
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  })

  test('new artwork loads behind and comes forward once decoded', () => {
    const { container, rerender } = render(
      <BackdropHero item={{ id: '1', title: 'Sintel', backdrop: '/a.jpg' }} />,
    )
    rerender(<BackdropHero item={{ id: '2', title: 'Spring', backdrop: '/b.jpg' }} />)
    const imgs = [...container.querySelectorAll('img')]
    const a = imgs.find((i) => i.getAttribute('src') === '/a.jpg') as HTMLImageElement
    const b = imgs.find((i) => i.getAttribute('src') === '/b.jpg') as HTMLImageElement
    // never a blank frame: the old art stays in front until the new one has loaded
    expect(a.className).toContain('opacity-100')
    expect(b.className).toContain('opacity-0')
    fireEvent.load(b)
    expect(b.className).toContain('opacity-100')
    expect(a.className).toContain('opacity-0')
  })
})

describe('Rating', () => {
  test('the value is in the label', () => {
    const { getByRole } = render(<Rating value={3.5} />)
    expect(getByRole('img', { name: 'Rated 3.5 out of 5' })).toBeTruthy()
  })

  test('RatingInput is a radio group of stars', async () => {
    const user = userEvent.setup()
    const onValueChange = mock()
    const { getByRole } = render(
      <RatingInput aria-label="Your rating" onValueChange={onValueChange} />,
    )
    await user.click(getByRole('radio', { name: '4 stars' }))
    expect(onValueChange).toHaveBeenCalledWith(4)
  })
})

describe('Sidebar', () => {
  test('marks the current page and labels rail items', () => {
    const { getByRole, rerender } = render(
      <UIProvider toaster={false}>
        <Sidebar mode="full">
          <NavGroup>
            <NavItem icon="dashboard" label="Dashboard" href="/" active />
            <NavItem icon="movie" label="Movies" href="/movies" count={412} />
          </NavGroup>
        </Sidebar>
      </UIProvider>,
    )
    expect(getByRole('navigation', { name: 'Main' })).toBeTruthy()
    expect(getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBe('page')
    expect(getByRole('link', { name: /Movies/ }).textContent).toContain('412')
    rerender(
      <UIProvider toaster={false}>
        <Sidebar mode="rail">
          <NavGroup>
            <NavItem icon="movie" label="Movies" href="/movies" count={412} />
          </NavGroup>
        </Sidebar>
      </UIProvider>,
    )
    expect(getByRole('link', { name: 'Movies' }).textContent).toBe('')
  })
})

describe('CommandPalette', () => {
  function Harness({ onMovies }: { onMovies: () => void }) {
    const [open, setOpen] = useState(false)
    useCommandPaletteShortcut(() => setOpen((o) => !o))
    return (
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        groups={[
          {
            heading: 'Go to',
            items: [
              { id: 'movies', label: 'Movies', icon: 'movie', onSelect: onMovies },
              { id: 'downloads', label: 'Downloads', keywords: ['torrents'], onSelect: () => {} },
            ],
          },
        ]}
      />
    )
  }

  test('⌘K opens it; typing filters; Enter runs the command and closes', async () => {
    const user = userEvent.setup()
    const onMovies = mock()
    const { queryByRole, getByRole } = render(<Harness onMovies={onMovies} />)
    expect(queryByRole('dialog')).toBeNull()
    await user.keyboard('{Meta>}k{/Meta}')
    expect(getByRole('dialog', { name: 'Command palette' })).toBeTruthy()
    await user.keyboard('torr')
    expect(queryByRole('option', { name: 'Movies' })).toBeNull()
    expect(getByRole('option', { name: 'Downloads' })).toBeTruthy()
    await user.clear(getByRole('combobox'))
    await user.keyboard('mov{Enter}')
    expect(onMovies).toHaveBeenCalledTimes(1)
    expect(queryByRole('dialog')).toBeNull()
  })
})

describe('Banner', () => {
  test('dismissible, unless acknowledgement is required', () => {
    const onDismiss = mock()
    const onAcknowledge = mock()
    const { getByRole, rerender, queryByRole } = render(
      <Banner title="Maintenance" onDismiss={onDismiss} />,
    )
    fireEvent.click(getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalled()
    rerender(<Banner title="Maintenance" onDismiss={onDismiss} onAcknowledge={onAcknowledge} />)
    expect(queryByRole('button', { name: 'Dismiss' })).toBeNull()
    fireEvent.click(getByRole('button', { name: 'Got it' }))
    expect(onAcknowledge).toHaveBeenCalled()
  })
})

describe('brand', () => {
  test('the lockup reads "highsea tv"', () => {
    const { getByRole } = render(<Lockup />)
    expect(getByRole('img', { name: 'highsea tv' })).toBeTruthy()
  })

  test('the mark uses the small cut below 24px and follows the theme accent', () => {
    const { container, rerender } = render(<Mark size={16} />)
    const cut = () => container.querySelector('mask path')?.getAttribute('stroke-width')
    expect(cut()).toBe('4.2')
    expect(container.querySelector('stop')?.getAttribute('style')).toContain('var(--color-accent)')
    rerender(<Mark size={32} />)
    expect(cut()).toBe('3.2')
  })
})

describe('ServerCard', () => {
  test('is a button in both modes when it has an action, and names its status', () => {
    const onClick = mock()
    for (const mode of ['full', 'rail'] as const) {
      const { getByRole, unmount } = render(
        <UIProvider toaster={false}>
          <Sidebar mode={mode} footer={<ServerCard name="Den" status="online" onClick={onClick} />}>
            <NavGroup>
              <NavItem icon="dashboard" label="Dashboard" href="/" />
            </NavGroup>
          </Sidebar>
        </UIProvider>,
      )
      fireEvent.click(getByRole('button', { name: /Den.*online/i }))
      unmount()
    }
    expect(onClick).toHaveBeenCalledTimes(2)
  })
})
