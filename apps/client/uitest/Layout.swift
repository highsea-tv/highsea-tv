// SPDX-License-Identifier: AGPL-3.0-only
// The layout check's capture on the iPhone and the Apple TV (scripts/sweeps/layout.ts, "The same
// screen everywhere" in docs/plans/one-client-platform.md): the installed mock-mode client is
// launched afresh (the mock keeps its sign-ins in memory on a device, so every launch opens on
// Choose a server), and each of part A's proof screens is reached as a person reaches it, by its
// labels: Choose a server, then Harbor's sign-in, then the shell after signing in, then Settings.
// The web capture in layout.ts takes the same steps against the same mock.
//
// For each screen it writes `<screen>.json`, the app's whole accessibility tree from one
// XCUIElement snapshot (https://developer.apple.com/documentation/xctest/xcuielementsnapshotproviding/snapshot()),
// every element's type, label, identifier, value and frame in points, and `<screen>.png`, the
// simulator's screen, into SHOTS (a folder on the Mac, which the simulator's processes can write
// to). Each capture prints `LAYOUT <screen>: n elements`, so the run shows how far it has got.
// SCREENS (comma-separated, in order) stops after the last one named: the preflight takes only
// `connect`. STEPS (JSON, from layout.ts) lists B1's destinations between the shell and Settings,
// each opened by the client's link (`highsea://movies/…`) once signed in, and captured once
// the names that only it has are on screen.
//
// On the iPhone it taps (XCUIElement.tap) and types (typeText) as Theo, who has no two-step
// verification in the mock. On the Apple TV it moves the remote's focus to each stop by pressing
// the arrow towards it (https://developer.apple.com/documentation/xctest/xcuiremote), and signs in
// by code, which the mock approves after 8 seconds (packages/mock's PAIRING_APPROVAL_MS).
import XCTest

/** A step that couldn't be taken: the test fails with it, never skips. */
struct LayoutFailure: Error, CustomStringConvertible {
  let description: String
}

final class Layout: XCTestCase {
  #if os(tvOS)
    let app = XCUIApplication(bundleIdentifier: "tv.highsea.tv")
  #else
    let app = XCUIApplication(bundleIdentifier: "tv.highsea.mobile")
  #endif

  private var dir = URL(fileURLWithPath: "/tmp")
  private let env = ProcessInfo.processInfo.environment

  override func setUp() {
    continueAfterFailure = false
  }

  func testCapture() throws {
    guard let shots = env["SHOTS"] else {
      XCTFail("SHOTS names no folder, so nothing would be written")
      throw LayoutFailure(description: "SHOTS names no folder")
    }
    dir = URL(fileURLWithPath: shots)
    let screens = (env["SCREENS"] ?? "connect,sign-in,shell,settings")
      .split(separator: ",").map(String.init)
    let last = screens.last ?? "settings"

    app.terminate()
    app.launch()

    // Choose a server: the mock's discovery answers over 2 seconds and stops looking at 3.2. Then
    // the phone's Looking… turns into Look again, and the TV's into the count of servers that
    // answered (its Look again is always there; apps/client's connect.tsx)
    let harbor = element(NSPredicate(format: "label BEGINSWITH 'Harbor'"))
    XCTAssert(harbor.waitForExistence(timeout: 30), "Choose a server never listed Harbor")
    #if os(tvOS)
      let done = element(NSPredicate(format: "label CONTAINS ' answered. '"))
    #else
      let done = element(NSPredicate(format: "label == 'Look again'"))
    #endif
    XCTAssert(done.waitForExistence(timeout: 30), "Choose a server never stopped looking")
    // the count's line loses its spinner in the same change: wait until it has been laid out
    try steady(done, "the count of servers")
    try capture("connect")
    if last == "connect" { return }

    // Harbor's sign-in
    #if os(tvOS)
      let signIn = element(NSPredicate(format: "label == 'Sign in with your phone'"))
    #else
      let signIn = app.secureTextFields.firstMatch
    #endif
    try open(harbor, until: signIn, "Harbor's sign-in")
    // the screen's entrance (motion.md's page transition, 250 ms) and the keyboard's, which a
    // snapshot can't wait on: XCUITest has no idle signal for React Native's animations
    Thread.sleep(forTimeInterval: 1.5)
    try capture("sign-in")
    if last == "sign-in" { return }

    // signed in: by code on the TV, which the mock approves by itself
    #if !os(tvOS)
      let user = app.textFields.firstMatch
      user.tap()
      user.typeText(env["USERNAME"] ?? "theo")
      let password = app.secureTextFields.firstMatch
      password.tap()
      password.typeText(env["PASSWORD"] ?? "theo theo theo")
      let button = app.buttons.matching(NSPredicate(format: "label == 'Sign in'")).firstMatch
      if button.isHittable { button.tap() } else { password.typeText("\n") }
      // iOS offers to save the password it saw typed (Password AutoFill): Not Now, so the shell
      // is captured as it is, not under the system's sheet
      try dismissSavePassword()
    #endif

    // the shell, on its first destination (Home); Settings is the phone's You tab, and the
    // account at the end of the TV's head
    #if os(tvOS)
      let settings = element(NSPredicate(format: "label ENDSWITH ', settings'"))
    #else
      let settings = element(NSPredicate(format: "label == 'You'"))
    #endif
    #if os(tvOS)
      // the TV's opening asks Who's watching? once it's signed in (B3's profiles, which the mock
      // serves): the profile last here has the focus, and Select picks it, as layout.ts does
      let lastHere = element(NSPredicate(format: "label CONTAINS ', Last here'"))
      if lastHere.waitForExistence(timeout: 40) {
        Thread.sleep(forTimeInterval: 0.5)
        XCUIRemote.shared.press(.select)
      }
    #endif
    // the owner's announcement that must be acknowledged comes over the shell once its list has
    // loaded, and on the TV hides it: Got it, as layout.ts does on the web
    let gotIt = app.buttons.matching(NSPredicate(format: "label == 'Got it'")).firstMatch
    let opened = Date().addingTimeInterval(40)
    while !settings.exists && !gotIt.exists && Date() < opened {
      Thread.sleep(forTimeInterval: 0.5)
    }
    #if os(tvOS)
      acknowledge("shell", wait: 8)
    #endif
    XCTAssert(settings.waitForExistence(timeout: 20), "The shell never opened after signing in")
    #if !os(tvOS)
      // the sheet can come up after the shell has opened, and again after a first Not Now; the
      // announcement is answered once it's gone, so the tap lands on Got it
      try dismissSavePassword()
      acknowledge("shell", wait: 8)
    #endif
    // Home's shelves load after the shell shows; no element says they're done
    Thread.sleep(forTimeInterval: 2)
    try capture("shell")
    if last == "shell" { return }

    // B1's destinations, each opened by the client's link (XCUIApplication.open, iOS and tvOS
    // 16.4: https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/open(_:)),
    // as layout.ts's STEPS has them: the screen, its link, and the names it must show first
    var scheme: String?
    for step in try steps() {
      guard let url = URL(string: step.url) else {
        throw LayoutFailure(description: "\(step.url) isn't a link")
      }
      app.open(url)
      try arrive(step)
      // the page's entrance and its images, which no element says are done
      Thread.sleep(forTimeInterval: 2)
      if let settle = step.settle, settle > 0 { Thread.sleep(forTimeInterval: settle / 1000) }
      still()
      try capture(step.screen)
      scheme = url.scheme
    }
    if last != "settings" { return }
    let title = element(
      NSPredicate(
        format: "label == 'Settings' AND elementType == %d",
        XCUIElement.ElementType.staticText.rawValue))
    if let scheme, let link = URL(string: "\(scheme):///settings") {
      // after the steps, by the client's own link: the player and Connect a device draw over the
      // shell, so You can't be tapped, and a link opened over the player closes it (B2's answer 1)
      app.open(link)
      XCTAssert(title.waitForExistence(timeout: 20), "Settings never opened from its link")
    } else {
      try open(settings, until: title, "Settings")
    }
    // the page transition, as for the sign-in
    Thread.sleep(forTimeInterval: 2)
    try capture("settings")
  }

  #if !os(tvOS)
    /**
     * iOS offers to save a password it saw typed (Password AutoFill, an AuthenticationServices
     * sheet inside the app's own tree, "Save Password?"). There's no documented switch for it on a
     * simulator from a test, so it's answered: Not Now, pressed until the sheet has gone and has
     * stayed gone for two seconds, up to twenty. Each answer leaves a note.
     */
    private func dismissSavePassword() throws {
      let sheet = app.sheets.matching(NSPredicate(format: "label == 'Save Password?'")).firstMatch
      let notNow = sheet.buttons.matching(NSPredicate(format: "label == 'Not Now'")).firstMatch
      let until = Date().addingTimeInterval(20)
      var goneSince: Date?
      var answered = 0
      // the sheet may take a few seconds to come up after the press that sent the password
      _ = sheet.waitForExistence(timeout: 6)
      while Date() < until {
        if sheet.exists {
          goneSince = nil
          if notNow.isHittable {
            notNow.tap()
            answered += 1
            print("LAYOUT note: iOS offered to save the password; answered Not Now (\(answered))")
          }
          Thread.sleep(forTimeInterval: 0.5)
          continue
        }
        let since = goneSince ?? Date()
        goneSince = since
        if Date().timeIntervalSince(since) >= 2 { return }
        Thread.sleep(forTimeInterval: 0.25)
      }
      XCTFail("iOS's Save Password sheet stayed up")
      throw LayoutFailure(description: "iOS's Save Password sheet stayed up")
    }
  #endif

  /**
   * Presses Got it on the owner's announcement that must be acknowledged (apps/client's
   * shell/announcements.tsx) when it's up, waiting `wait` seconds for it: a tap on the phone,
   * Select on the TV, where it's a screen of its own that holds focus on Got it.
   */
  private func acknowledge(_ screen: String, wait: TimeInterval) {
    let gotIt = app.buttons.matching(NSPredicate(format: "label == 'Got it'")).firstMatch
    guard gotIt.waitForExistence(timeout: wait) || gotIt.exists else { return }
    #if os(tvOS)
      focus(gotIt)
      XCUIRemote.shared.press(.select)
    #else
      gotIt.tap()
    #endif
    print("LAYOUT note: \(screen): acknowledged the owner's announcement")
    let until = Date().addingTimeInterval(8)
    while gotIt.exists && Date() < until { Thread.sleep(forTimeInterval: 0.25) }
  }

  /** One of layout.ts's B1 steps: the screen, the client's link to it, and its anchors. */
  struct Step: Decodable {
    let screen: String
    let url: String
    /** Regular expressions over a label as layout.ts's normalizeName leaves it. */
    let anchors: [String]
    /** Milliseconds more after the anchors, for what no anchor says (layout.ts's settleFor). */
    let settle: Double?
  }

  /** STEPS, a JSON array of layout.ts's steps for this device, in order; none without it. */
  private func steps() throws -> [Step] {
    guard let json = env["STEPS"], !json.isEmpty else { return [] }
    return try JSONDecoder().decode([Step].self, from: Data(json.utf8))
  }

  /** A label as layout.ts's normalizeName has it: case, quotes, punctuation and spacing out. */
  private func normalize(_ s: String) -> String {
    let folded = s.precomposedStringWithCompatibilityMapping.lowercased()
      .replacingOccurrences(of: "[’'\"“”‘]", with: "", options: .regularExpression)
      .replacingOccurrences(of: "[^\\p{L}\\p{N}]+", with: " ", options: .regularExpression)
    return folded.trimmingCharacters(in: .whitespaces)
  }

  /** Waits until every anchor of the step names an element on screen, up to thirty seconds. */
  private func arrive(_ step: Step) throws {
    let patterns = try step.anchors.map { try NSRegularExpression(pattern: $0) }
    let until = Date().addingTimeInterval(30)
    while Date() < until {
      // an announcement that comes late, and on the TV hides the page under it
      acknowledge(step.screen, wait: 0)
      var labels: [String] = []
      func walk(_ s: XCUIElementSnapshot) {
        if !s.label.isEmpty { labels.append(normalize(s.label)) }
        for c in s.children { walk(c) }
      }
      if let root = try? app.snapshot() { walk(root) }
      let found = patterns.allSatisfy { p in
        labels.contains { l in
          p.firstMatch(in: l, range: NSRange(l.startIndex..., in: l)) != nil
        }
      }
      if found { return }
      Thread.sleep(forTimeInterval: 0.5)
    }
    // captured anyway: layout.ts's assess says which anchor is missing, with the picture
    print("LAYOUT note: \(step.screen) never showed all of its anchors in thirty seconds")
  }

  /** Waits until `e`'s frame has stayed the same for a second, up to ten. */
  private func steady(_ e: XCUIElement, _ what: String) throws {
    var last = e.frame
    var since = Date()
    let until = Date().addingTimeInterval(10)
    while Date() < until {
      Thread.sleep(forTimeInterval: 0.25)
      let now = e.frame
      if now != last {
        last = now
        since = Date()
      } else if Date().timeIntervalSince(since) >= 1 {
        return
      }
    }
    XCTFail("\(what) kept moving")
    throw LayoutFailure(description: "\(what) kept moving")
  }

  private func element(_ predicate: NSPredicate) -> XCUIElement {
    app.descendants(matching: .any).matching(predicate).firstMatch
  }

  /**
   * Presses a stop until `next` shows: a tap on the phone, the remote's focus moved onto it and
   * Select on the TV. Pressed up to three times, since the phone's first tap after signing in is
   * sometimes not taken (layout.ts's report says when it took more than one). Once the stop has
   * gone the press was taken, so it isn't pressed again: on the TV a second Select would land on
   * whatever the next screen focuses.
   */
  private func open(_ e: XCUIElement, until next: XCUIElement, _ what: String) throws {
    for attempt in 1...3 {
      if attempt > 1 && !e.exists {
        if next.waitForExistence(timeout: 8) {
          print("LAYOUT note: \(what) opened late, after press \(attempt - 1)")
          return
        }
        break
      }
      #if os(tvOS)
        focus(e)
        XCUIRemote.shared.press(.select)
      #else
        e.tap()
      #endif
      if next.waitForExistence(timeout: 8) {
        if attempt > 1 { print("LAYOUT note: \(what) opened on press \(attempt)") }
        return
      }
    }
    XCTFail("\(what) never opened")
    throw LayoutFailure(description: "\(what) never opened")
  }

  #if os(tvOS)
    /**
     * Moves focus onto `target`, pressing the arrow towards it from wherever focus is: across when
     * the two overlap vertically, otherwise up or down. tvOS's focus engine picks the next stop in
     * that direction, so twenty presses reach anything on one screen.
     */
    private func focus(_ target: XCUIElement) {
      let remote = XCUIRemote.shared
      for _ in 0..<20 {
        if target.hasFocus { return }
        let at = element(NSPredicate(format: "hasFocus == true"))
        guard at.exists else {
          remote.press(.down)
          Thread.sleep(forTimeInterval: 0.5)
          continue
        }
        let a = at.frame
        let b = target.frame
        let across = a.minY < b.maxY && b.minY < a.maxY
        if across {
          remote.press(b.midX > a.midX ? .right : .left)
        } else {
          remote.press(b.midY > a.midY ? .down : .up)
        }
        Thread.sleep(forTimeInterval: 0.5)
      }
      XCTAssert(target.hasFocus, "Couldn't move focus onto \(target.label)")
    }
  #endif

  /**
   * Waits until the screen stops moving: two snapshots a third of a second apart with every frame
   * the same, for at most eight seconds. A focus lift's spring or a long list still laying out
   * moves frames that no element says are done (XCUITest has no idle signal for React Native's
   * animations).
   */
  private func still() {
    func frames() -> [CGRect] {
      var out: [CGRect] = []
      func walk(_ s: XCUIElementSnapshot) {
        out.append(s.frame)
        for c in s.children { walk(c) }
      }
      if let root = try? app.snapshot() { walk(root) }
      return out
    }
    let until = Date().addingTimeInterval(8)
    var was = frames()
    while Date() < until {
      Thread.sleep(forTimeInterval: 0.33)
      let now = frames()
      if now == was { return }
      was = now
    }
  }

  /** The screen's tree and its picture, as `<name>.json` and `<name>.png`. */
  private func capture(_ name: String) throws {
    let root = try app.snapshot()
    var nodes: [[String: Any]] = []
    func walk(_ s: XCUIElementSnapshot, _ parent: Int) {
      let f = s.frame
      var node: [String: Any] = [
        "type": typeName(s.elementType),
        "label": s.label,
        "identifier": s.identifier,
        "value": (s.value as? String) ?? "",
        "placeholder": s.placeholderValue ?? "",
        "x": Double(f.origin.x),
        "y": Double(f.origin.y),
        "w": Double(f.size.width),
        "h": Double(f.size.height),
        "parent": parent,
        "enabled": s.isEnabled,
        "selected": s.isSelected,
      ]
      #if os(tvOS)
        node["focused"] = s.hasFocus
      #endif
      nodes.append(node)
      let me = nodes.count - 1
      for c in s.children { walk(c, me) }
    }
    walk(root, -1)
    let screen = XCUIScreen.main
    let out: [String: Any] = [
      "screen": name,
      "window": ["w": Double(root.frame.size.width), "h": Double(root.frame.size.height)],
      "nodes": nodes,
    ]
    let json = try JSONSerialization.data(withJSONObject: out, options: [.prettyPrinted])
    try json.write(to: dir.appendingPathComponent("\(name).json"))
    try screen.screenshot().pngRepresentation.write(to: dir.appendingPathComponent("\(name).png"))
    print("LAYOUT \(name): \(nodes.count) elements")
  }

  private func typeName(_ t: XCUIElement.ElementType) -> String {
    switch t {
    case .application: return "application"
    case .window: return "window"
    case .other: return "other"
    case .group: return "group"
    case .button: return "button"
    case .link: return "link"
    case .staticText: return "staticText"
    case .textField: return "textField"
    case .secureTextField: return "secureTextField"
    case .searchField: return "searchField"
    case .textView: return "textView"
    case .switch: return "switch"
    case .toggle: return "toggle"
    case .image: return "image"
    case .icon: return "icon"
    case .cell: return "cell"
    case .table: return "table"
    case .collectionView: return "collectionView"
    case .scrollView: return "scrollView"
    case .tabBar: return "tabBar"
    case .tab: return "tab"
    case .tabGroup: return "tabGroup"
    case .menuBar: return "menuBar"
    case .menuItem: return "menuItem"
    case .radioButton: return "radioButton"
    case .radioGroup: return "radioGroup"
    case .segmentedControl: return "segmentedControl"
    case .slider: return "slider"
    case .activityIndicator: return "activityIndicator"
    case .progressIndicator: return "progressIndicator"
    case .keyboard: return "keyboard"
    case .key: return "key"
    case .navigationBar: return "navigationBar"
    case .toolbar: return "toolbar"
    case .statusBar: return "statusBar"
    case .alert: return "alert"
    case .sheet: return "sheet"
    case .picker: return "picker"
    case .checkBox: return "checkBox"
    default: return "type\(t.rawValue)"
    }
  }
}
