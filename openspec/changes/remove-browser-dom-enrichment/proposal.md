## Why

OpenVysta's core thesis is visual intent compilation from speech, screenshots, cursor timing, and app context. The browser/DOM enrichment path pulls the product toward a browser-context tool, adds permission/privacy surface, and leaves dead code paths (`scout`, `--browser`) that are not currently load-bearing in the main compiler flow.

This change removes the browser/DOM feature family entirely so the MVP can stay focused on pixel-grounded prompt quality.

## What Changes

- **BREAKING** Remove browser metadata as an accepted compiler input, including the public `--browser` CLI flag.
- **BREAKING** Remove browser/DOM/a11y/route/context fields from TypeScript compiler schemas, hidden context, artifact manifests, and sent-to-model audit records.
- **BREAKING** Remove Swift helper browser metadata plumbing and manifest fields with no compatibility shim for old local dev run artifacts.
- Delete the Chrome extension under `apps/browser-extension/`.
- Delete the browser-context-driven `src/scout/` package and its tests.
- Update tests, fixtures, README, PRD, and agent guidance to make browser/DOM enrichment a permanent non-goal rather than a deferred phase.
- Preserve the core evidence contract: transcript, screenshots/selected frames, cursor timeline, optional audio/video artifacts, model capability checks, validation gates, visible prompt, hidden context, and OpenCode handoff.

## Capabilities

### New Capabilities
- `context-input-contract`: Defines the allowed OpenVysta evidence sources and explicitly excludes browser, DOM, route, accessibility-tree, console, network, extension, and browser-driven scout signals.

### Modified Capabilities
- None. There are no baseline specs under `openspec/specs/` yet.

## Impact

- Affected TypeScript: `src/index.ts`, `src/compiler/compile.ts`, `src/compiler/schema.ts`, `src/compiler/artifacts.ts`, `src/compiler/redact.ts`, related tests and fixtures.
- Affected Swift: `apps/macos-helper/Sources/OpenVysta/Types.swift`, `CaptureEngine.swift`, `CompilerBridge.swift`, and related tests.
- Removed code: `apps/browser-extension/`, `src/scout/`, `src/__tests__/scout.test.ts`, browser fixture data.
- Documentation updates: `PRD.md`, `README.md`, and `AGENTS.md` browser/DOM/scout references.
- This intentionally breaks any local scripts or old development artifacts depending on `--browser`, `browserMetadata`, `browserContext`, or scout output.
