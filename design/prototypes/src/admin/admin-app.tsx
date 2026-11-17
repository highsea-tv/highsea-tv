// SPDX-License-Identifier: AGPL-3.0-only
// The server admin (A1–A18). Since D3 of one-client-platform-d.md every screen is
// `@highsea-tv/admin`'s, drawn through ./shared.tsx over the mock transport: sign-in, first-run
// setup and the curation preview's frame stand alone; everything else sits in the admin's shell.
import { Route, Switch } from 'wouter'
import { SharedAdmin, SharedLogin, SharedPreviewFrame, SharedSetup } from './shared.tsx'

export function AdminApp() {
  return (
    <Switch>
      {/* sign-in and setup are the admin's own screens, signed out (D3) */}
      <Route path="/login">
        <SharedLogin />
      </Route>
      <Route path="/setup">
        <SharedSetup />
      </Route>
      {/* the curation preview's frame, outside the shell (the server's /curation-frame) */}
      <Route path="/curation-frame">
        <SharedPreviewFrame />
      </Route>
      <Route>
        <SharedAdmin />
      </Route>
    </Switch>
  )
}
