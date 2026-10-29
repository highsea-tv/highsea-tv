// SPDX-License-Identifier: AGPL-3.0-only
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { resumeAfterUpdate, startUpdates } from './desktop/updates.ts'
import { inApp } from './host.ts'

if (inApp) {
  resumeAfterUpdate()
  startUpdates()
}

const root = document.getElementById('root')
if (!root) throw new Error('#root is missing from index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
