## Why

Today, when the upstream model provider (OpenCode → OpenAI/anthropic/etc.) hangs on a `client.session.prompt(...)` call, the entire compile subprocess sits in `kevent64` on an open socket indefinitely. The macOS helper's `DefaultProcessRunner.run` blocks on synchronous `process.waitUntilExit()` with no timeout, the floating "Processing" banner keeps incrementing forever, and the user has to force-quit the app to recover. The compiler did write `hidden-context.json` and `artifact-manifest.json` to the run folder, but the run never reaches the success-or-fail branch in `CaptureEngine.showCompletion`, so the History popover and the run are both lost.

This change adds a hard upper bound on the compiler subprocess (default 3 minutes, configurable) and surfaces a clean failure to the existing `showCompletion` path so the banner exits to "Failed — saved to History" instead of hanging. It also replaces the synchronous `waitUntilExit()` with a continuation-based wait so the cooperative thread pool is not blocked.

## What Changes

- Add a new `BoundedProcessRunner` that wraps any `ProcessRunner` and enforces a per-call timeout: it `terminate()`s the process when the deadline elapses, drains stderr, and returns a `CompilerOutput` shape that the call site already understands.
- `CompilerBridge.compile` accepts an optional `timeout: Duration?` (default 3 minutes) and applies the bound when running the compile subprocess. `append-prompt` inherits the same default.
- `CaptureEngine.finalizeArtifacts` continues to `await` `compilerBridge.compile(...)` exactly as it does today; the change is invisible to the call site — it just gets a bounded wait and a meaningful error when the model hangs.
- The existing `showCompletion` failure path already produces a `failed` History entry and a `Failed — saved to History` banner. The timeout error feeds into that path unchanged. No banner rewrite.
- New Swift tests cover: (a) normal short-running compile returns the same `ProcessResult` it did before, (b) a process that exceeds the deadline is terminated and the wrapper returns a `BridgeError.timeout`-shaped error, (c) the timeout duration is configurable and honored.
- No new third-party dependencies. Pure Swift Concurrency + `Foundation.Process`.

## Capabilities

### New Capabilities

- `compile-process-timeout`: The compile subprocess (`bun run src/index.ts compile`) invoked from the macOS helper has a hard wall-clock deadline. On timeout, the process is terminated, stderr is captured, and a structured error is returned to the engine so the floating banner and History popover update instead of hanging.

### Modified Capabilities

None. This is a new internal timeout contract; it does not change what the compiler produces, what the user sees in the success path, or any other spec-level behavior.

## Impact

- **Code**:
  - `apps/macos-helper/Sources/OpenVysta/CompilerBridge.swift` — replace `DefaultProcessRunner.run`'s sync `waitUntilExit()` with a continuation; add `BoundedProcessRunner`; thread `timeout: Duration` through `compile(...)` and `append-prompt(...)`.
  - `apps/macos-helper/Sources/OpenVysta/CaptureEngine.swift` — pass the timeout (or rely on the default) at the single `compilerBridge.compile` call site; no behavior change otherwise.
  - `apps/macos-helper/Tests/OpenVystaTests/CompilerBridgeTests.swift` — new tests for the bounded runner (timeout terminates, normal exit unchanged, deadline is configurable).
- **Data**: None. No schema changes; no new files persisted.
- **APIs / dependencies**: None. No new Swift packages.
- **PRD**: No PRD impact. This is a reliability fix to the existing capture flow, not a product behavior change.
