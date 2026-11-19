// SPDX-License-Identifier: AGPL-3.0-only
// Whether a media page's hero words sit over its art (HT-105): AdminPage's hero frame says so, and
// the words then draw the logo or else the name, as the clients' hero does. On a plain page they
// draw only a logo, since the name is already the page's heading.
import { createContext, useContext } from 'react'

export const HeroArt = createContext(false)

export const useHeroArt = () => useContext(HeroArt)
