## 1. Move AVAssetWriter append off the SCStream output queue

- [ ] 1.1 Add a `private let videoWriterQueue = DispatchQueue(label: "ai.open-ramble.video-writer")` field to `ScreenCapture` in `apps/macos-helper/Sources/OpenRamble/ScreenCapture.swift`
- [ ] 1.2 In `stream(_:didOutputSampleBuffer:of:)`, wrap the `assetWriterAdaptor?.append(imageBuffer, withPresentationTime: timestamp)` call (and the surrounding `isReadyForMoreMediaData` check) in `videoWriterQueue.async { ... }` so the SCStream output queue is never blocked
- [ ] 1.3 Verify the in-memory `frameBuffer.append` (the `addFrame(captured)` call) remains synchronous on the screen queue, so `FrameExtractor.findNearestFrame` still sees a coherent buffer

## 2. Wire screen-capture errors to the user-visible banner

- [ ] 2.1 In `CaptureEngine.startCapture()` after the `try await screenCapture.startCapture(...)` line, add `screenCapture.onError = { [weak self] error in self?.onError?(error) }` to mirror the existing `audioCapture?.onError` wiring at lines 131-133
- [ ] 2.2 Confirm the existing audio-capture error path is unchanged

## 3. Release AVAudioFile in AudioCapture.stopRecording

- [ ] 3.1 In `AudioCapture.stopRecording()` (`apps/macos-helper/Sources/OpenRamble/AudioCapture.swift`), after the recognition task finishes and before the function returns, set `self.audioFile = nil`
- [ ] 3.2 Defensively add `try? audioFile?.close()` immediately before the `= nil` assignment so the file handle is closed even if the `= nil` path changes in the future
- [ ] 3.3 Verify the transcript and segments files are still written (they are independent of the m4a finalize)

## 4. Add NSScreenCaptureUsageDescription to the source Info.plist

- [ ] 4.1 Open `apps/macos-helper/Sources/OpenRamble/Info.plist` and add `<key>NSScreenCaptureUsageDescription</key><string>Open-Ramble records your screen while the capture hotkey is held so it can compile a prompt for your coding agent.</string>` matching the string already present in the installed `/Applications/Open-Ramble.app/Contents/Info.plist`
- [ ] 4.2 Run `apps/macos-helper/install.sh` to confirm the sync_privacy_keys helper preserves the key in the installed app

## 5. Add Swift unit tests for the wired behaviors

- [ ] 5.1 In `apps/macos-helper/Tests/OpenRambleTests/ScreenCaptureTests.swift`, add `testOnErrorPropagatesFromStreamDelegate` that invokes the SCStream delegate's `didStopWithError` path (via the existing seam or a new wrapper) and asserts the registered `onError` closure fires
- [ ] 5.2 In `apps/macos-helper/Tests/OpenRambleTests/CaptureEngineTests.swift`, add `testScreenCaptureErrorWiredToEngineOnError` that uses a mock `ScreenCapture` to verify the engine's `onError` fires when the mock fires
- [ ] 5.3 In `apps/macos-helper/Tests/OpenRambleTests/AudioCaptureTests.swift`, add `testStopRecordingClosesAVAudioFile` that asserts `audioCapture.audioFile` is `nil` after `stopRecording()` returns

## 6. Build the SwiftUI smoke harness

- [ ] 6.1 Create `apps/macos-helper/Sources/OpenRamble/CaptureSmokeView.swift` gated with `#if DEBUG` so the type is absent from release builds
- [ ] 6.2 Implement the harness: a "Run smoke" button that calls `CaptureEngine.triggerToggle()`, waits 12 seconds, then `stopCapture()` is called via the engine
- [ ] 6.3 After capture, the harness runs `ffprobe` on the resulting `capture-original.mov` and `original.m4a` (via `Process` API), parses the frame count and the audio validity, and displays PASS/FAIL
- [ ] 6.4 Wire the harness into the status menu under a `#if DEBUG` conditional so it does not appear in release builds
- [ ] 6.5 Surface the per-second `runningFrameIndex` log from `ScreenCapture` in the harness view (gated by the same `#if DEBUG` block) so a regression is debuggable from inside the app

## 7. Verification

- [ ] 7.1 Build the dev variant via `apps/macos-helper/install.sh` (stable-signs with `Open-Ramble Dev` per `AGENTS.md`)
- [ ] 7.2 Run the new Swift unit tests: `swift test` from `apps/macos-helper/`
- [ ] 7.3 Open `/Applications/Open-Ramble Dev.app`, run the smoke harness, confirm PASS (frame count > 100, m4a valid)
- [ ] 7.4 Run a real 10-second end-user capture (option-B hotkey, move the cursor, speak), then `ffprobe ~/.open-ramble/runs/ramble_*/capture-original.mov` and confirm `nb_frames > 100` and `duration > 9s`
- [ ] 7.5 Run `ffprobe` on the audio file from the same run, confirm exit 0 and a non-zero duration
- [ ] 7.6 Inspect `apps/macos-helper/Tests/OpenRambleTests/` to confirm the three new tests are present and passing
- [ ] 7.7 Confirm `/Applications/Open-Ramble Dev.app/Contents/Info.plist` contains `NSScreenCaptureUsageDescription` after the install
- [ ] 7.8 Confirm a release build (without the `DEBUG` flag) does not contain `CaptureSmokeView` symbols: `nm /Applications/Open-Ramble.app/Contents/MacOS/Open-Ramble 2>/dev/null | grep -i smoke` returns nothing
