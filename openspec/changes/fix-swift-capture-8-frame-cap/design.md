## Context

The macOS helper (`apps/macos-helper/`) is the system-trusted screen/audio/cursor recorder. It uses three independent subsystems on three different concurrency domains:

| Subsystem | Source of truth | Concurrency | Artifact |
|---|---|---|---|
| `ScreenCapture` (SCStream + AVAssetWriter) | `Date().timeIntervalSince(startDate)` | `DispatchQueue("ai.open-ramble.screen")` for sample delivery, `DispatchQueue("ai.open-ramble.buffer")` for buffer mutation | `capture-original.mov` |
| `AudioCapture` (AVAudioEngine + SFSpeechRecognizer) | Same `Date().timeIntervalSince(startDate)` | AVAudioEngine render thread, SFSpeechRecognizer delegate | `inputs/audio/original.m4a`, `transcript.md`, `transcript-segments.json` |
| `CursorTracker` (NSEvent global/local monitors) | Same `Date().timeIntervalSince(startDate)` | AppKit event monitor callback | `cursor-timeline.json` |

All three share the same `captureStartDate` so timestamps are comparable across artifacts. The `FrameExtractor` reads the screen buffer and the cursor pauses/clicks and selects up to 16 `SelectedFrame`s, which the compiler later turns into the visual evidence section of the prompt.

**Current state (broken):** `ScreenCapture.stream(_:didOutputSampleBuffer:of:)` calls `assetWriterAdaptor?.append(imageBuffer, withPresentationTime:)` synchronously on the `ai.open-ramble.screen` queue. For 1080p h264 with `expectsMediaDataInRealTime = true`, the adaptor's internal `CVPixelBufferPool` is drained by the writer and refills slowly. When the pool is empty, `append` blocks. That block happens on the same queue SCStream uses to deliver samples, so the consumer appears stuck, SCStream's `queueDepth=8` ring fills, and SCStream pauses delivery. After ~250ms (8 frames at 30fps) no more frames arrive. The cursor and audio subsystems are unaffected because they have their own queues and threads.

A secondary bug: `stream(_:didStopWithError:)` is implemented and calls `onError?(error)`, but `screenCapture.onError` is never set in `CaptureEngine.startCapture()`. So if SCStream ever does fail with a real error (TCC revocation, display detach), it is silently dropped. The mirror `audioCapture?.onError` wiring does exist at `CaptureEngine.swift:131-133`.

A tertiary bug: `AudioCapture.stopRecording()` stops the engine, removes the tap, ends the recognition request, and writes the transcript and segments files — but never releases `self.audioFile` (the `AVAudioFile` opened in `startRecording()`). Because the file is only held by `self`, and `self` is only held by `CaptureEngine` until `rollbackFailedCaptureStart`, the moov atom is never written in the normal stop path. The result is an m4a with valid sample data but no index, which `ffprobe` rejects with "moov atom not found". This is timing-dependent, which is why some runs are affected and some are not.

## Goals / Non-Goals

**Goals:**

- Eliminate the 8-frame cap on the screen capture video so it spans the full hotkey-held duration.
- Surface any future SCStream failure through the existing error banner, the same way audio capture errors are surfaced.
- Make the m4a artifact always a valid, indexable file so the audio pipeline (STT, redactor, downstream agents) can rely on it.
- Provide a dev-only one-click smoke harness so the bug cannot regress silently: a 10-second capture must produce a `.mov` with > 100 frames and a valid m4a.
- Keep the existing capture hotkey UX unchanged for production users.

**Non-Goals:**

- Adding a time-anchored deictic resolution primitive in the TS compiler. That is a follow-up change, scoped separately, that depends on this change landing first.
- Adding a BLOCK/CLARIFY gate for unresolvable deictic references. Same — follow-up change.
- Redesigning the capture orchestration or the frame-selection algorithm. `FrameExtractor` is correct given a working buffer.
- Changing the artifact layout, the visible prompt template, the OpenCode server contract, or any TS code.
- Changing screen capture permissions, entitlements, or TCC flow.
- Shipping the smoke harness to production users. It must be a `#if DEBUG` view, gated behind a build flag, with no production code path.

## Decisions

### D1. Move AVAssetWriter append to a dedicated serial queue

**Decision:** Add a `private let videoWriterQueue = DispatchQueue(label: "ai.open-ramble.video-writer")` to `ScreenCapture`. In `stream(_:didOutputSampleBuffer:of:)`, after capturing the `CapturedFrame` into the in-memory `frameBuffer`, dispatch the `assetWriterAdaptor?.append(imageBuffer, withPresentationTime: timestamp)` call onto `videoWriterQueue.async`. The screen queue only does the cheap synchronous `frameBuffer.append` and returns.

**Rationale:** This is the canonical SCStream + AVAssetWriter real-time pattern. The `ai.open-ramble.screen` queue becomes effectively a no-op consumer, so SCStream's `queueDepth=8` ring never fills, and SCStream never pauses. The `videoWriterQueue` is a single-producer queue (only the sample handler dispatches to it) and `AVAssetWriterInputPixelBufferAdaptor` is single-producer-safe per its `AVFoundation` contract.

**Alternatives considered:**
- *Bump `queueDepth` to 64 or 128.* Doesn't fix the underlying problem: the writer will still block eventually, just after more frames. Also wastes memory.
- *Drop the in-memory `frameBuffer` and use the writer's pool as the only buffer.* Risky: the existing `FrameExtractor` needs the in-memory buffer to do pixel-difference visual-change detection. Removing it would also break the `selected-frames.json` selection logic.
- *Use `AVAssetWriterInputPixelBufferAdaptor.append` with a completion handler and back-pressure detection.* Adds API surface and async coordination for no clear win over a dedicated serial queue.
- *Drop the AVAssetWriter entirely and just keep the in-memory buffer; the compiler reads the pixel buffers directly.* Inverts the contract: the .mov artifact is currently load-bearing for the TS pipeline. Removing it would break the next change's repro plan.

### D2. Wire `screenCapture.onError` with a one-line closure

**Decision:** In `CaptureEngine.startCapture()`, after the `try await screenCapture.startCapture(...)` line, add:
```swift
screenCapture.onError = { [weak self] error in
    self?.onError?(error)
}
```

**Rationale:** This is the literal mirror of the `audioCapture?.onError` wiring at `CaptureEngine.swift:131-133`. If the SCStream ever does stop with an error, the user will see the same error banner they already see for audio failures. The closure is `[weak self]` to match the existing pattern.

**Alternatives considered:**
- *Centralize the wiring in a single `wireErrors()` helper.* Cleaner code, but a refactor for one new line. Out of scope.

### D3. Release `AVAudioFile` inside `AudioCapture.stopRecording()`

**Decision:** Inside `stopRecording()`, after the recognition task is finished and before returning, set `self.audioFile = nil` to release the `AVAudioFile` and trigger the moov atom flush. Also call `try? audioFile?.close()` defensively to make the release explicit even on a path where ARC would otherwise retain it.

**Rationale:** The `AVAudioFile` is the only thing holding the moov atom back. Releasing it inside the stop function makes the lifecycle explicit and the m4a always valid. `audioFile?.close()` is safe to call on an already-closed file (it returns false silently).

**Alternatives considered:**
- *Move the `AVAudioFile` into a local variable and let ARC release it at function exit.* Same effect, but `audioFile` is a stored property of the class today; the explicit `= nil` is more obvious to a future maintainer.
- *Use a `defer` block to close the file.* Doesn't work cleanly because `stopRecording` has multiple early-return paths and the close should happen after the recognition task is finished (so all samples are flushed to the file).

### D4. Add `NSScreenCaptureUsageDescription` to the source `Info.plist`

**Decision:** Add `<key>NSScreenCaptureUsageDescription</key><string>Open-Ramble records your screen while the capture hotkey is held so it can compile a prompt for your coding agent.</string>` to `apps/macos-helper/Sources/OpenRamble/Info.plist`, matching the string already present in the installed `/Applications/Open-Ramble.app/Contents/Info.plist`.

**Rationale:** The recent `install.sh sync_privacy_keys()` helper reads string keys from the source plist. Without this entry, a clean rebuild would strip the usage description from the installed app and TCC would deny ScreenCapture silently on first run.

**Alternatives considered:**
- *Hardcode the usage strings in `install.sh`.* Defeats the point of the new sync helper.
- *Move TCC strings to a `.strings` file.* Out of scope; not how Apple's TCC model works.

### D5. SwiftUI smoke harness as a `#if DEBUG`-only menu item

**Decision:** Add a `CaptureSmokeView` SwiftUI view (gated with `#if DEBUG`) that, when invoked from the status menu, runs a 10-second capture against the current screen, then reports (a) the `.mov` frame count from `ffprobe` (must be > 100), (b) the `.m4a` validity (`ffprobe` exits 0), and (c) the per-second `runningFrameIndex` log from `ScreenCapture`. The harness is exposed only when the binary is built with the `DEBUG_SMOKE` Swift flag set, which is not in the release build configuration.

**Rationale:** The bug was invisible to the developer because the existing capture flow has no in-app feedback for "how many frames did we get?" The 8-frame cap manifests as a "the prompt is wrong" complaint hours later, with no link to the capture subsystem. A one-click smoke harness shortens the feedback loop from "user reports broken prompt" to "developer runs smoke, sees < 100 frames, knows exactly where to look." The harness is a development tool; it is not a feature, not a UI, not a UX change.

**Alternatives considered:**
- *Unit tests that mock `SCStream` and `AVAssetWriter`.* Worth adding (see D6), but mocks would not have caught the real bug because the bug is about the interaction between SCStream's queue depth and AVAssetWriter's pool behavior in a real process. The harness is the only thing that proves the real-world fix.
- *Always-on telemetry that ships a frame count to the dev menu.* Overkill for a bug repro tool. Adds noise to the production UI.
- *Shell script that wraps the binary.* Loses access to the in-app Swift logging. Harder to wire up in CI.

### D6. Add Swift unit tests for the wired behaviors

**Decision:** Add three tests to `apps/macos-helper/Tests/OpenRambleTests/`:
- `ScreenCaptureTests.testOnErrorPropagatesFromStreamDelegate` — inject a stub `SCStream` (via a protocol seam or by exposing the delegate method through a wrapper) and assert that the registered `onError` closure fires when the stub invokes `didStopWithError`.
- `CaptureEngineTests.testScreenCaptureErrorWiredToEngineOnError` — using a mock `ScreenCapture` that exposes an `onError` setter, verify that after `engine.start() → triggerToggle()`, the engine's `onError` fires when the mock's `onError` fires.
- `AudioCaptureTests.testStopRecordingClosesAVAudioFile` — verify that after `stopRecording()` returns, the underlying `audioFile` is `nil`.

**Rationale:** Locks in the wiring without requiring a full capture repro for every regression. The smoke harness covers the end-to-end behavior; the unit tests cover the contract.

## Risks / Trade-offs

- **Writer append moved off the SCStream output queue** → risk that frame presentation timestamps drift relative to the in-memory `frameBuffer` timestamps. Mitigation: the writer's `CMSampleBufferGetPresentationTimeStamp` is the canonical timestamp; the `Date().timeIntervalSince(startDate)` value used for the in-memory buffer is intentionally a wall-clock approximation. The `FrameExtractor.findNearestFrame` already does nearest-neighbor search, so a small drift is absorbed. Worst case: an off-by-one-frame selection in `selected-frames.json`, which is acceptable.
- **SCStream still might fail with an error** after this change (e.g., TCC loss). With D2 in place, the user will see the error banner. Without D2, the bug would manifest as a short .mov with no error. The smoke harness (D5) would catch a future regression to the silent-drop behavior.
- **The smoke harness requires the dev to install `ffprobe`**. On macOS this is a single `brew install ffmpeg`. The harness can be implemented with a pure-Swift frame count (counting CMSampleBuffer arrivals in the test process), but `ffprobe` is the source of truth and matches what the TS pipeline will see. Document the brew install as a one-line prereq in the smoke view itself.
- **`AVAudioFile` released inside `stopRecording` might fail to flush if the engine's last buffer was never written** (e.g., on a hotkey release with no audio). Mitigation: the test in D6 covers the normal case. If a corner case surfaces, the failure mode is a still-corrupt m4a in the same 50% of runs as before — strictly no worse than today, and the smoke harness will catch it.
- **No TCC re-prompt flow is added**. If a user revokes ScreenCapture permission mid-capture, the existing `Permissions.checkAll()` path handles the next capture attempt. Out of scope.
- **The smoke harness is `#if DEBUG`-only**. If a production user reports "the prompt is wrong" and we cannot repro, we need a way to capture diagnostics from a production build. Out of scope for this change; tracked as a follow-up.

## Migration Plan

This is a bug fix with no schema, no API, and no contract changes. Deployment is:

1. Land the change on `main`.
2. Rebuild `/Applications/Open-Ramble.app` via `apps/macos-helper/install.sh` (which also stable-signs with `Open-Ramble Dev` per `AGENTS.md`).
3. Smoke: open the dev build, run the `#if DEBUG` smoke harness, confirm 10s capture → > 100 frames + valid m4a.
4. Production: replace the installed `.app`. The next end-user capture will benefit immediately. There is no data migration, no user-visible state change, no rollback path beyond re-installing the previous build.

If the SCStream behavior regresses in a future change, the smoke harness will catch it. If the audio finalize regresses, the unit test for `audioFile == nil` will catch it.

## Open Questions

- **Should the smoke harness be reachable from the production menu in any way** (e.g., a hidden "Run capture smoke" item visible after 5 Option-clicks)? Pro: lets a power user diagnose their own machine. Con: leaks dev tooling into production UX. Decision deferred — current plan is `#if DEBUG` only.
- **Is the `ScreenCapture.startCapture`'s `runDirectory` parameter still needed in tests, or should we make it injectable for the smoke harness?** It already is. The smoke harness can call the production `CaptureEngine.triggerToggle()` with a `DEBUG_SMOKE` flag that overrides the run directory to a known temp path.
- **Should we also add a frame-count assertion to the existing `apps/macos-helper/Tests/` integration test path?** The unit tests in D6 are deterministic and fast; an integration test that runs a real capture would be slow and flaky in CI. Decision: unit tests only, smoke harness is the integration check, run by a developer when needed.
