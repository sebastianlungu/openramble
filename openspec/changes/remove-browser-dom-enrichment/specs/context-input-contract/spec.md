## ADDED Requirements

### Requirement: Evidence sources exclude browser context
Open-Ramble SHALL compile implementation prompts from non-browser evidence only: transcript text, timestamped transcript segments, screenshots or selected frames, cursor timeline, optional audio artifacts, optional video artifacts, OpenCode handoff configuration, and native capture metadata that is not browser-derived. The system MUST NOT collect, accept, store, infer from, or hand off browser DOM, browser route, browser URL/title, browser accessibility tree, element-under-cursor DOM data, console messages, page errors, network failures, Chrome extension output, or browser-driven scout results.

#### Scenario: Compile run uses only non-browser evidence
- **WHEN** a user runs `open-ramble compile` with a transcript and screenshots
- **THEN** the compiler produces visible and hidden prompt artifacts using only transcript, screenshot/frame, cursor, optional audio/video, validation, enrichment, and OpenCode handoff evidence
- **AND** no browser-derived context is required or synthesized

#### Scenario: Browser evidence is not created as fallback
- **WHEN** no browser metadata is supplied
- **THEN** the system MUST NOT create placeholder browser context, browser metadata, browser route, DOM, accessibility-tree, console, network, or scout fields

### Requirement: Browser metadata input is unsupported
The public CLI contract SHALL NOT include a browser metadata input. The `open-ramble compile` command MUST fail loudly when invoked with legacy browser metadata flags rather than accepting, ignoring, staging, or redacting the file.

#### Scenario: Help output omits browser flag
- **WHEN** the user prints CLI help
- **THEN** the compile options do not include `--browser` or any browser metadata flag

#### Scenario: Legacy browser flag fails
- **WHEN** the user invokes `open-ramble compile --browser ./browser.json` with otherwise valid inputs
- **THEN** the command exits non-zero
- **AND** the error message states that browser metadata is unsupported
- **AND** no `inputs/browser.json` artifact is staged

### Requirement: Artifacts exclude browser fields
Run artifacts, hidden context, manifests, and send audit records SHALL exclude browser-specific fields. This includes `browserMetadata`, `browserContext`, `browserMetadataIncluded`, `scoutResult`, and `inputs/browser.json`.

#### Scenario: Hidden context contains no browser fields
- **WHEN** a compile run writes `hidden-context.json`
- **THEN** the JSON object contains transcript, screenshots, optional audio/video paths, manifest path, hidden-context path, and visible-prompt path
- **AND** it does not contain `browserMetadata`, `browserContext`, or `scoutResult`

#### Scenario: Manifest contains no browser section
- **WHEN** a compile run writes `artifact-manifest.md` or its manifest model
- **THEN** the manifest lists transcript, screenshots, optional audio/video, hidden context, and visible prompt
- **AND** it does not include a browser metadata section or browser metadata fields

#### Scenario: Send audit contains no browser flag
- **WHEN** a prompt is sent and `sent-to-model.json` is written
- **THEN** the audit record reports text and screenshot parts
- **AND** it does not include `browserMetadataIncluded` or an equivalent browser-specific flag

### Requirement: Browser extension and browser scout are absent
The repository SHALL NOT ship browser-context capture or browser-context scout implementation code. Future code-hypothesis work, if any, MUST be proposed separately without depending on DOM, route, Chrome extension, or browser accessibility-tree inputs.

#### Scenario: Chrome extension is removed
- **WHEN** the repository is inspected after this change
- **THEN** `apps/browser-extension/` is absent
- **AND** no build, test, README, PRD, or package instruction requires installing a Chrome extension for Open-Ramble

#### Scenario: Browser scout is removed
- **WHEN** the TypeScript source tree is inspected after this change
- **THEN** `src/scout/` is absent
- **AND** the compiler no longer exposes scout result types, scout arguments, or scout-derived visible prompt sections

### Requirement: Product docs define browser DOM as a permanent non-goal
Public product documentation and project guidance SHALL describe Open-Ramble as a pixel/speech/cursor intent compiler and SHALL present browser/DOM enrichment as out of scope. Documentation MUST NOT list browser DOM, browser route, browser accessibility tree, console/network capture, Chrome `activeTab`, or browser extension capture as MVP scope, future phase, or product weakness to fix.

#### Scenario: README documents the narrowed contract
- **WHEN** a developer reads `README.md`
- **THEN** the described inputs are transcript, screenshots, optional audio/video, cursor/timeline artifacts where applicable, and OpenCode handoff configuration
- **AND** the README does not document `--browser`, `inputs/browser.json`, browser extension setup, or browser metadata privacy behavior

#### Scenario: PRD removes browser enrichment roadmap
- **WHEN** a developer reads `PRD.md`
- **THEN** browser/DOM enrichment is not described as a current promise, MVP acceptance criterion, future phase, or mitigation strategy
- **AND** the PRD explicitly preserves the thesis that Open-Ramble is not a DOM operator or browser automation product

#### Scenario: Agent guidance no longer optimizes for browser DOM
- **WHEN** future agents read repo guidance
- **THEN** they are not instructed to prefer browser/DOM enrichment, active-tab capture, DOM route capture, or browser-context precision as a product target
