// SPDX-License-Identifier: AGPL-3.0-only
// This device's theme and sound applied to the page (C7, client-settings.md), as the prototype's
// ApplyDevicePrefs does over the server's defaults. The preferences come from the server's layers
// (ADR 0027) through `@highsea-tv/client/prefs`; a custom theme is built with the theme engine and
// added as a stylesheet; the server's sound pack is loaded once it isn't the built-in one.
import { useAppearance } from '@highsea-tv/client/data'
import { useDevicePrefs } from '@highsea-tv/client/prefs'
import { useClient } from '@highsea-tv/sdk/react'
import { createTheme, defaultSoundPack, type SoundPack, themeCss } from '@highsea-tv/tokens'
import { useSoundPlayer } from '@highsea-tv/ui-web'
import { useEffect } from 'react'

/** The server's custom themes as CSS, so a theme and its swatches show their own colours. */
export function CustomThemeStyles() {
  const appearance = useAppearance()
  const css = (appearance.data?.themes ?? [])
    .map((t) => themeCss(createTheme({ ...t }).theme, `[data-theme="${t.id}"]`))
    .join('\n')
  return css ? <style>{css}</style> : null
}

export function ApplyDevicePrefs() {
  const { current } = useDevicePrefs()
  const appearance = useAppearance()
  const player = useSoundPlayer()
  const client = useClient()
  const theme = current?.theme
  const pack = appearance.data?.sound.pack

  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    root.dataset.theme = theme
  }, [theme])

  const sound = current?.sound
  const volume = current?.volume
  useEffect(() => {
    if (!player || sound === undefined || volume === undefined) return
    player.setEnabled(sound)
    player.setVolume(volume)
  }, [player, sound, volume])

  useEffect(() => {
    if (!player || !pack) return
    if (pack === defaultSoundPack.id) {
      player.setPack(defaultSoundPack)
      return
    }
    client.appearance
      .soundPack({ params: { id: pack } })
      .then((p) => player.setPack(p as unknown as SoundPack))
      .catch(() => player.setPack(defaultSoundPack))
  }, [player, client, pack])

  return <CustomThemeStyles />
}
