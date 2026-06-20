## Context

`PromptHistoryEntry` is a flat `Codable` struct persisted as a JSON array at `~/.open-ramble/history.json`. It is written from exactly one site (`CaptureEngine.showCompletion`, line 303) and only when `compiled?.promptDraft` is non-nil. Three branches drop a run on the floor today:

1. `compiled?.errors` non-empty → banner only.
2. `compiled?.promptDraft == nil` *and* `compiled?.errors` empty → banner says "Prompt compiled. Ready to paste." even though no prompt exists.
3. `compiled == nil` → banner says the same misleading line.

`PromptHistoryView` (a SwiftUI popover anchored on the menubar item) renders entries grouped by day with title, prompt preview, timestamp, View/Hide toggle, and Copy button.

The capture pipeline writes durable artifacts to `runDir = ~/.open-ramble/runs/<runId>/` regardless of compiler outcome (transcript, screenshots, cursor timeline, manifest). The compiler subprocess output is currently lost after the `Process` exits — only the first line of stderr survives in `CompilerOutput.errors`.

User answers on 2026-06-13 locked these choices:

- Scope: **compiler-stage failures only** (not capture-start, not mid-recording, not user-cancelled).
- Schema: best-practice / minimal migration.
- Payload: human-readable reason **plus** the log of the error.
- Retry: defer.
- Visual: calm orange `Failed` pill + reason line, no red flood.
- Banner: brief `Failed — saved to History` confirmation.

## Goals / Non-Goals

**Goals:**

- Make every compiler-stage failure visible and durable in the menubar history popover, with the same shape and ergonomics as a successful entry.
- Preserve the raw error log for debugging without dumping stack traces into the user-facing row.
- Maintain backward compatibility with the existing on-disk `history.json` format so users running dev builds today do not lose their history on upgrade.
- Keep the diff small and reversible; isolate the change to the four files in `apps/macos-helper/Sources/OpenRamble/`.

**Non-Goals:**

- Retry-from-history (deferred).
- Failure entries for capture-start failures, mid-recording crashes, or user cancellations (deferred).
- Server-side or cross-device sync of history.
- A search/filter UI for the popover.
- Redacting potentially sensitive content from the error log (the user can already see their own transcript and screenshots in `runDir`).

## Decisions

### Decision 1: Status as an optional enum on `PromptHistoryEntry`

Add `var status: PromptHistoryStatus = .success` and `var failure: PromptHistoryFailure? = nil` to `PromptHistoryEntry`. `PromptHistoryStatus` is `enum { case success, case failed }`. `PromptHistoryFailure` is `struct { let reason: String; let runDir: String?; let errorLogPath: String? }`.

**Why:** the user explicitly said "no production yet so can do whatever" *and* asked for best practice. The best practice here is a single-version schema with an optional field defaulted on decode, because:

- Zero migration code.
- Existing `history.json` files (which lack `status`) deserialize cleanly as `success` via `init(from:)` defaulting.
- Forward-compatible: new statuses (e.g. `cancelled`, `partial`) can be added later without breaking either side.

**Alternatives considered:**

- *Wrapper with a `version: 2` envelope* — overkill for one new field on a local JSON file, requires migration code at every read site.
- *Parallel `FailureHistoryEntry` in a separate file* — structurally splits the data and contradicts the "just like a normal pass" framing the user requested.

### Decision 2: Persist the full error log to `runDir/compiler-error.log`

When a compiler-stage failure occurs and `runDir` exists, write the raw error string to `runDir/compiler-error.log` and record the absolute path in `PromptHistoryFailure.errorLogPath`. The history row shows only the short `reason`; the expanded view shows a **Copy log** button that copies the file contents.

**Why:** NN/g and Smashing UX guidance is clear that stack traces and raw error blobs in user-facing rows are an anti-pattern (alarm fatigue, jargon). But the user explicitly asked for "the log of the error" to be saved. Splitting these — short reason in the row, full log on disk under the existing run folder — satisfies both constraints and keeps `history.json` small.

**Alternatives considered:**

- *Inline the full log inside `PromptHistoryEntry`* — bloats `history.json`, risks decoding cost over time, harder to redact later.
- *Skip the log entirely* — user explicitly requested it.

### Decision 3: Save the failed entry *after* the compiler step, not before

Write the history entry in `CaptureEngine.showCompletion` (the existing success site), branching on whether `compiled?.promptDraft` is nil. Do not write a "pending" entry at capture start.

**Why:** the user's scope is *compiler-stage failures*. Capture-start failures are explicitly out of scope, so the engine does not need a multi-phase write. Keeping the write at one site mirrors today's code path and minimizes the diff.

**Alternatives considered:**

- *Optimistic write at capture start, update on completion* — needed only if we later add capture-start failure scope. Trivial to add then.

### Decision 4: Treat the "no errors, no draft" branch as a failure

The current code at `CaptureEngine.swift:310-312` shows `"Prompt compiled. Ready to paste."` when the compiler returned neither errors nor a draft. This is a silent failure. Reclassify it as `status: .failed` with `reason: "Compiler produced no prompt"`, surface the warning from `CompilerOutput.warnings` if present, and remove the misleading banner copy.

**Why:** lying to the user is worse than admitting we do not know what happened, and the AGENTS.md `Prompt Quality Gate` already flags this as a rejectable outcome.

### Decision 5: Title for failed entries

Use the first transcript line (truncated to 60 chars) when available, otherwise the literal string `"Failed capture"`. The current success path takes the title from `prompt.title` (the first line of the visible prompt), which is unavailable on failure.

**Why:** transcript-derived titles let the user recognize *which* attempt failed ("the dashboard one") without having to expand.

**Alternatives considered:**

- *Use timestamp-only titles* — anonymous, unrecognizable in a list.
- *Use the failure reason as the title* — collapses multiple failed attempts of the same intent into visually identical rows.

### Decision 6: Visual treatment

Inline mixed list, calm orange `Failed` pill rendered next to the title using `Color.orange.opacity(0.18)` background + `Color.orange` foreground at `.system(size: 9, weight: .semibold)`. Reason line replaces the prompt-preview line. Timestamp position unchanged. Expanded view shows the full reason (selectable text) and a **Copy log** button when `errorLogPath` is non-nil.

**Why:** matches the user's locked choice and NN/g's guidance against alarm-fatigue red. The pill is the only visual differentiator; everything else mirrors a successful row so the list still reads as "just normal passes."

## Risks / Trade-offs

- **Risk:** users with long-running history files (months of usage) might see a sudden flood of new failed entries on first upgrade if past runs were silently failing.
  - **Mitigation:** failures are written prospectively only; the upgrade adds zero retroactive entries.

- **Risk:** the log file path stored in `failure.errorLogPath` becomes stale if the user deletes `~/.open-ramble/runs/<runId>/`.
  - **Mitigation:** the expanded view's **Copy log** button checks `FileManager.fileExists` before reading; if missing, it shows the short reason as a fallback and disables the button.

- **Risk:** orange pill could blend with system dark-mode chrome on certain accent themes.
  - **Mitigation:** use a semi-opaque background fill plus a foreground orange chosen for AA contrast against both light and dark backgrounds; verify in dark mode during implementation.

- **Trade-off:** treating "no errors, no draft" as a failure changes today's user-visible banner copy. Anyone relying on the "Ready to paste." text will see a different message. Acceptable because that copy is a known lie.

- **Trade-off:** storing the error log on disk under `runDir` ties log retention to run-folder retention. If a future feature auto-cleans run folders, logs disappear with them. Acceptable and arguably desirable — logs without their run are low-value.

## Migration Plan

1. Ship the schema change (`status` + `failure` are optional, default `.success`/`nil`).
2. On first launch after upgrade, `SessionStore.loadHistory` decodes existing entries with the defaults; no on-disk rewrite happens until the next successful or failed run appends a new entry, at which point the whole file is re-encoded with the new schema.
3. Rollback: reverting the binary leaves a `history.json` containing entries with the new fields. Older binaries using `JSONDecoder` will *ignore* unknown keys by default for `Codable` structs, so rollback is safe (verified by Swift `Codable` semantics — unknown keys are skipped unless `CodingKeys` is custom-strict).

## Open Questions

None. All design choices were locked with the user on 2026-06-13.
