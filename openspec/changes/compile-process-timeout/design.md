## Context

The macOS helper spawns `bun run src/index.ts compile` (and `append-prompt`) as a `Foundation.Process` from `CompilerBridge.runCompilerProcess`. Today, `DefaultProcessRunner.run` (`apps/macos-helper/Sources/OpenRamble/CompilerBridge.swift:32`) does three things on the caller's thread:

1. Assigns a `Pipe` to `process.standardError`.
2. Calls `try process.run()` then `process.waitUntilExit()` synchronously.
3. Reads the remaining stderr to EOF and returns `ProcessResult(terminationStatus:, stderrData:)`.

`process.waitUntilExit()` blocks indefinitely if the child never exits. This is the failure mode observed in production: a model provider hangs, the OpenCode server's HTTP response stalls, the `bun` process sits in `kevent64` on a connected socket, the Swift side blocks, and the floating "Processing" banner never advances to the success or failure branch in `CaptureEngine.showCompletion` (`apps/macos-helper/Sources/OpenRamble/CaptureEngine.swift:295`).

The product already has a "compiler failure" path in `showCompletion` that produces a `failed` History entry and a `Failed — saved to History` banner. We need to route timeout outcomes into that same path, not invent a new UI state.

This change is scoped to the macOS helper. The TypeScript compiler under `src/` is unchanged; the timeout is enforced from the Swift side that owns the process lifecycle.

## Goals / Non-Goals

**Goals:**

- Bound the wall-clock time the helper will wait for the compile subprocess to 3 minutes by default; make the deadline configurable for tests and for future tuning.
- On timeout, terminate the child, drain stderr, and surface a structured error to `CaptureEngine` so the existing failed-entry path runs (History row + `Failed` banner).
- Stop blocking the cooperative thread pool. The current `waitUntilExit()` call runs synchronously on whatever isolation the caller is on; the new implementation must yield.
- Preserve the existing fast path: a compile that finishes in a few seconds must produce the exact same `CompilerOutput` and the same History entry as today.

**Non-Goals:**

- A new UI state for "timed out." A timeout is one of the compiler failure outcomes and uses the existing failed-entry path unchanged.
- A retry button on the banner. The user can re-record. (This may be a future change.)
- Any change to the OpenCode SDK timeout. The fix is on the process-lifecycle side, not the HTTP side.
- Reducing or removing the 3-minute default. The default is a product decision; we are adding the *ability* to set it, not changing the UX.
- Cancellation cooperatively through OpenCode. A `terminate()` is fine; the next run will create a new session.

## Decisions

### Decision 1: New `BoundedProcessRunner` wrapper, not a change to `DefaultProcessRunner`

Introduce a `BoundedProcessRunner(inner: ProcessRunner, timeout: Duration)` that conforms to the existing `ProcessRunner` protocol. It delegates to `inner.run(process)` for setup and execution, races the wait against a `Task.sleep`, and on timeout calls `process.terminate()`, then waits for actual exit (with a short grace window) before returning a `CompilerOutput`-shaped error.

**Why:**

- The existing `DefaultProcessRunner` and the test `MockProcessRunner` both conform to `ProcessRunner`. Wrapping (composition) means we do not have to fork the protocol or duplicate the `process.run` + `Pipe` plumbing.
- Tests can swap in a `MockProcessRunner` whose `run` simulates a hang (sleeps for longer than the test's `timeout` value) and exercise the wrapper deterministically.
- Callers (`CompilerBridge.runCompilerProcess`) need only swap the runner it constructs; everything else stays the same.

**Alternatives considered:**

- *Add a `timeout` parameter to `DefaultProcessRunner.run`.* Mixes the boundary policy (timeout) with the execution policy (spawn + drain). Worse for testability and reuse.
- *Add a Swift `Task` watchdog that calls `terminate()` from the caller.* Requires every caller to remember the watchdog. The wrapper makes the policy impossible to forget.

### Decision 2: Async wait via `withCheckedThrowingContinuation` + `terminationHandler`

The current `process.waitUntilExit()` is replaced with `withCheckedThrowingContinuation { cont in process.terminationHandler = { cont.resume(returning: $0)) } }`. The continuation resumes on an arbitrary thread (whatever Foundation calls the handler on); we hop to the caller's task before returning.

**Why:** `terminationHandler` is the only Foundation API that does not block the calling thread while waiting for the child. It is the standard Swift pattern for "await a `Process` exit."

**Trade-off:** the handler runs on a Foundation-internal thread, not the caller's executor. We accept the cross-thread hop in exchange for not blocking the cooperative pool. The continuation result is a value type (the exit status) so there is no shared mutable state to defend.

### Decision 3: Timeout is a `Duration` parameter on `CompilerBridge.compile(...)` and `append-prompt(...)`

`compile(..., timeout: Duration? = nil)` and `append-prompt(..., timeout: Duration? = nil)` both default to a 3-minute internal constant (`CompilerBridge.defaultCompileTimeout = .seconds(180)`). `CaptureEngine` does not pass a value and inherits the default.

**Why:** future tests and operational tools can override the deadline without touching the engine. Defaulting to `nil` at the call site keeps the change in the bridge, where the process is owned.

### Decision 4: Return a `CompilerOutput`-shaped error, not a thrown Swift error

`runCompilerProcess` already swallows `Process` failures into a `CompilerOutput(promptDraft: nil, errors: [...], warnings: [])`. The timeout path follows the same convention: when the wrapper detects a timeout, `runCompilerProcess` returns a `CompilerOutput` whose `errors[0]` is `"Compile exceeded the X-second timeout and was terminated."` and whose `promptDraft` is `nil`.

**Why:** the call site (`CaptureEngine.finalizeArtifacts`) awaits a `CompilerOutput`; it does not throw. Aligning with the existing return type means the call site needs zero changes to handle the timeout — it just sees a nil prompt and falls into the existing `showCompletion` failure branch.

**Alternatives considered:**

- *Throw a typed Swift error from `compile`.* Would require changing the protocol signature and every call site. The current "errors-in-output" contract is the established convention.
- *Introduce a new `CompilerStatus.timedOut` case.* Useful long-term but out of scope for a reliability fix; the failed-entry path already records the human-readable reason in the History row, which is what the user needs to see.

### Decision 5: SIGTERM (`process.terminate()`) with a 5-second grace, then close

`Process.terminate()` sends SIGTERM. We then wait up to 5 seconds for the process to actually exit (the wrapped `terminationHandler` continuation still fires). If it does not, we call `process.interrupt()` and close the `Pipe` to unblock the stderr reader, and surface the timeout regardless. The 5-second grace is a hardcoded constant on the wrapper.

**Why:** `bun` catches SIGTERM and exits cleanly within a few hundred ms in practice, which lets the child flush any partial `visible-prompt.md` and let the wrapped runner read the remaining stderr. Hard-killing immediately would lose the stderr we want to capture for the failure log.

**Trade-off:** if the child is in a true uninterruptible state (very rare on macOS), we still leak the process for up to 5 seconds before the wrapper gives up. Acceptable: this is the same leak shape as today, just bounded.

## Risks / Trade-offs

- **Risk:** the 3-minute default is too short for legitimate model calls with large screenshots or slow providers.
  - **Mitigation:** the deadline is a `Duration` parameter; the default can be tuned in one place (`CompilerBridge.defaultCompileTimeout`) or overridden per call. We will surface the timeout reason in the History row so users who hit it can report it.

- **Risk:** a timeout kills a bun process mid-write, leaving a partial `visible-prompt.md` that the next `showCompletion` interprets as a successful run.
  - **Mitigation:** `writeTextArtifact` in the TypeScript compiler uses `writeFileSync` (atomic on macOS for sub-page writes); we add a check that the process exit status was 0 before treating the file as authoritative. If the timeout fires, exit status is non-zero, the wrapper returns a `CompilerOutput` with `promptDraft: nil`, and `showCompletion` falls into the failure branch.

- **Risk:** the `terminationHandler` continuation crosses thread boundaries; capturing state in the handler closure could introduce data races.
  - **Mitigation:** the handler closure captures only the process (reference type, Foundation-internal synchronization) and the continuation (value type, single-use). No shared mutable state.

- **Trade-off:** the wrapper still relies on the child responding to SIGTERM within 5 seconds. If a future subprocess ignores SIGTERM, the wrapper cannot force-kill it on macOS without `kill -9` (out of scope for `Process` API). Document the assumption.

- **Trade-off:** all compile errors now share the same `CompilerOutput(errors: [String])` shape, so a timeout is indistinguishable from a syntax error in the History row. We mitigate by prefixing the timeout error string with `"Compile timed out after Ns:"` so it is greppable in the raw `compiler-error.log`.

## Migration Plan

1. Land the change on `fix/compile-process-timeout` and verify `swift test` is green.
2. Open a PR, merge to `main`, build with `/sign`, install to `/Applications`.
3. No data migration: the `history.json` schema and the run-folder layout are unchanged.
4. Rollback: revert the single commit. The default behavior reverts to "no timeout," which is the same as today.

## Open Questions

None. The change is small, the call sites are known, and the failure UX already exists. If user feedback shows the 3-minute default is wrong, it is a one-line tweak to `CompilerBridge.defaultCompileTimeout`.
