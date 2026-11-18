// SPDX-License-Identifier: AGPL-3.0-only
// AVPlayer's side of a start, for `start-times.ts`: plays an HLS address with AVFoundation's own
// player, as expo-video does on the phone and the TV (its VideoPlayer wraps an AVPlayer), and
// prints when the item was ready and when the first frame at the right place was out.
// `swift scripts/sweeps/avplayer.swift <url> <start seconds> <seek|playlist>`:
// - `seek`: what the app did until phase 5's A1 fix: load the item, then seek to the start once
//   it's ready to play, with no tolerance (expo-video's `currentTime` setter).
// - `playlist`: what it does now: the playlist says where to start (EXT-X-START), and the app
//   seeks only when the item isn't there already.
import AVFoundation
import Foundation

let args = CommandLine.arguments
guard args.count >= 4, let url = URL(string: args[1]), let start = Double(args[2]) else {
  FileHandle.standardError.write("usage: avplayer.swift <url> <start> <seek|playlist>\n".data(using: .utf8)!)
  exit(2)
}
let mode = args[3]
let began = Date()
let ms = { Int(Date().timeIntervalSince(began) * 1000) }

let item = AVPlayerItem(url: url)
let output = AVPlayerItemVideoOutput(pixelBufferAttributes: nil)
item.add(output)
let player = AVPlayer(playerItem: item)
player.isMuted = true

var readyMs: Int? = nil
var atReady = 0.0
var seeked = false
let status = item.observe(\.status, options: [.new]) { item, _ in
  if item.status == .failed {
    print("{\"error\": \"\(item.error?.localizedDescription ?? "failed")\"}")
    exit(1)
  }
  guard item.status == .readyToPlay, readyMs == nil else { return }
  readyMs = ms()
  atReady = item.currentTime().seconds
  let there = abs(atReady - start) < 1
  if start > 0 && (mode == "seek" || !there) {
    seeked = true
    player.seek(to: CMTime(seconds: start, preferredTimescale: 10_000_000), toleranceBefore: .zero, toleranceAfter: .zero)
  }
}
player.play()

Timer.scheduledTimer(withTimeInterval: 0.01, repeats: true) { _ in
  let t = item.currentTime()
  if player.timeControlStatus == .playing, t.seconds >= start - 1, t.seconds > start + 0.05 || start == 0,
    output.hasNewPixelBuffer(forItemTime: t)
  {
    print("{\"readyMs\": \(readyMs ?? -1), \"atReady\": \(atReady), \"seeked\": \(seeked), \"firstFrameMs\": \(ms()), \"at\": \(t.seconds)}")
    exit(0)
  }
  if ms() > 180_000 {
    print("{\"error\": \"no frame in 180 s\", \"readyMs\": \(readyMs ?? -1), \"at\": \(t.seconds)}")
    exit(1)
  }
}
RunLoop.main.run()
_ = status
