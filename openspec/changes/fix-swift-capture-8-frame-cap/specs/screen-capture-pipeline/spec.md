## ADDED Requirements

### Requirement: Continuous full-duration screen capture

The macOS helper SHALL produce a screen-capture video artifact (`capture-original.mov`) that spans the entire window between `stream.startCapture()` returning and `stream.stopCapture()` being invoked. The video SHALL contain at least one frame per second of the capture window at the configured frame rate, with no silent gaps.

#### Scenario: Ten-second capture produces roughly 300 frames
- **WHEN** the user holds the capture hotkey for ten seconds while the cursor is moving and the screen is changing
- **THEN** `~/.openvysta/runs/vysta_*/capture-original.mov` SHALL contain at least 280 frames (allowing 7% drift from the configured 30 fps)
- **AND** `ffprobe` SHALL report a duration of at least 9.3 seconds

#### Scenario: SCStream writer does not block the output queue
- **WHEN** the screen capture is running at 1080p30 with `expectsMediaDataInRealTime = true` and the consumer is healthy
- **THEN** `runningFrameIndex` SHALL increment continuously (no gap > 200 ms between consecutive frames in the in-memory `frameBuffer`)
- **AND** the in-memory `frameBuffer` SHALL grow to its `maxBufferSize` (1800) over a 60-second capture without pausing

#### Scenario: Capture ends cleanly on user hotkey release
- **WHEN** the user releases the capture hotkey
- **THEN** the final `.mov` SHALL be finalized via `AVAssetWriter.finishWriting` and SHALL be playable by `ffprobe` without errors

### Requirement: Surface screen-capture errors to the user

The macOS helper SHALL propagate any error reported by the SCStream subsystem to the same user-visible error banner that audio-capture errors use. No SCStream error SHALL be silently dropped.

#### Scenario: SCStream stop-with-error fires the error banner
- **WHEN** SCStream invokes `stream(_:didStopWithError:)` with a non-nil error
- **THEN** `CaptureEngine.onError` SHALL be invoked with that error
- **AND** the status-menu error banner SHALL display the error's `localizedDescription`

#### Scenario: Audio-capture error wiring remains intact
- **WHEN** AVAudioEngine or SFSpeechRecognizer reports an error
- **THEN** `CaptureEngine.onError` SHALL continue to be invoked as it does today
- **AND** the new screen-capture wiring SHALL NOT alter the audio path

### Requirement: Audio capture produces a valid m4a artifact

The macOS helper SHALL produce an `inputs/audio/original.m4a` file that is a valid, indexable MP4/M4A container readable by `ffprobe` without "moov atom not found" errors.

#### Scenario: Normal stop produces valid m4a
- **WHEN** the user stops capture after a typical session (1 to 60 seconds of speech)
- **THEN** `ffprobe inputs/audio/original.m4a` SHALL exit with status 0
- **AND** SHALL report a non-zero duration
- **AND** SHALL be openable by any standard MP4 reader (QuickTime, VLC, AVAsset)

#### Scenario: Empty capture still produces valid m4a
- **WHEN** the user stops capture within 200ms of starting (no audio recorded)
- **THEN** the m4a file SHALL still exist and SHALL have a valid moov atom
- **AND** the file MAY have zero samples, but SHALL be indexable

### Requirement: AVAudioFile is released on stop

The `AudioCapture` class SHALL release its internal `AVAudioFile` reference during `stopRecording()`, after all samples have been written and before the function returns. The reference SHALL be `nil` for the lifetime of the `AudioCapture` instance after `stopRecording()` returns.

#### Scenario: audioFile is nil after stopRecording
- **WHEN** `stopRecording()` returns successfully
- **THEN** `self.audioFile` SHALL be `nil`
- **AND** the underlying file handle SHALL be closed
- **AND** the moov atom SHALL have been written to disk

### Requirement: Source Info.plist includes NSScreenCaptureUsageDescription

The source `apps/macos-helper/Sources/OpenVysta/Info.plist` SHALL contain an `NSScreenCaptureUsageDescription` key with a non-empty string value that explains why the app needs screen recording permission. After a clean install via `install.sh`, the installed `/Applications/OpenVysta.app/Contents/Info.plist` SHALL also contain that key.

#### Scenario: Fresh install preserves the usage description
- **WHEN** a developer runs `apps/macos-helper/install.sh` on a clean machine
- **THEN** the resulting `/Applications/OpenVysta.app/Contents/Info.plist` SHALL contain `NSScreenCaptureUsageDescription`
- **AND** `tccutil reset ScreenCapture` followed by a first launch SHALL show a system Screen Recording permission prompt (not silently fail)

### Requirement: Dev-only capture smoke harness

A SwiftUI view named `CaptureSmokeView` SHALL exist under `apps/macos-helper/Sources/OpenVysta/`, gated behind a `#if DEBUG` (or equivalent build-flag) conditional so it is not compiled into release builds. When invoked, the harness SHALL run a 10-second capture against the current screen and report pass/fail based on the .mov frame count and the m4a validity.

#### Scenario: Smoke harness passes after the fix
- **WHEN** a developer opens the dev build, invokes the smoke harness, and waits 12 seconds
- **THEN** the harness SHALL display "PASS" (or equivalent green status)
- **AND** SHALL show a frame count > 100 and an `ffprobe` exit code of 0

#### Scenario: Smoke harness fails if the 8-frame regression returns
- **WHEN** a future change reintroduces a synchronous writer append on the SCStream output queue
- **AND** a developer runs the smoke harness
- **THEN** the harness SHALL display "FAIL" with a clear message naming the frame count
- **AND** the developer SHALL be able to identify the regression without reading capture subsystem source

#### Scenario: Smoke harness is absent from release builds
- **WHEN** a release build of OpenVysta is installed
- **THEN** no menu item, button, or gesture SHALL expose the smoke harness to the user
- **AND** the `CaptureSmokeView` type SHALL NOT be present in the compiled binary
