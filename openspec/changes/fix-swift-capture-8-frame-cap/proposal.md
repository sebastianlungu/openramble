## Why

The macOS helper's screen capture subsystem deterministically stops delivering frames after exactly 8 frames (~0.27s), regardless of how long the user holds the capture hotkey. The cursor and audio subsystems continue running for the full capture duration, but the screen capture output is unusable for anything past the first quarter-second.

This was confirmed against four independent production runs (`~/.open-ramble/runs/ramble_2026-06-14T*/capture-original.mov` all show `nb_frames=8, duration=0.266667s`). Two of those runs also produced a corrupt audio file (`moov atom not found`).

The root cause is a synchronous `AVAssetWriterInputPixelBufferAdaptor.append(...)` on the SCStream output queue: the adaptor's CVPixelBufferPool fills after ~8 frames at 1080p/30fps, the append blocks, the SCStream consumer appears stuck, and SCStream's `queueDepth=8` ring buffer fills, pausing delivery indefinitely. The cursor and audio subsystems are unaffected because they live on independent queues and threads.

A secondary bug silently drops any SCStream error (`screenCapture.onError` is never wired in `CaptureEngine`), and a tertiary bug in `AudioCapture.stopRecording()` fails to release `AVAudioFile` so the m4a moov atom is never written in the normal stop path.

Without this fix, the entire multimodal temporal alignment story is moot: there is no visual data past 0.27s to align speech and cursor to.

## What Changes

- Move the `AVAssetWriterInputPixelBufferAdaptor.append(...)` call off the SCStream output queue onto a dedicated serial writer queue, so the SCStream consumer never blocks on the writer's pool.
- Wire `screenCapture.onError` in `CaptureEngine.startCapture()` to mirror the existing `audioCapture?.onError` wiring, so any future SCStream failure is surfaced to the user.
- Release `AVAudioFile` (and finalize its moov atom) inside `AudioCapture.stopRecording()` so the m4a artifact is always a valid, indexable file.
- Add `NSScreenCaptureUsageDescription` to the source `Info.plist` so a fresh rebuild via `install.sh` does not silently strip the screen-capture usage string from the installed app.
- Add a one-click SwiftUI "Capture Smoke" panel in the dev build that runs a fixed 10-second capture, surfaces a pass/fail based on `ffprobe`-style frame count, and shows the per-second `runningFrameIndex` log. The harness is dev-only and not shipped.

## Capabilities

### New Capabilities

- `screen-capture-pipeline`: Guarantees that the macOS helper produces a continuous, full-duration screen capture (video and audio) for the entire window the capture hotkey is held, surfaces all capture subsystem errors to the user, and produces artifacts that downstream consumers can read without special handling.

### Modified Capabilities

- None. There are no existing `openspec/specs/` to modify.

## Impact

- **Code**: `apps/macos-helper/Sources/OpenRamble/ScreenCapture.swift`, `CaptureEngine.swift`, `AudioCapture.swift`. New files: a SwiftUI `CaptureSmokeView` under `apps/macos-helper/Sources/OpenRamble/`, exposed only in debug builds.
- **Build/Install**: `apps/macos-helper/Sources/OpenRamble/Info.plist` gains `NSScreenCaptureUsageDescription`. No new dependencies. No new entitlements.
- **APIs**: None. The capture subsystem's external contract (artifact paths, file types) is unchanged.
- **Users**: Capture hotkey behavior is unchanged on the happy path. On capture failure, the existing error banner now fires for screen-capture errors (previously audio-only). The dev build gains a one-click smoke harness; production users see nothing.
- **Downstream**: The TS compiler and enrichment pipeline gain nothing new from this change, but stop receiving empty visual context for the bulk of every capture. A follow-up change will add the time-anchored deictic resolution primitive and the BLOCK gate on top of the now-trustworthy capture data.
