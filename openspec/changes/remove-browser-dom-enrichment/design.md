## Context

The repository currently contains a browser/DOM feature family across several layers:

- `apps/browser-extension/` captures route, DOM-ish role lines, element under cursor, console messages, page errors, network failures, and viewport metadata.
- The TypeScript CLI exposes `--browser`, stages `inputs/browser.json`, parses metadata into `hidden-context.json`, and records browser metadata in artifact and send audit shapes.
- `src/scout/` derives likely files/components from `BrowserContext` route, DOM class names, visible/a11y text, and OpenCode search APIs. It is tested but not called from the main CLI path.
- The Swift helper carries `browserMetadataPath` through `CaptureEngine` and `CompilerBridge`, and mirrors `browserMetadata` in its manifest model.
- README, PRD, and agent guidance still present browser/DOM enrichment as part of the product strategy.

User decisions from the interview:

- Scope is **Full Browser Purge**.
- Remove `scout` with the browser feature family.
- Preserve **no compatibility** for old local development artifacts containing browser-shaped fields.
- Treat browser/DOM enrichment as a **permanent non-goal**, not a deferred roadmap phase.

The important distinction: remove browser accessibility-tree capture, but do not remove macOS Accessibility permission/status code that supports native input behavior.

## Goals / Non-Goals

**Goals:**

- Remove browser/DOM enrichment from product scope, source code, public CLI, hidden context, artifact schemas, tests, fixtures, and docs.
- Keep the compiler evidence model centered on transcript, screenshots/selected frames, cursor timeline, optional audio/video artifacts, validation, visual enrichment, and OpenCode handoff.
- Make legacy `--browser` usage fail loudly rather than being silently ignored or accepted.
- Delete browser-context scout code instead of leaving dead DOM-shaped abstractions.
- Keep the implementation small and direct; do not introduce replacement abstractions for future context sources.

**Non-Goals:**

- Designing a replacement code scout.
- Adding a new app/window metadata subsystem.
- Migrating or preserving old local run artifacts that contain `browserMetadata`, `browserContext`, or `scoutResult`.
- Removing native macOS Accessibility permission checks or UI accessibility labels.
- Changing the visual prompt enrichment model, OpenCode handoff, screenshot validation, audio/video artifacts, or capture timing work.

## Decisions

### D1. Purge browser support instead of deprecating it

Remove the browser feature from the public contract in one change: no `--browser`, no browser metadata staging, no browser fields in hidden context or audits, no extension, no browser docs.

**Rationale:** the user explicitly chose no compatibility and permanent non-goal. Keeping deprecated fields would preserve ambiguity and invite future agents to optimize around a rejected feature.

**Alternatives considered:**

- *Keep deprecated null fields.* Rejected because it keeps browser vocabulary in the product contract and conflicts with the full-purge decision.
- *Remove only `apps/browser-extension/`.* Rejected because the CLI/schema/docs would still advertise a browser path.

### D2. Reject legacy browser inputs loudly

After removing `browserMetadataPath` from compile args, explicitly fail when a user passes `--browser` to `openvysta compile`.

**Rationale:** the generic argument parser can otherwise accept unknown flags without meaningfully acting on them. A hard failure prevents stale scripts from producing misleading runs.

**Alternatives considered:**

- *Silently ignore `--browser`.* Rejected because it hides a breaking contract change.
- *Accept and discard the file.* Rejected because it implies browser metadata still has a role.

### D3. Remove scout with the browser feature family

Delete `src/scout/` and `src/__tests__/scout.test.ts`. Remove `ScoutResult`, `ScoutHypothesis`, `scoutResult` arguments, and visible prompt `Likely Targets` generation that depends on scout output.

**Rationale:** scout is currently browser-context shaped and unused by `runCompile`. Leaving it would create a dead DOM-shaped subsystem after the product has explicitly rejected DOM/browser context.

**Alternatives considered:**

- *Keep a scout shell.* Rejected because a non-DOM scout should be designed from transcript/screenshots/repo signals in a future proposal, not inferred by hollowing out the current implementation.
- *Move scout to a follow-up cleanup.* Rejected because the user chose full purge and remove scout.

### D4. Simplify artifact and Swift manifest shapes with no compatibility shim

Remove browser fields from TypeScript `ArtifactManifest`, `SentToModel`, `InputPaths`, and hidden context generation. Remove Swift `BrowserEntry`, `ArtifactManifest.browserMetadata`, `CompileRequest.browserMetadataPath`, and `CompilerBridge` forwarding.

**Rationale:** old local dev runs are not a supported persistence contract for this change. Clean schemas are easier to reason about and test.

**Alternatives considered:**

- *Permissive decoding for old manifests.* Rejected by the user's no-compatibility decision.
- *Leave Swift model fields only.* Rejected because it would keep a phantom artifact contract in the native helper.

### D5. Rewrite product docs and repo guidance to make browser/DOM a non-goal

Update README and PRD to remove browser enrichment from the product promise, architecture, roadmap, accepted input contract, MVP acceptance criteria, risks, and references. Update project agent guidance so future agents do not treat missing browser context as a product weakness.

**Rationale:** source changes alone are insufficient. The repo contains strong guidance telling agents to prefer browser/DOM enrichment; that must be corrected or future work will reintroduce the feature.

**Alternatives considered:**

- *Leave PRD history intact and only edit README.* Rejected because PRD is the authoritative product spec for this repo.

## Risks / Trade-offs

- **Old local artifacts may fail to decode in Swift** -> Accepted. This is explicitly a no-compatibility change for local development artifacts.
- **Removing scout also removes likely-file hints** -> Accepted. Current scout is not wired into the CLI and a replacement should be intentionally designed later if needed.
- **Search-and-delete may accidentally remove native accessibility code** -> Mitigation: only remove browser accessibility-tree/a11y snapshot references; keep macOS permissions and SwiftUI accessibility labels.
- **Docs may retain stale browser guidance** -> Mitigation: include explicit grep checks for browser/DOM/activeTab/scout references, then manually review allowed mentions such as this OpenSpec change.
- **Stale scripts using `--browser` break** -> Mitigation: fail with a clear message that browser metadata is unsupported, rather than silently producing partial output.

## Migration Plan

1. Land source, test, fixture, and doc removals together.
2. Run TypeScript tests with `bun test`.
3. Run Swift package tests under `apps/macos-helper` if Swift files change.
4. Rebuild/sign the macOS helper only if implementation touches helper source and the user asks to install; do not do it as part of planning.
5. Rollback is a normal git revert. No persisted artifact migration is required or promised.

## Open Questions

None. The interview locked the meaningful scope decisions.
