// SPDX-License-Identifier: AGPL-3.0-only
// The D-pad walk on tvOS (docs/plans/phase-4-checkpoint-5.md › The TV app): on each screen, from
// its first focus, every focus stop must be reachable with the remote's arrows, as dpad.ts checks
// the prototype. The remote is XCUIRemote, driving tvOS's own focus engine
// (https://developer.apple.com/documentation/xctest/xcuiremote). Stops are told apart by the test
// ids ui-native's Focusable gives them (`tv:` and the row's scope, then the label).
//
// tvOS can't put focus on a given stop, so the walk is breadth first by paths: after each move it
// presses the opposite arrow, which nearly always comes back, and otherwise relaunches the app and
// replays the path from launch, up to three times. It walks until every stop on the screen's first
// view is reached; on Settings and the player (`deep`) it goes on to the stops beyond, their other
// panels and controls. Each stop it reaches is printed as `WALK <screen>: n of m`, so a long walk
// shows how far it has got. Run by scripts/sweeps/tv.ts against the installed app (testEntries
// first, a minute's preflight); its screenshots, for the side by side with the prototype, by
// tv-compare.ts.
import XCTest

final class DpadWalk: XCTestCase {
  let app = XCUIApplication(bundleIdentifier: "tv.highsea.tv")
  let remote = XCUIRemote.shared

  /**
   * A screen, and the keys that reach it from launch. On the seeded server Home has no featured
   * card, so focus starts on Continue watching's first tile, with Staff picks under it.
   */
  struct Screen {
    let name: String
    let entry: [XCUIRemote.Button]
    var deep = false
  }

  /** WALK_SCREENS (comma-separated names) picks some; all by default. */
  static let screens: [Screen] = [
    Screen(name: "home", entry: []),
    Screen(name: "details", entry: [.down, .select]),
    // Up lands on Home in the head: Search left of it, then Collections, Movies, Alerts, Account
    Screen(name: "search", entry: [.up, .left, .select]),
    Screen(name: "collections", entry: [.up, .right, .select]),
    Screen(name: "movies", entry: [.up, .right, .right, .select]),
    Screen(name: "alerts", entry: [.up, .right, .right, .right, .select]),
    Screen(name: "settings", entry: [.up, .right, .right, .right, .right, .select], deep: true),
    // paused, so the chrome and Audio and subtitles stay up while the walk takes its time
    Screen(name: "player", entry: [.select, .playPause], deep: true),
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
   * The preflight tv.ts runs before the walk, in about a minute: every screen's entry must land
   * somewhere with focus and leave Home, so a broken entry fails now rather than an hour into the
   * walk. Prints `WALK <screen>: entry lands, n stops, at <stop>`.
   */
  func testEntries() {
    let picked = ProcessInfo.processInfo.environment["WALK_SCREENS"]?
      .split(separator: ",").map(String.init)
    for screen in Self.screens where picked == nil || picked!.contains(screen.name) {
      start(screen)
      let here = stops()
      guard let at = focused() else {
        print("WALK \(screen.name): entry left nothing focused")
        XCTFail("\(screen.name): entry left nothing focused")
        continue
      }
      if screen.name != "home" && here == home {
        print("WALK \(screen.name): its entry stayed on Home")
        XCTFail("\(screen.name): its entry stayed on Home")
        continue
      }
      print("WALK \(screen.name): entry lands, \(here.count) stops, at \(at)")
    }
  }

  /**
   * For finding why the walk couldn't return to a stop: enters SCREEN, then presses PATH (comma-
   * separated: up, down, left, right, select), printing where focus is after each press.
   */
  func testPath() throws {
    let env = ProcessInfo.processInfo.environment
    guard let name = env["SCREEN"], let screen = Self.screens.first(where: { $0.name == name })
    else { throw XCTSkip("SCREEN names no screen") }
    let keys: [String: XCUIRemote.Button] = [
      "up": .up, "down": .down, "left": .left, "right": .right, "select": .select,
    ]
    start(screen)
    print("WALK \(name): start at \(focused() ?? "nothing")")
    for k in (env["PATH_KEYS"] ?? "").split(separator: ",") {
      guard let key = keys[String(k)] else { continue }
      press(key)
      print("WALK \(name): \(k) → \(focused() ?? "nothing")")
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

  /** Home's stops as launch shows them, to tell an entry that never left Home. */
  private lazy var home: Set<String> = {
    start(Self.screens[0])
    return stops()
  }()

  private func walk(_ screen: Screen) {
    let home: Set<String> = screen.name == "home" ? [] : self.home
    start(screen)
    guard let first = focused() else {
      XCTFail("\(screen.name): nothing focused at first")
      return
    }
    let expected = stops()
    if expected == home {
      print("WALK \(screen.name): its entry stayed on Home")
      XCTFail("\(screen.name): its entry stayed on Home")
      return
    }
    var paths: [String: [XCUIRemote.Button]] = [first: []]
    var queue = [first]
    var at: String? = first
    while !queue.isEmpty {
      if !screen.deep && expected.isSubset(of: paths.keys) { break }
      let node = queue.removeFirst()
      for key in [XCUIRemote.Button.up, .down, .left, .right] {
        if at != node {
          // a replay now and then lands elsewhere when a press comes while the page is still
          // settling, so it's tried three times, waiting longer after launch each time
          for attempt in 0..<3 where at != node {
            start(screen)
            Thread.sleep(forTimeInterval: Double(attempt) * 1.5)
            for k in paths[node]! { press(k) }
            at = focused()
          }
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
          let found = expected.intersection(paths.keys).count
          print("WALK \(screen.name): \(found) of \(expected.count), at \(reached)")
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
