## 1. TypeScript Compiler Contract

- [ ] 1.1 Remove `BrowserContext`, `ElementContext`, `ScoutResult`, `ScoutHypothesis`, `browserMetadata`, `browserContext`, and `scoutResult` types/fields from `src/compiler/schema.ts` and dependent compiler signatures.
- [ ] 1.2 Remove `browserMetadataPath`, browser input paths, browser JSON parsing, hidden-context browser fields, and scout-derived `Likely Targets` generation from `src/compiler/compile.ts`.
- [ ] 1.3 Remove browser metadata staging, manifest fields/markdown section, and `browserMetadataIncluded` send audit fields from `src/compiler/artifacts.ts`.
- [ ] 1.4 Remove `scanBrowserMetadata` and its tests from `src/compiler/redact.ts` and `src/__tests__/redact.test.ts`.
- [ ] 1.5 Remove `--browser` from CLI help and add an early, clear, non-zero failure when legacy `--browser` is passed to `open-ramble compile`, before browser file existence checks or artifact staging.

## 2. Browser Extension, Scout, Fixtures, And Tests

- [ ] 2.1 Delete `apps/browser-extension/` completely.
- [ ] 2.2 Delete `src/scout/` and `src/__tests__/scout.test.ts` completely.
- [ ] 2.3 Remove `fixtures/basic/browser.json` and update fixture E2E tests to require only transcript and screenshots.
- [ ] 2.4 Update compiler, artifact, CLI, fixture, and redaction tests so expected artifact shapes contain no browser fields.
- [ ] 2.5 Add or update tests proving `--browser` fails loudly for both existing and missing browser paths, no `inputs/browser.json` is staged, and no successful run artifact set is created from the unsupported input.
- [ ] 2.6 Add or update send-audit tests proving `sent-to-model.json` and `generateSentToModel` have no `browserMetadataIncluded` field or equivalent browser flag.

## 3. Swift Helper Contract

- [ ] 3.1 Remove `BrowserEntry` and `ArtifactManifest.browserMetadata` from `apps/macos-helper/Sources/OpenRamble/Types.swift`.
- [ ] 3.2 Remove `browserMetadataPath` from `CaptureEngine.CompileRequest`, `captureCompileRequest`, and the compile invocation path.
- [ ] 3.3 Remove `browserMetadataPath` from `CompilerBridgeProtocol.compile`, `CompilerBridge.compile`, and process argument construction.
- [ ] 3.4 Update Swift tests and mocks to match the new compile signature and manifest shape.
- [ ] 3.5 Verify native macOS Accessibility permission/status code and SwiftUI accessibility labels are untouched unless directly required by compiler signature updates.
- [ ] 3.6 Preserve and test native Accessibility-specific symbols and behavior, including `PermissionStatus.accessibility`, `Permissions.checkAll()` accessibility reporting, any System Settings Accessibility prompt/routing, and user-facing accessibility labels unrelated to browser DOM/a11y snapshots.

## 4. Product Documentation And Agent Guidance

- [ ] 4.1 Update `README.md` to remove `--browser`, `inputs/browser.json`, browser extension architecture, browser metadata privacy notes, and browser metadata hidden-context claims.
- [ ] 4.2 Update `PRD.md` to remove browser enrichment from product promise, architecture, data model, phases, accepted input contract, MVP criteria, risks, recommended next step, and research references.
- [ ] 4.3 Update `AGENTS.md` to remove guidance that treats browser/DOM enrichment as required, preferred, or a product weakness to fix.
- [ ] 4.4 Review and update all other tracked docs, including `TODO-opensource.md`, so no doc asks contributors to package, preserve, or improve the browser extension.
- [ ] 4.5 Add concise replacement language: Open-Ramble is a speech + screenshot/keyframe + cursor intent compiler, not a DOM operator or browser-context product.

## 5. Verification

- [ ] 5.1 Run a repository grep for stale browser feature terms (`--browser`, `browserMetadata`, `browserContext`, `apps/browser-extension`, `src/scout`, `activeTab`, `DOM snapshot`) and manually classify any remaining mentions as acceptable historical OpenSpec references or remove them.
- [ ] 5.2 Remove or regenerate any tracked generated artifacts, coverage reports, or docs that reference deleted browser/scout files.
- [ ] 5.3 Run `bun test` from the repository root.
- [ ] 5.4 Run Swift tests for `apps/macos-helper` after updating Swift source.
- [ ] 5.5 Run a smoke compile with transcript + screenshots only and confirm artifacts contain no browser fields or `inputs/browser.json`.
- [ ] 5.6 Perform a lightweight review for accidental scope damage, especially native Accessibility permission code and OpenCode handoff behavior.
