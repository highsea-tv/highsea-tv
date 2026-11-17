// SPDX-License-Identifier: AGPL-3.0-only
// Get the apps (desktop-app.md, checkpoint 4.4a): the desktop app for each computer, this
// computer's first, and the address to type when the app can't find the server by itself. Drawn
// once here (one-client-platform-d.md › D3) for the client's Profile, Settings › About and the
// web's Downloads, and for the admin's System › Status (the prototype's), where it was apps/client's
// alone until D3. The phone and TV apps join the list when they're published (4.5, 4.6).
//
// The installers are the latest stable release's files on GitHub, which the release workflow
// attaches by name (ADR 0050's 4.4a section). Each opens with the app's `onOpen` (the client's
// system browser), or without one as a link to a new tab. The address is copied with the
// Clipboard API (https://developer.mozilla.org/docs/Web/API/Clipboard/writeText), which only a
// browser has: where there's none, the address is still there to read, without the button.
import { useT } from '@highsea-tv/i18n/react'
import { StyleSheet, View } from 'react-native'
import { Button } from './button.tsx'
import { getTheAppsMessages } from './get-the-apps-messages.ts'
import { Icon } from './icon.tsx'
import { Dialog } from './sheet.tsx'
import { Text } from './text.tsx'
import { tokens, useTheme } from './theme.tsx'

const { space } = tokens

/** The latest stable release's files; the build links each installer by name. */
const RELEASES = 'https://github.com/highsea-tv/highsea-tv/releases/latest'

type DesktopOs = 'mac' | 'windows' | 'linux'

/** Each computer's app, in the prototype's order, with its installers' kinds. */
const DESKTOP_APPS: readonly { os: DesktopOs; files: readonly string[]; note?: true }[] = [
  { os: 'mac', files: ['.dmg'] },
  { os: 'windows', files: ['.exe'], note: true },
  { os: 'linux', files: ['.AppImage', '.deb', '.rpm'] },
]

type Navigator = { platform?: string; userAgent?: string; clipboard?: Clipboard }
type Clipboard = { writeText: (text: string) => Promise<void> }

/** A browser's navigator; React Native's has neither a platform string nor a clipboard. */
const nav = () => (globalThis as { navigator?: Navigator }).navigator

/** The computer this page is open on, from the browser's platform string, as the prototype's. */
function thisOs(n: Navigator | undefined = nav()): DesktopOs | null {
  const p = `${n?.platform ?? ''} ${n?.userAgent ?? ''}`.toLowerCase()
  if (p.includes('mac') && !/iphone|ipad/.test(p)) return 'mac'
  if (p.includes('win')) return 'windows'
  if (p.includes('linux') && !p.includes('android')) return 'linux'
  return null
}

export type GetTheAppsProps = {
  /** The server's name, in the line about its address. */
  server: string
  /** The address an app adds the server by. */
  address: string
  /** Opens an installer's page; without it each download is a link to a new tab. */
  onOpen?: (url: string) => void
  /** Says how copying the address went (a toast, or VoiceOver). */
  onSay?: (title: string, ok: boolean) => void
}

export function GetTheApps({ server, address, onOpen, onSay }: GetTheAppsProps) {
  const t = useT(getTheAppsMessages)
  const theme = useTheme()
  const mine = thisOs()
  const sorted = [...DESKTOP_APPS].sort((a, b) => Number(b.os === mine) - Number(a.os === mine))
  const clipboard = nav()?.clipboard
  return (
    <View style={{ gap: space['4'] }}>
      <View accessibilityRole="list" accessibilityLabel={t('list')} style={{ gap: space['2'] }}>
        {sorted.map((a) => {
          const name = t(a.os)
          return (
            <View
              key={a.os}
              accessibilityRole="listitem"
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: space['3'],
                padding: space['3'],
                borderRadius: tokens.radius.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.line,
                backgroundColor: theme.colors.s1,
              }}
            >
              <View style={{ marginTop: space['0.5'] }}>
                <Icon name="laptop" size={tokens.icon.size.md} color="text-2" />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: space['2'] }}>
                <View style={{ gap: space['0.5'] }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      alignItems: 'baseline',
                      columnGap: space['2'],
                    }}
                  >
                    <Text variant="body" weight={600}>
                      {name}
                    </Text>
                    {a.os === mine ? (
                      <Text variant="caption" color="text-3">
                        {t('thisComputer')}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="caption" color="text-3">
                    {t(`${a.os}Detail`)}
                  </Text>
                  {a.note ? (
                    <Text variant="caption" color="text-2">
                      {t('windowsNote')}
                    </Text>
                  ) : null}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] }}>
                  {a.files.map((f, i) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={i === 0 && a.os === mine ? 'primary' : 'secondary'}
                      icon="download"
                      accessibilityLabel={t('downloadFile', { file: f, os: name })}
                      {...(onOpen
                        ? { onPress: () => onOpen(RELEASES) }
                        : { href: RELEASES, follow: 'external' as const })}
                    >
                      {a.files.length > 1 ? f : t('download', { file: f })}
                    </Button>
                  ))}
                </View>
              </View>
            </View>
          )
        })}
      </View>
      <View style={{ gap: space['1'] + space['0.5'] }}>
        <Text variant="caption" color="text-2">
          {t('address', { server })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space['2'] }}>
          <Text variant="body" mono selectable numberOfLines={1} style={{ flexShrink: 1 }}>
            {address}
          </Text>
          {clipboard ? (
            <Button
              size="sm"
              variant="ghost"
              icon="copy"
              accessibilityLabel={t('copyAddress')}
              onPress={() =>
                void clipboard.writeText(address).then(
                  () => onSay?.(t('copied'), true),
                  () => onSay?.(t('notCopied'), false),
                )
              }
            >
              {t('copy')}
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/** Get the apps in a dialog: the client's Profile, Settings › About and Downloads, the admin's Status. */
export function GetTheAppsDialog({
  open,
  onOpenChange,
  ...props
}: GetTheAppsProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT(getTheAppsMessages)
  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} closable size="sm" title={t('title')}>
      {open ? <GetTheApps {...props} /> : null}
    </Dialog>
  )
}
