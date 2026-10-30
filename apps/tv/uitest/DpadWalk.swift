// SPDX-License-Identifier: AGPL-3.0-only
// The D-pad walk on tvOS (docs/plans/phase-4-checkpoint-5.md › The TV app): on each screen, from
// its first focus, every focus stop must be reachable with the remote's arrows, as dpad.ts checks
// the prototype. The remote is XCUIRemote, driving tvOS's own focus engine
// (https://developer.apple.com/documentation/xctest/xcuiremote). Stops are told apart by the test
// ids ui-native's Focusable gives them (`tv:` and the row's scope, then the label).
//
// tvOS can't put focus on a given stop, so the walk is breadth first by paths: after each move it
// presses the opposite arrow, which nearly always comes back, and otherwise relaunches the app and
// replays the path from launch. Run by scripts/sweeps/tv.ts against the installed app; its
// screenshots, for the side by side with the prototype, by tv-compare.ts.
import XCTest

final class DpadWalk: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "tv.highsea.tv")
  let remote = XCUIRemote.shared

  /** A screen, and the keys that reach it from launch, where focus starts on Home's Play. */
  struct Screen {
    let name: String
    let entry: [XCUIRemote.Button]
  }

  /** WALK_SCREENS (comma-separated names) picks some; all by default. */
  static let screens: [Screen] = [
    Screen(name: "home", entry: []),
    Screen(name: "details", entry: [.right, .select]),
    Screen(name: "search", entry: [.up, .right, .select]),
    Screen(name: "library", entry: [.up, .right, .right, .select]),
    Screen(name: "settings", entry: [.up, .right, .right, .right, .select]),
    // paused, so the chrome and Audio and subtitles stay up while the walk takes its time
    Screen(name: "player", entry: [.select, .playPause]),
  ]

  override func setUp() {
    continueAfterFailure = true
  }

  func testEveryStopIsReachable() {
    let picked = ProcessInfo.processInfo.environment["WALK_SCREENS"]?
      .split(separator: ",").map(String.init)
    for screen in Self.screens where picked == nil || picked!.contains(screen.name) {
      walk(screen)
    }
  }

  /**
   * Not the walk: each screen as its entry leaves it, saved as `<name>.png` in SHOTS (a folder on
   * the Mac, which the simulator's processes can write to) for scripts/sweeps/tv-compare.ts.
   */
  func testScreenshots() throws {
    guard let dir = ProcessInfo.processInfo.environment["SHOTS"] else {
      throw XCTSkip("SHOTS names no folder")
    }
    for screen in Self.screens {
      start(screen)
      // past the focus lift and the hero's cross-fade
      Thread.sleep(forTimeInterval: 1.5)
      let png = XCUIScreen.main.screenshot().pngRepresentation
      try png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(screen.name).png"))
    }
  }

  private func settle() {
    // the springs and the hero's dwell, which XCTest's idle wait doesn't see
    Thread.sleep(forTimeInterval: 0.4)
  }

  private func press(_ key: XCUIRemote.Button) {
    remote.press(key)
    settle()
  }

  private func focused() -> String? {
    let e = app.descendants(matching: .any)
      .matching(NSPredicate(format: "hasFocus == true")).firstMatch
    guard e.exists else { return nil }
    return e.identifier.isEmpty ? e.label : e.identifier
  }

  private func stops() -> Set<String> {
    let all = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier BEGINSWITH 'tv:' AND enabled == true"))
    return Set(all.allElementsBoundByIndex.map(\.identifier))
  }

  private func start(_ screen: Screen) {
    app.terminate()
    app.launch()
    // launch lands on Home's Play once Home has loaded
    _ = app.descendants(matching: .any)
      .matching(NSPredicate(format: "hasFocus == true")).firstMatch
      .waitForExistence(timeout: 20)
    settle()
    for key in screen.entry {
      press(key)
      if key == .select { Thread.sleep(forTimeInterval: 2.5) }
    }
  }

  private func opposite(_ key: XCUIRemote.Button) -> XCUIRemote.Button {
    switch key {
    case .up: return .down
    case .down: return .up
    case .left: return .right
    default: return .left
    }
  }

  private func walk(_ screen: Screen) {
    start(screen)
    guard let first = focused() else {
      XCTFail("\(screen.name): nothing focused at first")
      return
    }
    let expected = stops()
    var paths: [String: [XCUIRemote.Button]] = [first: []]
    var queue = [first]
    var at: String? = first
    while !queue.isEmpty {
      let node = queue.removeFirst()
      for key in [XCUIRemote.Button.up, .down, .left, .right] {
        if at != node {
          start(screen)
          for k in paths[node]! { press(k) }
          at = focused()
          if at != node {
            print("WALK \(screen.name): couldn't return to \(node)")
            break
          }
        }
        press(key)
        at = focused()
        guard let reached = at, reached != node else { continue }
        if paths[reached] == nil {
          paths[reached] = paths[node]! + [key]
          queue.append(reached)
        }
        press(opposite(key))
        at = focused()
      }
    }
    let missing = expected.subtracting(paths.keys).sorted()
    // stops beyond the first view (Settings' other panels, the player's controls) count as more
    let beyond = Set(paths.keys).subtracting(expected).count
    print(
      "WALK \(screen.name): \(expected.count - missing.count) reached of \(expected.count)"
        + (beyond > 0 ? ", and \(beyond) more beyond them" : ""))
    for m in missing { print("WALK \(screen.name): unreachable \(m)") }
    XCTAssert(missing.isEmpty, "\(screen.name): \(missing.count) unreachable: \(missing)")
  }
}
