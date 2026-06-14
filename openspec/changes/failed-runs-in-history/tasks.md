## 1. Schema and storage

- [ ] 1.1 Add `PromptHistoryStatus` enum (`success`, `failed`) and `PromptHistoryFailure` struct (`reason: String`, `runDir: String?`, `errorLogPath: String?`) to `apps/macos-helper/Sources/OmniCapture/Types.swift`.
- [ ] 1.2 Extend `PromptHistoryEntry` in `Types.swift` with `var status: PromptHistoryStatus = .success` and `var failure: PromptHistoryFailure? = nil`, keeping all existing fields and the existing initializer signature working.
- [ ] 1.3 Implement a custom `init(from decoder:)` (or use Swift's default with optional fields) so that history files written without `status`/`failure` decode as `success`/`nil`.
- [ ] 1.4 Add a `SessionStore.saveFailureLog(_ rawLog: String, to runDir: URL) -> URL` helper that writes `compiler-error.log` atomically inside the run directory and returns the absolute path.

## 2. Capture engine wiring

- [ ] 2.1 In `apps/macos-helper/Sources/OmniCapture/CaptureEngine.swift`, refactor `showCompletion(compiled:)` so it produces a `PromptHistoryEntry` for every compiler-stage outcome (success, explicit error, no-draft-no-error).
- [ ] 2.2 For each failure case, derive `title` from the first non-empty transcript line via a new small helper `Self.failedEntryTitle(transcriptText:)`, falling back to `"Failed capture"`.
- [ ] 2.3 For each failure case, build a `PromptHistoryFailure` with a concise `reason` and persist the raw `compiled?.errors`/warnings to `runDir/compiler-error.log` via `SessionStore.saveFailureLog`; set `failure.errorLogPath` accordingly.
- [ ] 2.4 Replace the misleading `"Prompt compiled. Ready to paste."` banner branch (lines 310-312) with the failed-entry path.
- [ ] 2.5 Change the failure banner copy to a brief `"Failed — saved to History"` confirmation; remove the long error-text display path.

## 3. History view

- [ ] 3.1 In `apps/macos-helper/Sources/OmniCapture/PromptHistory.swift`, update `historyEntryRow(_:)` to branch on `entry.status`.
- [ ] 3.2 Add a `FailedBadge` subview that renders a 9pt semibold `Failed` label inside an `Color.orange.opacity(0.18)` capsule with `Color.orange` foreground, sized to sit inline next to the title.
- [ ] 3.3 For failed entries, render `entry.failure?.reason` as the secondary line (currently rendered from `entry.promptText`), preserving the existing two-line truncation behavior.
- [ ] 3.4 In the expanded view of a failed entry, show the full `failure.reason` as selectable monospaced text and add a `Copy log` button that reads `failure.errorLogPath` and copies its file contents to `NSPasteboard`.
- [ ] 3.5 Hide or disable the `Copy log` button when `failure.errorLogPath` is nil or the file no longer exists.
- [ ] 3.6 Update `PromptHistoryManager.copy(_:)` so that for failed entries it copies `failure.reason` instead of `promptText`.

## 4. Tests

- [ ] 4.1 In `apps/macos-helper/Tests/OmniCaptureTests/PromptHistoryTests.swift`, add a test that decodes a legacy JSON array of `PromptHistoryEntry` (no `status` field) and asserts every entry is `success` with `failure == nil`.
- [ ] 4.2 Add a test that encodes a failed entry with a populated `PromptHistoryFailure`, round-trips it through `JSONEncoder`/`JSONDecoder`, and asserts equality on `status`, `failure.reason`, `failure.runDir`, and `failure.errorLogPath`.
- [ ] 4.3 Add a test for `failedEntryTitle(transcriptText:)`: empty/nil transcript yields `"Failed capture"`, a multi-line transcript yields the first non-empty line, lines longer than 60 characters are truncated with an ellipsis.
- [ ] 4.4 Add a test for `PromptHistoryManager.copy(_:)` that copies `failure.reason` for a failed entry and `promptText` for a successful one.
- [ ] 4.5 Add a CaptureEngine-level test (or extend an existing one) that drives `showCompletion(compiled:)` with each of the three failure shapes (errors present, no draft no errors, nil compiled) and asserts a failed entry is appended to `SessionStore.loadHistory()` and a `compiler-error.log` is written when `runDir` is set.

## 5. Verification

- [ ] 5.1 Run `swift test` from `apps/macos-helper/` and confirm all existing and new tests pass.
- [ ] 5.2 Manually trigger a failing compile (for example by pointing `OMNICAPTAIN_REPO_ROOT` at a path with a broken `src/index.ts`) and verify a `Failed` row appears in the History popover with the expected reason and a working `Copy log` button.
- [ ] 5.3 Manually verify that an existing `~/.omnicaptain/history.json` from before this change still loads and that all of its entries render as successful.
- [ ] 5.4 Manually verify dark-mode rendering of the orange `Failed` badge against the popover surface.
- [ ] 5.5 Run `openspec validate failed-runs-in-history --strict` and confirm the change passes.
