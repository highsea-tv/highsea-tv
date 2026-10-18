// SPDX-License-Identifier: AGPL-3.0-only
// One page, two roles: `index.html` is the chrome (toolbar, frame, launcher); `index.html?screen`
// is the product screen inside the frame, which can also be opened on its own.
import './prototypes.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Chrome } from './chrome/chrome.tsx'
import { browserStorage, createMock } from './mock/client.ts'
import { FramedScreen } from './screen/screen.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')

const screen = new URLSearchParams(window.location.search).has('screen')

createRoot(root).render(
  <StrictMode>
    {screen ? <FramedScreen mock={createMock(browserStorage)} /> : <Chrome />}
  </StrictMode>,
)
