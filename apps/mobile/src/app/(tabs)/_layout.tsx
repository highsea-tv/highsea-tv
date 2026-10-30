// SPDX-License-Identifier: AGPL-3.0-only
// The five tabs (mobile.md#home-tabs--carousel): Home, Search, Library, Offline and You. Each tab
// but Offline keeps its own stack, so a movie opened from Search comes back to Search; the screens
// they share (a movie, a collection) are in the array group beside them
// (https://docs.expo.dev/router/advanced/shared-routes/). The bar is the prototype's (shell.tsx).
import { Tabs } from 'expo-router'
import { AnnouncementDialog, TabBar } from '../../shell.tsx'

// The tabs open on Home: without it, the shared group's last copy, You, came up first
// (https://docs.expo.dev/router/advanced/router-settings/).
export const unstable_settings = { anchor: '(home)' }

export default function TabsLayout() {
  return (
    <>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      >
        <Tabs.Screen name="(home)" />
        <Tabs.Screen name="(search)" />
        <Tabs.Screen name="(library)" />
        <Tabs.Screen name="offline" />
        <Tabs.Screen name="(you)" />
      </Tabs>
      <AnnouncementDialog />
    </>
  )
}
