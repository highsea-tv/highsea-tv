// SPDX-License-Identifier: AGPL-3.0-only
// Get the apps (docs/product/desktop-app.md, checkpoint 4.4a): the desktop app for each computer,
// this computer's first, and the address to type when the app can't find the server by itself.
// In the web client's Settings › About and its Downloads page, and in the admin's System › Status
// and command palette. The phone and TV apps join the list when they exist (4.5, 4.6).
import { Button, Dialog, DialogContent, Icon, toast } from '@highsea-tv/ui-web'

/** The latest stable release's files; the build links each installer by name. */
const RELEASES = 'https://github.com/highsea-tv/highsea-tv/releases/latest'

type Os = 'mac' | 'windows' | 'linux'

const apps: {
  os: Os
  name: string
  detail: string
  files: string[]
  note?: string
}[] = [
  { os: 'mac', name: 'macOS', detail: 'Apple silicon and Intel', files: ['.dmg'] },
  {
    os: 'windows',
    name: 'Windows',
    detail: 'Windows 10 and 11, 64-bit',
    files: ['.exe'],
    // the installer is unsigned until 1.0 (phase-4-checkpoint-4.md, answer 6)
    note: 'Windows may say it doesn’t recognise the installer. Choose More info, then Run anyway.',
  },
  {
    os: 'linux',
    name: 'Linux',
    detail: 'Ubuntu, Debian, Fedora and others',
    files: ['.AppImage', '.deb', '.rpm'],
  },
]

/** The computer this page is open on, from the browser's platform string. */
function thisOs(): Os | null {
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase()
  if (p.includes('mac')) return 'mac'
  if (p.includes('win')) return 'windows'
  if (p.includes('linux') && !p.includes('android')) return 'linux'
  return null
}

export function GetTheApps({ server, address }: { server: string; address: string }) {
  const mine = thisOs()
  const sorted = [...apps].sort((a, b) => Number(b.os === mine) - Number(a.os === mine))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <ul aria-label="Desktop apps" className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {sorted.map((a) => (
          <li
            key={a.os}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 rounded-md border border-line bg-s1 p-3"
          >
            <Icon name="laptop" size={20} className="mt-0.5 text-text-2" />
            <div className="grid min-w-0 gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2 font-semibold text-text text-ui">
                {a.name}
                {a.os === mine && (
                  <span className="font-normal text-caption text-text-3">This computer</span>
                )}
              </span>
              <span className="text-caption text-text-3">{a.detail}</span>
              {a.note && <span className="text-caption text-text-2">{a.note}</span>}
            </div>
            <div className="col-start-2 flex flex-wrap gap-2">
              {a.files.map((f, i) => (
                <Button
                  key={f}
                  size="sm"
                  variant={i === 0 && a.os === mine ? 'primary' : 'secondary'}
                  icon="download"
                  asChild
                >
                  <a href={RELEASES}>{a.files.length > 1 ? f : `Download ${f}`}</a>
                </Button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="grid gap-1.5">
        <p className="text-caption text-text-2">
          The app finds {server} on this network by itself. Anywhere else, add it by this address:
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 truncate font-mono text-figure text-text">{address}</code>
          <Button
            size="sm"
            variant="ghost"
            icon="copy"
            onClick={() =>
              navigator.clipboard.writeText(address).then(
                () => toast({ title: 'Address copied' }),
                () => toast.error('Couldn’t copy the address'),
              )
            }
          >
            Copy
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Get the apps in a dialog. */
export function GetTheAppsDialog({
  server,
  address,
  open,
  onOpenChange,
}: {
  server: string
  address: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" title="Get the apps">
        <GetTheApps server={server} address={address} />
      </DialogContent>
    </Dialog>
  )
}
