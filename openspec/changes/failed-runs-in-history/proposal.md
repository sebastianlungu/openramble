## Why

Today every successful capture is saved to the menubar **History** popover, but a capture whose compiler step fails after a full recording disappears into a transient floating banner and is then lost forever. The user has already invested speech, screen capture, and cursor effort; the artifacts often still live in `~/.open-ramble/runs/<runId>/`, but there is no surface that lets the user see what happened, copy the failure reason, or revisit the run. This violates NN/g's *Visibility of System Status* and Open-Ramble's own audit-trail promise in `AGENTS.md`.

Users have explicitly asked that error runs "appear in the history just like a normal pass."

## What Changes

- Extend `PromptHistoryEntry` with a `status: success | failed` field (optional, defaults to `success` on decode for backward compatibility with existing local `history.json` files).
- Add a `failure` block to `PromptHistoryEntry` that captures the human-readable reason, the run directory path (when available), and a pointer to the persisted raw error log.
- Persist a raw error log to `runDir/compiler-error.log` whenever the compiler-stage path produces a failed entry, so the audit trail is preserved without dumping stack traces into the user-facing row.
- In `CaptureEngine.showCompletion`, save a `failed` history entry for any compiler-stage failure (compiler returned errors, returned no draft, or visible-prompt.md missing) instead of just showing the banner.
- Render failed entries inline in `PromptHistoryView` with a calm orange `Failed` pill, the failure reason as the secondary line, and an expandable section that shows the full reason plus a copy-log button. No red flood, no separate tab.
- Change the failure banner copy from raw error text to a brief `Failed — saved to History` confirmation so users know the run was preserved.
- **Out of scope for this change**: retry-from-history, capture-start failures (permission denied, no display), mid-recording crashes, user-cancelled captures.

## Capabilities

### New Capabilities

- `prompt-history`: The menubar history popover that lists every capture run with its outcome, lets the user expand any row to inspect it, and lets the user copy the compiled prompt or the failure reason to the clipboard.

### Modified Capabilities

None. `prompt-history` does not yet exist as a documented capability — this change creates the spec.

## Impact

- **Code**:
  - `apps/macos-helper/Sources/OpenRamble/Types.swift` — extend `PromptHistoryEntry` schema.
  - `apps/macos-helper/Sources/OpenRamble/SessionStore.swift` — backward-compatible decode path; add error-log writer helper.
  - `apps/macos-helper/Sources/OpenRamble/CaptureEngine.swift` — save failed entries from the compiler-stage path; update banner copy.
  - `apps/macos-helper/Sources/OpenRamble/PromptHistory.swift` — render status badge, failure reason, and expanded copy-log affordance.
  - `apps/macos-helper/Tests/OpenRambleTests/PromptHistoryTests.swift` — new tests for failed-entry persistence, decode-with-missing-status, and view rendering.
- **Data**: New `compiler-error.log` artifact written into existing run directories. Existing `~/.open-ramble/history.json` files remain readable (legacy entries decode as `status: success`).
- **APIs / dependencies**: None. No new third-party libraries; SwiftUI/AppKit only.
- **PRD**: `PRD.md` does not document the history feature today. The new `prompt-history` capability spec becomes the source of truth.
