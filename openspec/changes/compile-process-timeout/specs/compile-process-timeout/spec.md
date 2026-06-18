## ADDED Requirements

### Requirement: Compile subprocess has a bounded wall-clock deadline

The system MUST enforce a configurable wall-clock deadline on the compile subprocess spawned from the macOS helper. The default deadline MUST be 3 minutes (180 seconds). When the deadline elapses, the system MUST terminate the subprocess, capture any remaining stderr, and surface a structured error to the calling engine so the floating banner and History popover update to a `failed` state instead of hanging.

#### Scenario: Compile finishes within the deadline
- **WHEN** the compile subprocess exits with status 0 before the deadline
- **THEN** the system returns the same `CompilerOutput` it would have returned without this change and the existing success path runs unchanged

#### Scenario: Compile exceeds the deadline
- **WHEN** the compile subprocess is still running at the deadline
- **THEN** the system sends SIGTERM to the process, waits up to 5 seconds for graceful exit, and returns a `CompilerOutput` whose `errors` array contains a message prefixed with `Compile timed out after Ns:`

#### Scenario: Deadline is configurable
- **WHEN** `CompilerBridge.compile` is called with an explicit `timeout` argument
- **THEN** the wrapper honors that timeout instead of the default

#### Scenario: Subprocess ignores SIGTERM past grace window
- **WHEN** the compile subprocess has not exited 5 seconds after `terminate()` is called
- **THEN** the wrapper still returns a timeout error to the caller; the orphan subprocess is allowed to exit on its own

### Requirement: Cooperative thread pool is not blocked during the wait

The system MUST NOT call `process.waitUntilExit()` synchronously on the caller's task. The wait MUST yield the cooperative thread and resume the awaiting task when the subprocess exits or the deadline elapses, whichever comes first.

#### Scenario: Compiler bridge is awaited from an async context
- **WHEN** `CaptureEngine.finalizeArtifacts` awaits `compilerBridge.compile(...)`
- **THEN** the calling task is suspended (not blocked) for the duration of the wait, and other tasks on the same executor can make progress

### Requirement: Timeout outcomes route through the existing failed-entry path

The system MUST NOT introduce a new UI state, banner copy, or History row shape for compile timeouts. A timeout MUST be treated as a compiler-stage failure that produces the same `failed` `PromptHistoryEntry` and the same `Failed — saved to History` banner as any other compiler failure.

#### Scenario: Compile times out
- **WHEN** the compile subprocess is terminated for exceeding the deadline
- **THEN** a `failed` `PromptHistoryEntry` is appended with a `reason` that includes the timeout message, and the banner shows `Failed — saved to History`

#### Scenario: Compile succeeds under the deadline
- **WHEN** the compile subprocess finishes successfully
- **THEN** a `success` `PromptHistoryEntry` is appended and the banner shows the normal success copy
