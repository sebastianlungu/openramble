## 1. Async process wait

- [ ] 1.1 In `apps/macos-helper/Sources/OpenRamble/CompilerBridge.swift`, replace the synchronous `process.waitUntilExit()` inside `DefaultProcessRunner.run` with `withCheckedThrowingContinuation` + `process.terminationHandler`, so the calling task is suspended (not blocked) until the subprocess exits.
- [ ] 1.2 Keep the existing `Pipe`-based stderr drain in `DefaultProcessRunner.run`; the drain continues to read from the pipe handle after the continuation resumes so the existing `ProcessResult.stderrData` shape is preserved.

## 2. Bounded process runner

- [ ] 2.1 Add a new `BoundedProcessRunner` type to `apps/macos-helper/Sources/OpenRamble/CompilerBridge.swift` that conforms to the existing `ProcessRunner` protocol and wraps an inner `ProcessRunner` plus a `Duration` deadline.
- [ ] 2.2 On timeout, the wrapper sends `process.terminate()` (SIGTERM), waits up to 5 seconds for the process to actually exit, then returns a `ProcessResult(terminationStatus: 137, stderrData: <captured stderr>)` plus a `didTimeOut: Bool` flag the call site can use to label the failure.
- [ ] 2.3 If the subprocess ignores SIGTERM past the 5-second grace window, the wrapper still returns a timeout-flagged result to the caller; the orphan subprocess is left to exit on its own.

## 3. Thread the timeout through `CompilerBridge`

- [ ] 3.1 Add a static `CompilerBridge.defaultCompileTimeout: Duration = .seconds(180)` constant in the same file.
- [ ] 3.2 Add a `timeout: Duration? = nil` parameter to `CompilerBridge.compile(...)` and `CompilerBridge.append-prompt(...)`. When the parameter is `nil`, fall back to `Self.defaultCompileTimeout`.
- [ ] 3.3 In `runCompilerProcess`, construct the runner as a `BoundedProcessRunner(inner: processRunner, timeout: timeout)` when a timeout is provided; otherwise use `processRunner` directly. The rest of `runCompilerProcess` is unchanged.
- [ ] 3.4 When the bounded runner reports a timeout, return a `CompilerOutput(promptDraft: nil, errors: ["Compile timed out after Ns: <captured stderr>"], warnings: [])` so the existing failure path in `CaptureEngine.showCompletion` handles it without changes.

## 4. Verify the call site is unaffected

- [ ] 4.1 Confirm `CaptureEngine.finalizeArtifacts` (`apps/macos-helper/Sources/OpenRamble/CaptureEngine.swift:279`) still awaits `compilerBridge.compile(...)` without changes; the new `timeout` parameter is optional and defaults to 3 minutes.
- [ ] 4.2 Confirm the existing `showCompletion` failure branch (`apps/macos-helper/Sources/OpenRamble/CaptureEngine.swift:313`) consumes a `nil` `promptDraft` exactly the same way it does for any other compiler failure; no banner or History shape change.

## 5. Tests

- [ ] 5.1 In `apps/macos-helper/Tests/OpenRambleTests/CompilerBridgeTests.swift`, add a `HangingMockProcessRunner` (or extend `MockProcessRunner`) that, when a `shouldHang` flag is set, blocks inside `run` for longer than the test timeout before returning.
- [ ] 5.2 Add a test that drives `BoundedProcessRunner` with a hanging inner runner and a 50ms deadline; assert it returns within ~100ms with `didTimeOut == true` and a non-zero `terminationStatus`.
- [ ] 5.3 Add a test that drives `BoundedProcessRunner` with a non-hanging inner runner and a generous deadline; assert it returns the inner result unchanged (`didTimeOut == false`, status preserved).
- [ ] 5.4 Add a test that calls `CompilerBridge.compile(...)` with a `timeout: Duration? = .milliseconds(50)` against a mock that hangs, and asserts the returned `CompilerOutput` has `promptDraft == nil` and an `errors[0]` string that starts with `Compile timed out after`.
- [ ] 5.5 Add a test that calls `CompilerBridge.compile(...)` with a `timeout: Duration? = nil` and verifies the default 3-minute deadline is used (assert by injecting a runner that records the deadline it received).

## 6. Verification

- [ ] 6.1 Run `swift test` from `apps/macos-helper/` and confirm all existing and new tests pass.
- [ ] 6.2 Run `bun test` from the repo root to confirm the TypeScript side is unaffected.
- [ ] 6.3 Manually reproduce the original hang: start a `bun run src/index.ts compile` with a transcript + screenshot, point the helper at it via a debug build, and confirm the banner exits to `Failed — saved to History` within ~3 minutes of the deadline.
- [ ] 6.4 Run `openspec validate compile-process-timeout --strict` and confirm the change passes.
