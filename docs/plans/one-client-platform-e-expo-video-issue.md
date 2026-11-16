# The expo-video issue for expo/expo: a draft

A draft, not filed. E3 patched expo-video for the TV player (`patches/expo-video@58.0.11.patch`; [ADR 0059's section of 2026-11-15](../adr/0059-native-apps.md); E3's entry in [one-client-platform-e.md](one-client-platform-e.md)) and said an issue was to be filed upstream. HT-19 drafted it on 2026-11-15, following expo/expo's SDK bug report form (`.github/ISSUE_TEMPLATE/0-bug_report.yml`, read on 2026-11-15). The owner decides whether to post it, and posts it.

## Before posting

- **The form wants a link to a minimal repository** ("Issues without a minimal reproducible example will be closed without discussion"). The repro below is written out as files, not yet a repository, and it hasn't been built on its own: what it shows was seen in highsea's client (E3's `tv.ts` walk), not in this app. Make it a public repository, build it for the Apple TV simulator, check it shows the bug, then paste its link.
- **Environment and Expo Doctor** are to be run in that repository (`npx expo-env-info`, `npx expo-doctor@latest`) and pasted; the versions highsea saw it on are below.
- **Search again** for a newer report first.

## What's already on expo/expo

Searched on 2026-11-15 with `gh search issues` and `gh search prs` in expo/expo (terms: VideoView tvOS focus, expo-video tvOS, AVPlayerViewController, isTVSelectable VideoView, expo-video focusable, view controller containment, and others). No open report of this.

- [#40264](https://github.com/expo/expo/issues/40264), *VideoView doesn't respect focusable, isTVSelectable* (SDK 54, react-native-tvos 0.81): the same symptom, with a repro (a Pressable and a VideoView; Up and Down move focus onto the VideoView). One "same here", no answer from the team; closed by the stale bot on 2026-01-13, which asks for a new issue. Not fixed: expo-video 58.0.11 still embeds the view the same way.
- [#48345](https://github.com/expo/expo/issues/48345), *[iOS 27 beta] Native controls absent when AVPlayerViewController is embedded without containment*: names the same missing `addChild` / `didMove(toParent:)` on iOS; closed by the bot for want of a public repro. [#50486](https://github.com/expo/expo/pull/50486) (merged 2026-10-08, in 58.0.11) then fixed iOS 27's controls by ending the appearance transition, and says "Not covered: tvOS (the code is behind `#if !os(tvOS)`)".
- [#37367](https://github.com/expo/expo/issues/37367) is Android TV's focus highlight, unrelated.

## The issue

**Title:** [expo-video][tvOS] VideoView with `nativeControls={false}` takes focus from the app's controls (its AVPlayerViewController is embedded without containment)

### Minimal reproducible example

*(the repository's link)*

A blank app (`npx create-expo-app@latest --template blank-typescript`) made for the TV as Expo's guide has it ([Building Expo apps for TV](https://docs.expo.dev/guides/building-for-tv/)): `react-native` as `npm:react-native-tvos@0.88.0-0`, `@react-native-tvos/config-tv` in `app.json`'s plugins, `EXPO_TV=1` for the prebuild, and `expo-video`. `App.tsx`:

```tsx
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useVideoPlayer, VideoView } from 'expo-video'

const SOURCE =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'

function Button({ label, preferred }: { label: string; preferred?: boolean }) {
  const [focused, setFocused] = useState(false)
  return (
    <Pressable
      hasTVPreferredFocus={preferred}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.button, focused && styles.focused]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  )
}

export default function App() {
  const player = useVideoPlayer(SOURCE, (p) => p.play())
  return (
    <View style={styles.screen}>
      {/* the picture only: the app draws its own controls over it */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <VideoView player={player} nativeControls={false} style={{ flex: 1 }} />
      </View>
      <View style={styles.controls}>
        <Button label="Back" preferred />
        <Button label="Play" />
        <Button label="Subtitles" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'black' },
  controls: { position: 'absolute', left: 80, right: 80, bottom: 80, flexDirection: 'row', gap: 40 },
  button: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, backgroundColor: '#333' },
  focused: { backgroundColor: '#fff' },
  label: { fontSize: 28, color: '#888' },
})
```

### Steps to reproduce

1. `npm install`, then `EXPO_TV=1 npx expo prebuild --clean` and `npx expo run:ios` on an Apple TV simulator (a development build; the same in a Release build). npm.
2. The film plays. Look for the focused button (white).
3. Press the remote's arrows (Left, Right, Up, Down).

**Expected:** focus starts on Back (`hasTVPreferredFocus`) and the arrows move it between Back, Play and Subtitles. With `nativeControls={false}` the player view shows only the picture, and the wrapper has `pointerEvents="none"`, so nothing in it should be focusable.

**Actual:** focus lands on the player's view instead, so no button shows as focused, and the arrows reach none of the buttons from there.

tvOS only (iOS and Android aren't affected: no focus engine there). Seen on the Apple TV 4K (3rd generation) simulator, tvOS 26.5, with Xcode 27.1, in a Release build without the dev client.

### Why

`VideoView.swift` (expo-video 58.0.11) adds `playerViewController.view` to its own view as a plain subview and never makes the controller a child of the view controller that holds it (`addChild(_:)`, `didMove(toParent:)`). UIKit asks for that containment whenever one view controller's view is embedded in another's ([Creating a custom container view controller](https://developer.apple.com/documentation/uikit/creating-a-custom-container-view-controller); [addChild(_:)](https://developer.apple.com/documentation/uikit/uiviewcontroller/addchild(_:))). On tvOS that leaves the controller outside the focus environments' tree: its view takes focus, and the app's own focus updates can't take it back, since UIKit honours `setNeedsFocusUpdate()` only from an environment that contains the focused item ([setNeedsFocusUpdate()](https://developer.apple.com/documentation/uikit/uifocusenvironment/setneedsfocusupdate())).

And with `nativeControls={false}` (`showsPlaybackControls = false`) the controller's view still takes user interaction, so the focus engine can still pick it: it passes by only views that can't take user interaction ([About focus interactions for Apple TV](https://developer.apple.com/documentation/uikit/about-focus-interactions-for-apple-tv)). `pointerEvents="none"` on a wrapper doesn't reach the controller's view.

Containment alone wasn't enough in our app: built with only that, focus still landed on the controller's view. With both, it lands on the app's first control and every control is reachable.

### Suggested fix

What we patch, on tvOS only (through Bun's `patchedDependencies`): the controller joins the view controller hierarchy while its view is on screen, leaves it before the fullscreen presentation (a child can't be presented) and when the view leaves the window, and comes back after; and without controls of its own its view takes no user interaction. The diff against expo-video 58.0.11's `ios/VideoView.swift` (our patch's comments shortened):

```diff
@@ -11,9 +11,20 @@ public final class VideoView: ExpoView, AVPlayerViewControllerDelegate {
 
   weak var player: VideoPlayer? {
     didSet {
+      #if os(tvOS)
+      let previousController = playerViewController
+      #endif
       if playerViewControllerWrapper.setPlayer(player) {
         removeFirstFrameObserver()
         addFirstFrameObserver()
+        #if os(tvOS)
+        // the wrapper made a new controller, so it becomes the child instead
+        if previousController.parent != nil {
+          previousController.willMove(toParent: nil)
+          previousController.removeFromParent()
+        }
+        attachPlayerViewController()
+        #endif
       }
     }
   }
@@ -76,6 +87,8 @@ public final class VideoView: ExpoView, AVPlayerViewControllerDelegate {
       // remove the view controller from its superview,
       // and present the view controller normally
       self.wasPlaying = self.player?.isPlaying == true
+      // a child view controller can't be presented, so it leaves its parent first
+      self.detachPlayerViewController()
       self.playerViewController.view.removeFromSuperview()
       self.reactViewController().present(self.playerViewController, animated: true)
       self.onFullscreenEnter()
@@ -116,6 +129,8 @@ public final class VideoView: ExpoView, AVPlayerViewControllerDelegate {
     // Reset the bounds of the view controller and add it back to our view
     self.playerViewControllerWrapper.layoutControllerView()
     self.playerViewControllerWrapper.view.addSubview(self.playerViewController.view)
+    // and back as a child once it's inline again
+    self.attachPlayerViewController()
     // End the appearance transition
     self.playerViewController.endAppearanceTransition()
     // Ensure playing state is preserved
@@ -171,9 +186,58 @@ public final class VideoView: ExpoView, AVPlayerViewControllerDelegate {
     #if !os(tvOS)
     playerViewController.beginAppearanceTransition(self.window != nil, animated: true)
     playerViewController.endAppearanceTransition()
+    #else
+    // on tvOS the player view controller joins the view controller hierarchy while its view is
+    // on screen, and leaves it when it isn't
+    if self.window != nil && !isFullscreen {
+      attachPlayerViewController()
+    } else if self.window == nil {
+      detachPlayerViewController()
+    }
     #endif
   }
 
+  #if os(tvOS)
+  // View controller containment: addChild(_:), the view in the hierarchy, then didMove(toParent:)
+  private func attachPlayerViewController() {
+    guard self.window != nil, let parent = self.reactViewController() else {
+      return
+    }
+    let controller = playerViewController
+    if controller.parent === parent {
+      return
+    }
+    if controller.parent != nil {
+      controller.willMove(toParent: nil)
+      controller.removeFromParent()
+    }
+    parent.addChild(controller)
+    controller.didMove(toParent: parent)
+    // with no controls of its own the view only shows the picture, so it takes no user
+    // interaction and the focus engine passes it by
+    controller.view.isUserInteractionEnabled = controller.showsPlaybackControls
+  }
+
+  private func detachPlayerViewController() {
+    let controller = playerViewController
+    guard controller.parent != nil else {
+      return
+    }
+    controller.willMove(toParent: nil)
+    controller.removeFromParent()
+  }
+  #endif
+
   public override func safeAreaInsetsDidChange() {
     super.safeAreaInsetsDidChange()
     playerViewControllerWrapper.refreshSafeAreaInsets()
```

`isUserInteractionEnabled` is set when the controller is attached, so a `nativeControls` change while it's attached isn't followed; a fix upstream would set it where `showsPlaybackControls` is set too. The same containment would likely help iOS (#48345), but we've only built and tested tvOS.

Related: #40264 (the same symptom, closed as stale), #48345, #50486.

### Environment

*(`npx expo-env-info` from the repro.)* Seen with: expo 58.0.11, expo-video 58.0.11, expo-router 58.0.20, react 19.3.0, react-native-tvos 0.88.0-0, @react-native-tvos/config-tv 0.1.7, Xcode 27.1 (27A9275), the Apple TV 4K (3rd generation) simulator on tvOS 26.5, Bun 1.4.4, Node 26.11.1, bare workflow (prebuild).

### Expo Doctor Diagnostics

*(`npx expo-doctor@latest` from the repro.)*
