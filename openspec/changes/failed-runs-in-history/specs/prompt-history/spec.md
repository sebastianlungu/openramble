## ADDED Requirements

### Requirement: History entry status

The system SHALL classify every persisted history entry with a `status` value drawn from the closed set `{ success, failed }`. The system SHALL default unknown or missing status values to `success` when decoding to remain backward compatible with history files written before this requirement existed.

#### Scenario: New successful capture is recorded as success

- **WHEN** a capture run completes and the compiler returns a non-nil prompt draft
- **THEN** the system saves a history entry whose status is `success`

#### Scenario: Legacy entry decodes as success

- **WHEN** the system loads a `history.json` file containing entries without a `status` field
- **THEN** those entries are presented to the UI with status `success` and no failure block

### Requirement: Compiler-stage failures are persisted as history entries

The system SHALL save a `failed` history entry whenever a capture run reaches the compiler stage and one of the following holds: the compiler returned a non-empty `errors` array, the compiler returned a nil prompt draft, or the visible prompt file was not produced. The failed entry SHALL appear in the same `history.json` array as successful entries, with no separate file or structural partition.

#### Scenario: Compiler returns explicit errors

- **WHEN** the compiler subprocess exits with a non-zero status and surfaces an error string
- **THEN** the system saves a history entry with status `failed` and `failure.reason` populated from the compiler error string

#### Scenario: Compiler returns no draft and no errors

- **WHEN** the compiler subprocess exits successfully but no prompt draft is produced
- **THEN** the system saves a history entry with status `failed` and `failure.reason` set to a clear sentinel such as "Compiler produced no prompt"
- **AND** any compiler warnings are appended to `failure.reason` so the user sees them in the row

#### Scenario: Capture-start and mid-recording failures are out of scope

- **WHEN** a capture run fails before reaching the compiler stage (for example, permission denied, no display available, or screen capture crashes during recording)
- **THEN** the system MUST NOT save a history entry for that failure in this version of the capability

### Requirement: Failed entry payload

A `failed` history entry SHALL carry a `failure` block containing a short human-readable `reason`, the absolute `runDir` path when the run produced artifacts, and an `errorLogPath` pointing to a persisted raw error log when one was written. The `reason` SHALL be safe to render verbatim in the row (no stack traces, no raw JSON). The full raw error output SHALL be written to disk separately and referenced via `errorLogPath`.

#### Scenario: Reason is concise and user-readable

- **WHEN** a failed entry is rendered in the history popover
- **THEN** the reason fits on one or two lines in the secondary text slot and contains no stack trace, internal error code, or raw provider JSON

#### Scenario: Raw error log is persisted to the run folder

- **WHEN** a compiler-stage failure occurs and the run directory exists
- **THEN** the system writes the full raw error output to `<runDir>/compiler-error.log`
- **AND** sets `failure.errorLogPath` to the absolute path of that file

#### Scenario: Failure with no run directory

- **WHEN** a compiler-stage failure occurs but the run directory cannot be resolved
- **THEN** the system still saves a failed history entry with `failure.runDir` and `failure.errorLogPath` set to nil
- **AND** the `failure.reason` is sufficient by itself to describe the failure

### Requirement: Failed entry title

The system SHALL derive a `title` for a failed entry from the first non-empty line of the captured transcript, truncated to a length suitable for one-line rendering. When no transcript text is available, the system SHALL fall back to the literal string `"Failed capture"`.

#### Scenario: Transcript-derived title

- **WHEN** a failed entry is saved and the transcript text is available
- **THEN** the entry title is the first non-empty transcript line, truncated to no more than 60 characters with an ellipsis when truncated

#### Scenario: Empty transcript fallback

- **WHEN** a failed entry is saved and the transcript is empty or unavailable
- **THEN** the entry title is `"Failed capture"`

### Requirement: Failed entry visual treatment

The history popover SHALL render failed entries inline in the same chronological list as successful entries, using a calm orange `Failed` badge next to the title and rendering the failure reason in place of the prompt preview. The popover MUST NOT use a fully red row background, a separate tab, or a hidden-by-default section for failures.

#### Scenario: Failed row in the mixed list

- **WHEN** the user opens the menubar history popover and a failed entry exists for the current day
- **THEN** the failed entry appears in the same day group as successful entries, sorted by timestamp
- **AND** the row shows the title, an orange `Failed` badge, the failure reason as secondary text, the timestamp, and the View/Hide and Copy controls

#### Scenario: Expanded failed row exposes the raw log

- **WHEN** the user expands a failed entry whose `failure.errorLogPath` points to an existing file
- **THEN** the expanded view shows the full `failure.reason` as selectable text and a `Copy log` button that copies the contents of the log file to the clipboard

#### Scenario: Copy log degrades gracefully when the log is missing

- **WHEN** the user expands a failed entry whose `failure.errorLogPath` is nil or points to a deleted file
- **THEN** the `Copy log` button is hidden or disabled and the row continues to show the `failure.reason` as selectable text

#### Scenario: No alarm-fatigue red

- **WHEN** any failed entry is rendered
- **THEN** the row uses the same neutral surface color as a successful row, with the orange badge as the only colored differentiator

### Requirement: Failure banner confirms persistence

When a compiler-stage failure occurs, the floating capture banner SHALL display a brief confirmation that the failure was recorded to History, instead of surfacing the raw error string indefinitely. The previous misleading "Prompt compiled. Ready to paste." copy for the no-draft-no-errors branch SHALL be removed.

#### Scenario: Failure banner copy

- **WHEN** a compiler-stage failure is saved to history
- **THEN** the floating banner shows a single-line message such as `Failed — saved to History` and the underlying short failure reason is still available via the history popover

#### Scenario: Silent-success copy is removed

- **WHEN** the compiler returns neither a draft nor errors
- **THEN** the banner does not show "Prompt compiled. Ready to paste."
- **AND** the run is recorded as a failed entry per the compiler-stage failures requirement

### Requirement: Copy action behavior per status

The history popover Copy button SHALL copy the `promptText` for successful entries and the `failure.reason` for failed entries. Failed entries SHALL NOT silently copy an empty string.

#### Scenario: Copy on success

- **WHEN** the user clicks Copy on a successful entry
- **THEN** the clipboard contents equal the entry's `promptText`

#### Scenario: Copy on failure

- **WHEN** the user clicks Copy on a failed entry
- **THEN** the clipboard contents equal the entry's `failure.reason`
