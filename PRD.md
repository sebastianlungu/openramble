# OpenVysta PRD

Date: 2026-06-07
Status: Draft v0.1
Owner: Sebastian Lungu
Product action name: OpenVysta
Primary integration: OpenCode

## 1. Product Thesis

OpenVysta is a zero-friction multimodal intent compiler for coding agents.

The final product lets the user hold a mouse chord, speak naturally while pointing at anything on screen, release, and receive a high-quality implementation prompt docked over the editor. In the native capture phase, speech is transcribed during capture and aligned with screenshots, cursor/pointing context, and optional browser/code metadata. The build-complete MVP consumes a provided transcript instead of performing STT.

OpenVysta is not primarily a screen recorder, bug reporter, browser automation tool, dictation app, or DOM operator. It captures human spoken and visual intent and converts it into coding-agent-ready instructions.

## 2. Core Problem

Coding agents still struggle with vague visual intent.

Users often know exactly what they mean when looking at a UI, but translating that into a written engineering prompt is slow and lossy. Existing tools solve adjacent problems: Jam captures bugs, Loom turns videos into docs or tickets, browser automation agents can click through pages, and coding agents can edit code. The missing layer is the intent compiler between human visual feedback and agent implementation.

## 3. Target User

Primary user: solo developer using OpenCode.

The first user is a fast-moving builder who iterates on UI, notices something visually wrong, and wants to hand intent to OpenCode without writing a prompt manually.

Initial buyer model: open source for individuals. Enterprise monetization is deferred, but likely paid value will come from private deployment, policy controls, precision routing, and stack-specific customization.

## 4. Magic Moment

The magic moment is:

```text
Hold mouse chord -> speak and point -> release -> perfect implementation prompt appears
```

The user should feel like the system understood what they meant, not just what they said.

## 5. Product Promise

Primary promise:

```text
Stop writing prompts manually. Capture what you mean.
```

Secondary promise:

```text
When richer context exists, OpenVysta adds it quietly: DOM, route, console, network, accessibility tree, codebase scout hypotheses.
```

## 6. Non-Goals

Launch will not include live steering of an agent while it is coding.

Launch will not try to replace OpenCode.

Launch will not require users to annotate screenshots manually.

Launch will not optimize for PM or designer handoff flows.

Launch will not attempt full cross-platform desktop support.

Launch will not upload raw full-resolution video by default.

Launch will not claim exact file/component certainty unless evidence supports it.

## 7. Key Architectural Choices

| Decision | Choice | Rationale |
| --- | --- | --- |
| Host platform | macOS first | Best first path for global mouse chord, audio permissions, screen capture, and developer adoption. |
| Agent integration | OpenCode-first | OpenCode has SDK/server/TUI APIs for prompt append, hidden session context, session messages, and file search. |
| Handoff style | Visible prompt plus hidden context | User sees the clean brief. OpenCode receives extra context without cluttering the prompt card. |
| Capture model | Local video buffer plus selected frames | Dense frame upload is noisy and expensive. Semantic keyframes give better signal. |
| Speech model | Live transcription plus saved audio artifact | Speech is core to OpenVysta. The transcript must be available while recording and replayable after capture. |
| Browser strategy | Universal capture, opportunistic DOM | Product works anywhere from pixels and speech, but browser contexts get route, DOM, console, network, and accessibility enrichment. |
| Code scouting | Optional read-only hypotheses | Scouting improves file guesses, but must stay confidence-tagged and non-authoritative. |
| Correction model | Recapture quickly | Faster and cleaner than complex editing UX in v1. |
| Visibility | Near-invisible during capture | The user should stay focused on their work. |
| Model orchestration | Invisible swarm | Users should see one product, not internal agent roles. |

### 7.1 Committed Stack Decision

Chosen stack:

| Layer | Choice | Timing | Rationale |
| --- | --- | --- | --- |
| Runtime | Bun with TypeScript | MVP | Fast local scripts/tests and simple TypeScript execution. |
| Compiler | TypeScript | MVP | Fast iteration, first-class OpenCode SDK fit, strong JSON/schema tooling. |
| OpenCode bridge | TypeScript with `@opencode-ai/sdk` and HTTP fallbacks | MVP | OpenCode's SDK exposes sessions, TUI prompt APIs, file search, and `noReply` context injection. |
| Prompt preview | Terminal CLI first | MVP | Enough to prove `Send`, `Retry`, `Cancel` without building a UI shell too early. |
| Model calls | OpenCode-configured model and model chooser | MVP | Use the user's available OpenCode model setup instead of introducing separate provider credentials. Must verify image-capable model path. |
| Eval harness | TypeScript scripts plus fixture folders | MVP | Keeps prompt quality measurable before native capture work. |
| Local artifacts | Filesystem first, SQLite when sessions need indexing | MVP-lite | Avoid database work until repeated sessions need querying. |
| Live macOS STT | Swift `AVAudioEngine` plus Apple Speech framework | Phase 2 | Correct path for while-recording interim transcript and macOS microphone permissions. |
| macOS capture | Swift / SwiftUI / AppKit, ScreenCaptureKit, AVFoundation | Phase 2 | Correct stack for global input, overlays, audio, screen capture, and macOS permissions. |
| Browser enrichment | Chrome extension in TypeScript, prefer `activeTab` | Phase 3 | Useful context, but not required to prove the core prompt compiler. |
| Code scout | OpenCode `find.*` and `file.read` APIs | Phase 4 or late Phase 1 spike | Read-only hypotheses only. Never pretend certainty. |

Recommendation:

```text
Build the Bun/TypeScript manual compiler and OpenCode bridge first. Do not start with Swift, Electron, or a browser extension.
```

Rejected first-stack options:

| Option | Why not first |
| --- | --- |
| Swift-first app | Great final UX, but too much permission and native UI work before proving prompt quality. |
| Tauri-first desktop app | Reasonable later wrapper, but still distracts from compiler and OpenCode handoff proof. Not part of MVP unless CLI preview proves insufficient. |
| Electron-first app | Fast UI, but heavy and not ideal for deep macOS capture. Adds product shell before core value is proven. |
| Browser-extension-first | Strong for web UIs, but narrows the product and adds permission friction before universal capture is validated. |
| Separate model-provider integration | Duplicates OpenCode provider setup and creates extra credential/config burden before the core handoff is proven. |
| External STT first | Audio is highly sensitive and not needed for first proof. Use Apple-native STT when native capture exists. |

Stack success criterion:

```text
The MVP stack is correct only if it lets one agent build and verify the compiler, bridge, preview, and eval loop before native capture begins.
```

Naming rules:

| Surface | Name |
| --- | --- |
| Repository/project | `openvysta` |
| CLI command | `openvysta` |
| Product name | `OpenVysta` |
| Action noun / product verb | `openvysta` (capture) |
| Run artifact prefix | `vysta_<timestamp>` |
| macOS helper product name | `OpenVysta` |
| Browser extension | `OpenVysta Browser Context` |

## 8. OpenCode Handoff Strategy

OpenCode supports the required handoff through its SDK and server APIs.

Relevant capabilities from OpenCode docs:

| Capability | Use |
| --- | --- |
| `client.tui.appendPrompt` | Place the compiled visible prompt into the current OpenCode prompt box. |
| `client.tui.submitPrompt` | Submit after explicit user action or optional future auto-send mode. |
| `client.session.prompt` with `noReply: true` | Inject hidden context into the session without triggering an assistant response. |
| `client.session.prompt` | Send direct prompt messages when running headless. |
| `client.find.text`, `client.find.files`, `client.find.symbols` | Support optional read-only scout passes. |
| OpenCode server `/tui/*` endpoints | Drive the TUI programmatically from the local OpenVysta helper. |

Recommended handoff flow:

```text
OpenVysta capture ends
-> context compiler builds hidden context packet
-> optional scout produces file/component hypotheses
-> OpenCode session receives hidden context with noReply
-> prompt card displays visible implementation brief
-> user chooses Send
-> OpenVysta appends visible prompt to OpenCode TUI
-> OpenVysta waits for user confirmation by default
```

Handoff fallbacks:

| Failure | Fallback |
| --- | --- |
| Hidden context injection fails | Save `hidden-context.json`, append a short visible note with the saved path, and never silently drop context. |
| TUI append fails | Copy the visible prompt to clipboard and show explicit paste instructions. |
| No active OpenCode session exists | Ask user to select an OpenCode server/session or start a new one. |
| OpenCode SDK unavailable | Save `visible-prompt.md` and `hidden-context.json` locally. |
| Session context behavior is ambiguous | Treat Phase 0 as blocked until verified against real OpenCode behavior. |

Fallback priority:

1. Inject hidden context with `session.prompt({ noReply: true })`.
2. If injection fails, save `hidden-context.json` locally.
3. Append a short visible note pointing to the saved hidden context path.
4. Copy the visible prompt only.
5. Never copy full hidden context to clipboard unless the user explicitly opts in.

Rule:

```text
Never silently drop context. Either inject it, show it, copy it, or save it.
```

## 8.1 Speech-to-Text Strategy

Speech is a first-class OpenVysta input. The product is not complete without a reliable path from spoken intent to timestamped transcript.

Recommended STT stack:

| Use Case | Stack | Why |
| --- | --- | --- |
| Native live capture | Swift `AVAudioEngine` + Apple Speech framework | Best fit for macOS microphone permissions, live partial transcripts, and native recording lifecycle. |
| Build-complete MVP | Manual transcript input, optional saved audio artifact | Avoids fake STT before native capture exists while preserving replayability. |

MVP STT rule:

```text
The build-complete MVP must require --transcript.
It may accept --audio only as an optional saved artifact.
If --audio is supplied without --transcript before Apple-native STT exists, fail loudly and ask for transcript input.
It must never pretend audio was transcribed.
```

Native capture rule:

```text
When macOS capture exists, audio is recorded locally and transcribed while recording.
Interim transcript text can update during capture, but the final prompt uses the finalized transcript artifact saved in the run folder.
```

Native STT artifact contract, Phase 2 only:

```text
inputs/audio/original.<ext>
transcript.md
transcript-segments.json
stt-result.json
```

Build-complete audio artifact contract:

```text
inputs/audio/original.<ext> only, if --audio is supplied.
Do not create normalized audio, transcript segments, or STT result files before Apple-native STT exists.
```

`transcript-segments.json` should preserve timestamps when available:

```ts
type TranscriptSegment = {
  startMs: number
  endMs: number
  text: string
  confidence?: number
  source: "apple-speech" | "manual"
}
```

STT defaults:

| Setting | Default |
| --- | --- |
| Build-complete text source | Required `--transcript` file. |
| Optional audio flag | `--audio`, stored only as an artifact before native STT exists. |
| Native STT source | Apple Speech framework in Phase 2. |
| Failure mode | Fail loudly and ask for transcript input; do not continue with fake transcript. |

Research notes:

```text
Apple Speech and AVAudioEngine are the intended native live macOS path.
Apple docs were checked but require JavaScript in the fetched pages.
No Whisper, local third-party STT, or cloud STT is in scope for now.
```

## 9. Capture UX

### 9.1 Invocation

The user invokes OpenVysta with a mouse button chord.

Recommended first implementation:

```text
Hold side mouse button + primary click, or configurable mouse chord
```

Fallback:

```text
Global keyboard shortcut for users without extra mouse buttons
```

### 9.2 During Capture

During capture, OpenVysta should show target emphasis only.

Target emphasis means the overlay subtly reinforces the cursor path, hover pauses, and likely referenced regions. It should not show a full transcript by default.

### 9.3 Release Feedback

On release, the system plays an auditory clickback.

The clickback confirms that OpenVysta caught the moment. This is mandatory because the full prompt may take seconds or longer to compile.

### 9.4 Prompt Card

The prompt card is docked over the editor.

Card actions:

```text
Send | Retry | Cancel
```

The card should not expose model stages by default.

## 10. Capture Pipeline

### 10.1 What Gets Captured Locally

OpenVysta locally captures:

| Signal | Purpose |
| --- | --- |
| Screen video ring buffer | Full-fidelity local replay and keyframe extraction. |
| Microphone audio | Speech transcription and intent extraction. |
| Cursor position timeline | Links words like "this" and "here" to visual regions. |
| Mouse chord state | Defines capture start and end. |
| Active app/window title | Basic context. |
| Screenshots/keyframes | Model-consumable visual evidence. |
| Browser metadata when available | Route, DOM, accessibility tree, console, network. |
| Repo path/OpenCode session | Handoff target. |

### 10.2 Do Not Upload Every 50ms

Every 50ms is roughly 20 frames per second. That is useful for local video but wrong for model ingestion.

Recommended approach:

```text
Record dense video locally.
Extract semantic frames for model input.
Upload selected frames and summaries only.
```

Frame selection triggers:

| Trigger | Example |
| --- | --- |
| Capture start | First view of target context. |
| Pointer pause | Cursor rests on a region while user says "this". |
| Speech deixis | Words like "this", "here", "that", "move this". |
| Significant visual change | Modal opens, state changes, screen navigates. |
| Click event | User clicks or marks a target. |
| Capture end | Final state. |
| Low-rate baseline | 1 to 2 frames per second during active speech if needed. |

### 10.3 Why Local Video Still Matters

Local video lets the compiler re-extract frames if the first selection is weak. It also enables future debugging, replay, and user review without forcing cloud upload of everything.

## 11. Browser Enrichment Layer

OpenVysta works everywhere, but it should become dramatically more precise in browser contexts.

Browser enrichment should collect:

| Signal | Why it matters |
| --- | --- |
| URL and route | Helps OpenCode map screen to app route. |
| DOM snapshot | Gives text, structure, classes, data attributes, and hierarchy. |
| Accessibility snapshot | Gives model-friendly semantic structure and bounding boxes. |
| Element under cursor | Best available link between pointing and UI object. |
| Console messages | Helps distinguish design request from runtime bug. |
| Page errors | Captures visible failures and stack hints. |
| Network failures | Useful for broken flows. |
| Viewport dimensions | Needed for above-the-fold and responsive claims. |

Implementation paths:

| Path | Pros | Cons |
| --- | --- | --- |
| Browser extension | Works with normal browsing, good UX. | Chrome permission and extension complexity. |
| Playwright sidecar | Rich API, ARIA snapshots, console/page errors. | Harder to attach to arbitrary existing browsers. |
| DevTools Protocol connector | Powerful for Chromium. | More engineering complexity. |

Recommendation for v1:

```text
Use browser extension for active-tab context.
Add Playwright/DevTools connector later for deeper controlled-localhost workflows.
```

## 12. Codebase Scout

The scout is a read-only hypothesis generator.

The scout should never decide implementation. Its job is to enrich the prompt with likely files/components and confidence.

Scout inputs:

| Input | Example |
| --- | --- |
| Route | `/dashboard` |
| DOM labels | `Start Journey`, `Progress`, `JourneyCard` |
| Data attributes | `data-testid="journey-card"` |
| Visible copy | Button text, headings, empty state text. |
| Repo structure | `app/dashboard/page.tsx`, `components/JourneyCard.tsx` |
| Framework hints | Next.js app router, React components, Tailwind classes. |

Scout outputs:

```json
{
  "likelyFiles": [
    {
      "path": "app/dashboard/page.tsx",
      "confidence": "medium",
      "reason": "Route and visible dashboard layout match capture context."
    }
  ],
  "likelyComponents": [
    {
      "name": "JourneyCard",
      "confidence": "low",
      "reason": "Visible card copy suggests this component name, but not confirmed."
    }
  ],
  "assumptions": [
    "File guesses are hypotheses. Inspect before editing."
  ]
}
```

Recommendation:

```text
v1 can skip scout for faster launch.
v1.1 should add read-only scout as hidden context.
Do not block prompt generation on scout unless the user enables precision mode.
```

## 13. Prompt Compiler

The prompt compiler transforms raw capture into a visible implementation brief and a hidden context packet.

### 13.1 Visible Prompt Shape

The visible prompt should be implementation-ready but honest about uncertainty.

Template:

```md
I captured a visual UI change request from the user.

Your job is to inspect the codebase, infer the relevant components/files, state assumptions when needed, and implement the smallest correct change.

## User Intent
[Clear explanation of what the user appears to want.]

## Visual Context
[What was on screen, what the cursor emphasized, what changed during capture.]

## Requested Changes
1. [Change]
2. [Change]
3. [Change]

## Constraints
- Preserve the current visual style unless explicitly asked otherwise.
- Do not change backend behavior unless necessary.
- Treat file/component guesses as hypotheses, not facts.
- Inspect first before editing.

## Likely Targets
- [Optional file/component hypothesis with confidence]

## Acceptance Criteria
- [Observable success condition]
- [Observable success condition]

## Ambiguity Notes
- [Potential alternate interpretation if relevant]
```

### 13.2 Hidden Context Packet

Hidden context should include detail that would clutter the prompt card.

Contents:

```json
{
  "captureId": "vysta_2026_06_07_001",
  "transcript": [],
  "selectedFrames": [],
  "cursorTimeline": [],
  "browserContext": {},
  "scoutHypotheses": {},
  "compilerNotes": [],
  "confidence": {}
}
```

## 14. System Architecture

```text
macOS Helper
  -> mouse chord listener
  -> audio capture
  -> screen video ring buffer
  -> overlay and target emphasis
  -> local session store

Browser Extension
  -> active tab route
  -> DOM/accessibility snapshot
  -> element under cursor
  -> console/page/network metadata

Context Compiler
  -> consumes transcript artifact
  -> keyframe selection
  -> visual summary
  -> intent extraction
  -> prompt generation

Code Scout
  -> OpenCode file/symbol/text search
  -> likely files/components
  -> confidence and assumptions

OpenCode Bridge
  -> hidden noReply context injection
  -> prompt card handoff
  -> TUI append/submit

Prompt Card UI
  -> Send
  -> Retry
  -> Cancel
```

## 15. Package Structure

Recommended repo shape:

```text
openvysta/
  apps/
    macos-helper/
    browser-extension/
  packages/
    capture-core/
    context-compiler/
    opencode-bridge/
    scout/
    shared-schema/
    prompt-card/
  docs/
    PRD.md
    architecture.md
    evals.md
```

If keeping the repository simpler for v1, start with:

```text
openvysta/
  src/
    capture/
    compiler/
    opencode/
    browser/
    ui/
  PRD.md
```

## 16. Suggested Tech Stack

| Layer | Recommendation | Notes |
| --- | --- | --- |
| Runtime | Bun with TypeScript | Build-complete MVP runtime. |
| macOS helper | Swift | Best native capture, permission control, audio capture, overlay, and Apple Speech integration. |
| Prototype helper | Terminal CLI | Avoid UI shell work before compiler/handoff proof. |
| Browser enrichment | Chrome extension, later | Best active-tab access and developer adoption, but not build-complete scope. |
| OpenCode bridge | TypeScript with `@opencode-ai/sdk` | Direct support for session and TUI APIs. |
| Local store | Filesystem first | Store run artifacts before adding SQLite. |
| Transcription | Apple Speech in native Phase 2 | Build-complete MVP requires manual transcript; optional audio is stored only. |
| Vision/reasoning | OpenCode-configured model | Use current/user-selected OpenCode model only. |
| Scout | OpenCode SDK file APIs | Read-only first. |

## 17. Data Model

```ts
type OpenVystaSession = {
  id: string
  createdAt: string
  repoPath?: string
  opencodeSessionId?: string
  activeApp?: string
  windowTitle?: string
  transcript: TranscriptSegment[]
  cursorEvents: CursorEvent[]
  selectedFrames: SelectedFrame[]
  browserContext?: BrowserContext
  scoutResult?: ScoutResult
  promptDraft?: PromptDraft
}

type TranscriptSegment = {
  startMs: number
  endMs: number
  text: string
}

type CursorEvent = {
  timestampMs: number
  x: number
  y: number
  kind: "move" | "pause" | "click" | "release"
}

type SelectedFrame = {
  id: string
  timestampMs: number
  path: string
  reason: "start" | "pointer_pause" | "speech_deixis" | "visual_change" | "click" | "end" | "baseline"
}

type BrowserContext = {
  url?: string
  title?: string
  route?: string
  viewport?: { width: number; height: number }
  elementUnderCursor?: ElementContext
  accessibilitySnapshot?: string
  consoleMessages?: string[]
  pageErrors?: string[]
  networkFailures?: string[]
}

type ScoutResult = {
  likelyFiles: ScoutHypothesis[]
  likelyComponents: ScoutHypothesis[]
  assumptions: string[]
}

type ScoutHypothesis = {
  name?: string
  path?: string
  confidence: "low" | "medium" | "high"
  reason: string
}

type PromptDraft = {
  title: string
  visiblePrompt: string
  hiddenContext: Record<string, unknown>
  confidence: "low" | "medium" | "high"
}
```

## 18. Privacy and Security Requirements

OpenVysta captures sensitive surfaces by design. Privacy cannot be an afterthought.

Default privacy posture:

```text
Nothing is captured unless the user intentionally invokes OpenVysta.
Raw video stays local by default.
Only selected frames, transcript, and explicitly needed metadata are sent to cloud models.
```

Required controls:

| Control | Requirement |
| --- | --- |
| Capture indicator | Always show or play feedback when capture starts and ends. |
| Local retention | User can delete local capture sessions. |
| Cloud indicator | Prompt card shows when selected context was sent to a cloud model. |
| Secret redaction | Redact likely API keys, auth headers, cookies, tokens, and `.env`-like values before cloud upload. |
| Network metadata | Do not upload request bodies or auth headers by default. |
| DOM metadata | Prefer local summarization before cloud upload when DOM is large or sensitive. |
| Browser permissions | Extension permissions should be narrow and explainable. |
| Repo context | Do not upload source files unless scout or user explicitly includes them. |
| Enterprise path | Future paid offer can include private deployment, audit logs, policy controls, and model allowlists. |

Phase 1 privacy scope:

```text
Manual inputs only. No automatic screen/audio/browser capture yet.
This lets prompt quality be validated before sensitive native capture is built.
```

Phase 1 minimum privacy artifacts:

| Artifact | Purpose |
| --- | --- |
| `sent-to-model.json` | Exact manifest of transcript, screenshots, metadata, and model target sent to cloud. |
| `redaction-report.json` | Records obvious text/metadata redactions, even if no redactions occurred. |
| `run.json` | Captures user-visible cloud warning acknowledgement and model configuration. |

MVP redaction scope:

```text
Redact obvious token-like strings in transcript and browser metadata. Warn before uploading screenshots. Do not attempt full image redaction in the one-shot MVP.
```

## 19. E2E Build Plan

The first implementation must validate prompt quality before native capture.

Native capture is not the MVP. The MVP is the compiler and OpenCode handoff.

One-shot MVP scope:

```text
Input: transcript text + 2 to 5 screenshot files + optional browser metadata JSON.
Process: OpenCode-configured image-capable model generates visible prompt and hidden context.
Preview: user sees a prompt card with Send, Retry, Cancel.
Send: OpenCode receives hidden context and visible prompt.
Fallback: if OpenCode handoff fails, write local artifacts and copy the prompt.
Eval: compare against manual prompts on 10 real UI tasks.
```

Expected MVP repository shape:

```text
src/compiler/                Transcript/screenshots/metadata -> prompt draft
src/opencode-bridge/         OpenCode SDK client and fallbacks
src/preview/                 CLI preview actions
scripts/                     Runnable compile/send scripts
docs/                        PRD, research, handoff notes
```

Do not create `apps/macos/` until Phase 2 is approved by the eval gate.

Do not create a monorepo unless the repository already has workspace structure or the user explicitly approves it.

### 19.0 Implementation Contract

Default CLI shape:

```bash
openvysta compile \
  --transcript ./input.md \
  --audio ./capture.m4a \
  --screenshots ./shots/1.png ./shots/2.png \
  --browser ./browser.json \
  --model current-opencode \
  --opencode-server http://localhost:4096 \
  --session-id <session-id> \
  --out ./.openvysta/runs
```

Required run artifacts:

```text
inputs/transcript.md
inputs/audio/original.<ext> if supplied
inputs/screenshots/<original-name>
inputs/browser.json
artifact-manifest.md
visible-prompt.md
hidden-context.json
sent-to-model.json
redaction-report.json
run.json
handoff-result.json
```

Local artifact-first rule:

```text
Every input is copied into the run folder before model or OpenCode handoff starts.
The generated prompt includes both relative and absolute paths to the local artifacts.
OpenCode handoff must remain useful even if SDK image/file parts fail.
```

Artifact manifest requirements:

| Field | Requirement |
| --- | --- |
| Run ID | Stable ID, prefixed with `vysta_`. |
| Root path | Absolute run folder path. |
| Transcript | Relative and absolute path. |
| Screenshots | Original filename, copied path, MIME type, dimensions if known. |
| Browser metadata | Relative and absolute path when supplied. |
| Hidden context | Relative and absolute path. |
| Visible prompt | Relative and absolute path. |

Prompt path-reference block:

```text
Context artifacts are saved locally:
- Run folder: <absolute-path>
- Transcript: <relative-path> (<absolute-path>)
- Screenshots:
  - <relative-path> (<absolute-path>)
- Browser metadata: <relative-path> (<absolute-path>)
- Hidden context: <relative-path> (<absolute-path>)

If image/file attachments are unavailable, inspect these local artifact paths directly before implementing.
```

Accepted input contract:

| Input | Requirement |
| --- | --- |
| Transcript | Required UTF-8 Markdown or plain text file for build-complete MVP. |
| Audio | Optional artifact only before native STT exists. Never treated as transcribed text. |
| Screenshots | 2 to 5 files, `.png`, `.jpg`, or `.jpeg`. |
| Browser metadata | Optional JSON file. No request bodies or auth headers by default. |
| Model | Defaults to the current OpenCode-configured model. User may choose another OpenCode-available model. |
| OpenCode server | CLI flag first, then `OPENCODE_SERVER_URL`, then `http://localhost:4096`. |
| Session ID | CLI flag first, then `OPENCODE_SESSION_ID`, then interactive/error state. Never hardcode. |
| Output path | Defaults to `./.openvysta/runs/<timestamp>/`. |

Optional browser metadata behavior:

```text
If no browser metadata is supplied, do not create fake browser context. Record `browserMetadata: "not_supplied"` in artifact-manifest.md and run.json.
```

Default screenshot policy:

```text
Accept PNG/JPEG. Resize or reject images above the provider's safe payload limits. Record final uploaded dimensions in sent-to-model.json.
```

Default preview behavior:

```text
Terminal preview with [s] Send, [r] Retry, [c] Cancel is sufficient for MVP.
Retry regenerates from the same saved inputs and creates a new attempt in the same run folder.
Send appends to OpenCode by default. Auto-submit is out of scope unless enabled by an explicit flag.
```

Testing contract:

| Test Type | Dependency Strategy |
| --- | --- |
| Unit tests | Mock OpenCode model and OpenCode TUI/session clients. |
| Fixture E2E | Use saved fixture inputs and mocked model output. |
| OpenCode proof | Run a manual/integration script against a real OpenCode session and save output in docs. |
| Model capability proof | Verify the selected OpenCode model can accept screenshot/file parts or explicitly fall back to text-only metadata. |
| Artifact-path proof | Verify OpenCode receives a prompt containing stable local paths for transcript, screenshots, browser metadata, and hidden context. |

Phase 0 must document the exact model invocation path:

```text
- Which OpenCode SDK/API method was used for compiler model calls.
- Which part shape was used for text and screenshots.
- Whether the selected model reported image input capability.
- Whether the model actually consumed screenshot/file parts in a test call.
- What fallback path was used if any step failed.
```

MVP implementation rules:

1. Prefer CLI plus local preview over app-shell polish.
2. Keep compiler schemas small and explicit.
3. Persist prompt artifacts as files before adding SQLite.
4. Use the user's OpenCode-configured model first, but always display what was sent.
5. Implement fallback paths before happy-path UI polish.
6. Treat browser metadata as optional pasted JSON, not an extension dependency.
7. Treat code scout as optional unless it can be added read-only without delaying the validation gate.
8. Use Bun for scripts, tests, and TypeScript execution unless the user changes this later.

Validation gate before Phase 2:

```text
Given transcript + screenshots + optional browser metadata, OpenVysta must produce prompts that are materially better than manual prompting on real UI tasks.
```

### Phase 0: Spike

Goal: prove that OpenCode can receive hidden context and visible prompt handoff.

Tasks:

1. Start an OpenCode session in a test repo.
2. Use SDK to call `session.prompt` with `noReply: true`.
3. Use SDK to call `tui.appendPrompt` with a generated prompt.
4. Confirm the TUI shows the visible prompt.
5. Confirm hidden context appears in session messages or affects the agent context.

Exit criteria:

```text
A script can inject hidden context and populate the OpenCode prompt box.
```

Required artifacts:

```text
src/opencode-bridge/index.ts
docs/phase-0-opencode-handoff.md
```

Phase 0 fails if any of these are true:

1. `session.prompt({ noReply: true })` cannot be verified against a real OpenCode session.
2. `tui.appendPrompt` cannot populate the active prompt input.
3. Failure handling silently drops context.
4. The bridge requires hardcoded server/session IDs.

Hard stop:

```text
Do not implement Phase 1 until real OpenCode server/session discovery, TUI append, and handoff behavior are proven and documented.
If hidden context injection is unreliable but TUI append works, build both paths: saved-context fallback becomes primary and hidden injection remains experimental.
If real OpenCode TUI append cannot be proven, stop and ask the user. Do not mark build-complete.
```

Phase 0 must also verify the selected OpenCode model path can process screenshot/file parts. If image input is unavailable, the build-complete MVP must clearly degrade to transcript plus browser metadata and mark screenshots as saved artifacts only.

Strong local workaround for model/file-part uncertainty:

```text
Always save all capture inputs as local run artifacts first.
Always include direct artifact paths in the visible prompt.
Attempt SDK file/image parts only as an enhancement.
If SDK attachments fail, the prompt still points OpenCode to the local transcript, screenshots, metadata, and hidden-context files.
```

This workaround does not fully replace multimodal image understanding. It guarantees replayability and handoff integrity. If the active OpenCode model cannot inspect images, the agent must use transcript/browser metadata plus saved screenshot paths and ask for clarification instead of pretending it saw the screenshots.

### Phase 1: Manual Capture Compiler

Goal: prove prompt quality before native capture complexity.

Tasks:

1. Accept a manually supplied transcript.
2. Accept 2 to 5 manually supplied screenshots.
3. Generate visible prompt and hidden context packet.
4. Accept optional browser metadata as pasted JSON.
5. Generate prompt card mock in a simple local UI or CLI preview.
6. Send visible prompt and hidden context to OpenCode through the bridge.
7. Run a small eval set against manual prompts.

Exit criteria:

```text
User can paste transcript/screenshots and get a prompt good enough to stop writing prompts manually for simple UI changes.
```

Required eval before continuing:

```text
Run 10 real UI change captures.
Compare OpenVysta prompt vs manual prompt.
Continue only if OpenVysta is faster or more accurate in at least 7 of 10 cases.
```

Required Phase 1 artifacts:

```text
src/compiler/index.ts
src/compiler/schema.ts
src/opencode-bridge/index.ts
src/preview/index.ts or scripts/preview.ts
```

Build-complete gate:

```text
Compiler, bridge, CLI preview, artifact writing, fallback handling, unit tests, and one fixture E2E pass.
```

Validation-complete gate:

```text
10 real UI tasks scored. OpenVysta wins at least 7 of 10 against manual prompts.
```

Phase 1 fails if any of these are true:

1. The generated prompt is mostly a transcript cleanup rather than an implementation brief.
2. The visible prompt hides uncertainty or invents file/component certainty.
3. The hidden context is required for correctness but cannot be recovered from saved artifacts.
4. The eval cannot distinguish manual prompt quality from OpenVysta prompt quality.
5. The app shell becomes the main work before the compiler is useful.

### Phase 2: macOS OpenVysta capture

Goal: implement the real ritual.

Tasks:

1. Add mouse chord detection.
2. Add audio capture.
3. Add live Apple Speech transcription while recording.
4. Save finalized transcript and timestamped transcript segments.
5. Add local screen video buffer.
6. Add cursor timeline collection.
7. Add auditory clickback on release.
8. Add near-invisible overlay and target emphasis.
9. Extract selected frames from capture.
10. Generate prompt card over editor.

Exit criteria:

```text
Hold mouse chord, speak and point, see interim transcript during recording, release, see prompt card built from finalized transcript plus visual context.
```

### Phase 3: Browser Enrichment

Goal: improve precision for web UI work.

Tasks:

1. Build Chrome extension.
2. Capture active tab URL/title/viewport.
3. Capture element under cursor.
4. Capture DOM or accessibility snapshot around cursor.
5. Capture console/page errors.
6. Capture failed network requests.
7. Merge browser context into hidden packet.

Exit criteria:

```text
Browser captures produce visibly better prompts than pixel-only captures.
```

### Phase 4: Code Scout

Goal: add likely files/components without pretending certainty.

Tasks:

1. Use OpenCode SDK search APIs for file/text/symbol discovery.
2. Build route-to-file heuristics for common frameworks.
3. Search visible copy in repo.
4. Search data attributes and component-like labels.
5. Generate confidence-tagged hypotheses.
6. Inject scout result as hidden context.
7. Optionally include top hypotheses in visible prompt.

Exit criteria:

```text
Prompt includes useful file/component hypotheses in at least 60 percent of browser UI captures without causing harmful false certainty.
```

### Phase 5: Evals and Reliability

Goal: harden and expand the eval suite after native capture exists.

Tasks:

1. Expand to 30 golden UI capture examples.
2. Compare manual prompt vs OpenVysta prompt across multiple apps.
3. Measure first-pass OpenCode success.
4. Measure time from intent to submitted prompt.
5. Track false-target failures.
6. Track prompt rewrite frequency.

Exit criteria:

```text
The creator uses OpenVysta as default for UI change prompts for one full workday.
```

### 19.1 Agent Handoff Runbook

This project should be handed to an agent sequence, not a single unconstrained build prompt.

Recommended OpenCode agent choreography:

The primary agent is an orchestrator only. It must not directly write code, edit files, or run mutating commands. Its job is to read, plan, ask decisions, delegate to subagents, inspect results, and decide the next handoff.

If required skills or subagents are unavailable, the orchestrator must stop and ask the user. It must not self-implement as a workaround.

Required skills for the orchestration session:

| Skill | When to load |
| --- | --- |
| `test-driven-development` | Before any implementation subagent writes production code. |
| `systematic-debugging` | Before attempting fixes for test failures, integration failures, or unexpected OpenCode behavior. |
| `verification-before-completion` | Before any agent claims build-complete, passing, or ready. |
| `requesting-code-review` or `code-review-expert` | Before accepting implementation output. |

Subagent loop budget:

```text
Maximum six build-review-correction iterations.
Each iteration must have one builder subagent, one reviewer subagent, and one correction decision.
Stop early if acceptance passes. Stop immediately if two consecutive iterations fail for the same reason and ask the user.
```

| Step | Agent Role | Output | Stop Gate |
| --- | --- | --- | --- |
| 1 | Read-only orchestrator | Implementation plan and file map | No edits by orchestrator. Plan names exact MVP scope. |
| 2 | Scout/research subagent | Updated external-doc assumptions | Must cite OpenCode SDK/TUI and Apple Speech docs where possible. |
| 3 | Builder subagent | Phase 0 bridge proof | Must prove OpenCode handoff against a real OpenCode session. Mocks are only allowed for automated tests. |
| 4 | Reviewer subagent | Phase 0 review | Blocks on silent context loss, hardcoded IDs, unhandled failures, or fake STT. |
| 5 | Builder subagent | Phase 1 compiler and preview | Must generate visible prompt plus hidden context from fixtures. |
| 6 | Reviewer subagent | Compiler quality review | Blocks on hallucinated certainty, weak schema, no eval path, or missing artifact paths. |
| 7 | Builder subagent | Corrections | Fix only review findings, avoid new scope. |
| 8 | Verification subagent | Test/eval report | Must run unit checks and at least one end-to-end fixture. |
| 9 | Devil's advocate subagent | Critical launch assessment | Must score readiness and list remaining blockers. |

Minimum back-and-forth loop:

```text
Read-only orchestrator -> builder subagent -> reviewer subagent -> correction subagent if needed -> verification subagent -> final reviewer -> decide whether to continue.
```

Agent anti-overbuild rules:

1. Do not build native macOS capture in the one-shot MVP.
2. Do not build the Chrome extension in the one-shot MVP.
3. Do not add authentication, accounts, payments, teams, or enterprise controls.
4. Do not add SQLite until the filesystem artifact approach becomes painful.
5. Do not make code scout mandatory for prompt correctness.
6. Do not invent a full design system for the preview UI.
7. Do not optimize for every model/provider path before the current OpenCode-configured model path works.
8. Do not mark validation-complete from one fixture. One fixture only proves build-complete.
9. Do not fake speech-to-text. Build-complete requires manual transcript; audio is optional artifact until Apple-native STT exists.
10. Do not let the primary orchestrator write code directly.

### 19.2 One-Shot MVP Agent Prompt

Use this prompt when handing implementation to an agent:

```text
You are building the OpenVysta one-shot MVP from PRD.md.

Goal:
Build a TypeScript manual compiler and OpenCode bridge that accepts transcript text, 2 to 5 screenshots, and optional browser metadata JSON, then generates a visible implementation prompt plus hidden context packet, previews it, and sends it to OpenCode with safe fallbacks.

Orchestration rule:
The primary agent is read-only. It must not directly write code or mutate files. It must load relevant skills, then delegate implementation, review, correction, and verification to subagents. Use at most six build-review-correction iterations.
If required skills or subagents are unavailable, stop and ask the user. Do not self-implement.

Hard constraints:
- Do not build native macOS capture.
- Do not build a Chrome extension.
- Do not add accounts, payments, teams, or enterprise controls.
- Do not silently drop context.
- Do not claim file/component certainty unless evidence exists.
- Do not fake speech-to-text. Build-complete requires transcript input; optional audio is stored only.
- Do not add Whisper, cloud STT, or local third-party STT.
- Keep the repository simple and testable.

Required phases:
1. Inspect PRD.md and current repository.
2. Load relevant skills: test-driven-development, systematic-debugging when debugging, verification-before-completion, and code-review/requesting-code-review before acceptance.
3. Produce a concise implementation plan and wait for review if requirements are ambiguous.
4. Delegate Phase 0 OpenCode bridge proof to a builder subagent.
5. Delegate Phase 0 review to a reviewer subagent.
6. Delegate Phase 1 compiler, schemas, preview/send flow, and fixture-based eval harness to a builder subagent.
7. Delegate tests for schema validation, compiler output shape, fallback behavior, and one end-to-end fixture.
8. Delegate verification and critical review to separate subagents.
9. Fix blocking findings only through delegated correction subagents.

Acceptance:
- A fixture can produce visible prompt and hidden context artifacts.
- The bridge can inject hidden context with `noReply: true` or fall back to saved hidden context plus visible prompt clipboard instructions.
- The terminal preview exposes [s] Send, [r] Retry, [c] Cancel.
- At least one end-to-end local fixture runs successfully.
- The eval harness can store 10 manual-vs-OpenVysta scorecards.
- The result clearly distinguishes build-complete from validation-complete.
```

### 19.3 Open Questions Before Build

The MVP can start with assumptions, but these choices should be confirmed before implementation hardens:

| Question | Default Assumption | Why It Matters |
| --- | --- | --- |
| First model path | Use the current OpenCode-configured model or user-selected OpenCode model | Avoids separate provider credentials, but requires image-capability verification. |
| Preview surface | Start with CLI; add local web preview only if cheap | Avoids desktop-shell work before compiler proof. |
| Artifact location | `./.openvysta/runs/<timestamp>/` | Keeps generated artifacts obvious and git-ignorable. |
| Send behavior | Append prompt and wait for user confirmation by default | Safer than auto-submit while prompt quality is unproven. |
| Eval scoring | Human-scored scorecard first | Automated success is hard before real code changes are observed. |
| Clipboard fallback | Allowed for visible prompt only | Hidden context may be too large or sensitive for clipboard by default. |
| Auto-submit | Off by default | User should inspect the compiled prompt until prompt quality is proven. |
| Package structure | Simple `src/` structure if repo is empty | Avoids monorepo setup before there is a reason. |
| Runtime | Bun | User selected Bun for the TypeScript MVP. |
| Phase 0 fallback | Build both paths if hidden injection is unreliable | Saved-context fallback becomes primary, hidden injection remains experimental. |
| Next milestone | Build-complete only | 10-task validation comes after scaffolding and one fixture E2E. |

Recommended defaults:

```text
Model path: current/user-selected OpenCode model only; no separate provider integration.
Preview: terminal CLI first; no web card unless separately approved.
Artifacts: ./.openvysta/runs/ ignored by git.
Send behavior: append, do not auto-submit by default.
Eval scoring: human scorecard with simple 0/1 win field.
Auto-submit: disabled unless explicit flag is set.
Runtime: Bun.
Next target: build-complete only.
```

## 20. Success Metrics

Primary success metric:

```text
The user stops writing prompts manually for visual UI changes.
```

Product metrics:

| Metric | Target |
| --- | --- |
| Manual compiler win rate | At least 7 of 10 real tasks before native capture starts. |
| Prompt generation time from manual inputs | Under 30 seconds for Phase 1. |
| User edits before sending | Fewer than 3 meaningful edits on successful captures. |
| Capture start friction | One mouse chord. |
| Prompt card appearance | Under 10 seconds for normal captures. |
| Deep enrichment | May continue after initial card if needed. |
| Prompt rewrite rate | Under 30 percent after first week of use. |
| Recapture rate | Under 20 percent for normal UI changes. |
| First-pass OpenCode relevance | Subjective high rating in 70 percent of captures. |

## 21. Acceptance Criteria for MVP

Build-complete MVP is complete when:

1. User can provide transcript and 2 to 5 screenshots manually.
2. User can optionally provide browser metadata as a JSON file.
3. User can optionally provide audio, but audio is stored only and not transcribed in build-complete MVP.
4. Phase 0 real OpenCode server/session discovery and TUI append are proven and documented.
5. The compiler generates an implementation-ready visible prompt.
6. The compiler generates a hidden context packet.
7. A terminal prompt preview appears with `[s] Send`, `[r] Retry`, and `[c] Cancel`.
8. On `Send`, hidden context is injected into OpenCode or saved as documented fallback, and visible prompt is appended. Auto-submit is not default MVP behavior.
9. If OpenCode hidden context injection fails, `hidden-context.json` is saved, the visible prompt references it, and the user sees explicit fallback instructions.
10. The visible prompt is honest about uncertainty and asks OpenCode to inspect first.
11. The user completes at least one real UI change through OpenCode using OpenVysta output.
12. Unit tests and one fixture E2E pass.

Validation-complete MVP is complete when:

1. 10 real UI tasks are scored with the PRD scorecard.
2. OpenVysta prompts beat manual prompts on at least 7 of 10 real UI tasks.
3. Native macOS capture remains blocked until this gate passes.

## 22. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Product becomes just a screen recorder | High | Keep positioning and UI centered on intent compilation, not recordings. |
| DOM/computer-use products commoditize browser work | High | Use DOM as enrichment, not identity. Focus on human-to-agent intent. |
| Prompt quality not good enough | High | Build a golden validation suite before overbuilding capture infrastructure. |
| MVP scope expands into native capture too early | High | Treat Phase 0 and Phase 1 as the only MVP scope. Gate Phase 2 on eval results. |
| Screen/audio/browser capture leaks sensitive data | High | Require explicit capture moments, local-first storage, redaction, and visible cloud-upload indicators. |
| OpenCode hidden-context assumptions fail | High | Verify in Phase 0 and implement visible/clipboard/file fallbacks. |
| Agent builds the shiny native shell first | High | Give the implementation agent this PRD and enforce the Phase 0/1 stop gates. |
| Cloud model costs or latency make the validation suite painful | Medium | Start with small screenshots, model abstraction, and cached fixture outputs. |
| Provider-specific APIs leak into compiler logic | Medium | Keep provider code behind one compiler adapter boundary. |
| Preview UI consumes too much time | Medium | Accept CLI preview first; UI polish is not core value. |
| False file/component guesses mislead OpenCode | Medium | Mark scout results as hypotheses with confidence and reasons. |
| Capture feels creepy | Medium | Explicit mouse chord, auditory clickback, visible local/cloud indicators. |
| Latency kills the ritual | Medium | Separate immediate acknowledgement, prompt card, and optional deep refinement. |
| macOS permissions are painful | Medium | Invest early in onboarding and permission state UX. |

## 23. Challenge Assessment

The product is weak if it is framed as AI operating a UI. Anthropic, OpenAI, Playwright, and browser harnesses are already moving there.

The product is strong if it is framed as the missing human-intent interface for coding agents.

Direct DOM/component interaction does not invalidate OpenVysta. It enriches it. DOM tools help machines understand and manipulate software. OpenVysta helps humans express ambiguous visual intent to those machines.

## 24. Recommended Next Step

Build Phase 0 and Phase 1 before native capture.

The riskiest assumption is not whether screen/audio capture is possible. It is whether the compiled prompt is materially better than what the user would have written manually.

Immediate next implementation target:

```text
Create a CLI/script that accepts transcript + screenshots + optional browser metadata, generates visible prompt + hidden context, and hands both to OpenCode.
```

Only after prompt quality is proven should the team invest heavily in the native macOS capture layer.

## 25. Research References

OpenCode SDK and server APIs: https://opencode.ai/docs/sdk

OpenCode TUI APIs: https://opencode.ai/docs/tui

OpenCode agents: https://opencode.ai/docs/agents

OpenCode skills: https://opencode.ai/docs/skills

OpenCode server architecture: https://opencode.ai/docs/server

Apple ScreenCaptureKit: https://developer.apple.com/documentation/screencapturekit

Chrome `activeTab` permission: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab

Chrome match patterns: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

Anthropic computer use: https://docs.anthropic.com/en/docs/agents-and-tools/computer-use

OpenAI computer use: https://platform.openai.com/docs/guides/tools-computer-use

Playwright page APIs and ARIA snapshots: https://playwright.dev/docs/api/class-page

NN/g direct manipulation: https://www.nngroup.com/articles/direct-manipulation/

NN/g visibility of system status: https://www.nngroup.com/articles/visibility-system-status/

NN/g response-time limits: https://www.nngroup.com/articles/response-times-3-important-limits/

NN/g progress indicators: https://www.nngroup.com/articles/progress-indicators/
