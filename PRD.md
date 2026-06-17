# OpenVysta PRD

Date: 2026-06-16
Status: Draft v0.2
Owner: Sebastian Lungu
Product action name: OpenVysta
Primary integration: OpenCode

## 1. Product Thesis

OpenVysta is a zero-friction multimodal intent compiler for coding agents.

The product lets the user hold a mouse chord, speak naturally while pointing at the screen, release, and receive a high-quality implementation prompt docked over the editor. The core job is grounded translation:

```text
spoken intent + visible UI + cursor emphasis + timing + app/code context -> precise development brief
```

OpenVysta is not primarily a screen recorder, bug reporter, browser automation tool, dictation app, or DOM operator.

## 2. Core Problem

Coding agents still struggle with vague visual intent.

Users often know exactly what they mean while looking at a UI, but translating that into a written engineering prompt is slow and lossy. The missing layer is the intent compiler between human visual feedback and agent implementation.

## 3. Product Promise

Primary promise:

```text
Stop writing prompts manually. Capture what you mean.
```

OpenVysta succeeds only if the compiled prompt already reflects what was visible, what the user pointed at, and what should be built. It fails if the downstream coding agent still has to infer the screen for the first time.

## 4. Scope Boundary

OpenVysta compiles prompts from these evidence sources only:

- Transcript text
- Timestamped transcript segments when available
- Screenshots or selected frames
- Cursor timeline
- Optional local audio artifacts
- Optional local video artifacts
- Native capture metadata that is not browser-derived
- OpenCode handoff configuration

OpenVysta does not collect, accept, store, infer from, or hand off:

- Browser DOM data
- Browser route, URL, or title
- Browser accessibility trees or element-under-cursor DOM context
- Console messages, page errors, or network failures
- Browser extension output
- Browser-driven scout results

This is a permanent product boundary, not a deferred roadmap item.

## 5. Non-Goals

Launch will not include:

- Live steering of an agent while it is coding
- Replacement for OpenCode
- Manual screenshot annotation
- PM or designer handoff flows
- Cross-platform desktop support
- Default upload of full-resolution video
- Exact file/component certainty unless evidence supports it
- Browser/DOM enrichment or browser extensions
- Code scouting based on browser context

## 6. Key Architectural Choices

| Decision | Choice | Rationale |
| --- | --- | --- |
| Host platform | macOS first | Best first path for mouse chord capture, audio permissions, screen capture, and developer adoption. |
| Agent integration | OpenCode-first | OpenCode provides the SDK/server/TUI APIs needed for prompt append and hidden-context injection. |
| Handoff style | Visible prompt plus hidden context | User sees the clean brief; OpenCode receives extra context without cluttering the prompt card. |
| Capture model | Local video buffer plus selected frames | Dense frame upload is noisy and expensive; semantic keyframes carry the useful signal. |
| Speech model | Manual transcript for MVP, Apple Speech in native capture | Avoid fake STT before native capture exists. |
| Evidence contract | Pixels, speech, cursor, local artifacts | Keeps the product centered on grounded prompt quality. |
| Correction model | Recapture quickly | Faster and cleaner than complex editing UX in v1. |

## 7. Current Stack

| Layer | Choice | Timing | Rationale |
| --- | --- | --- | --- |
| Runtime | Bun with TypeScript | MVP | Fast local scripts/tests and simple TypeScript execution. |
| Compiler | TypeScript | MVP | Fast iteration and strong fit with the OpenCode SDK. |
| OpenCode bridge | TypeScript with `@opencode-ai/sdk` and HTTP fallbacks | MVP | Supports sessions, TUI prompt APIs, and `noReply` context injection. |
| Prompt preview | Terminal CLI first | MVP | Enough to prove `Send`, `Retry`, and `Cancel` without building a UI shell too early. |
| Local artifacts | Filesystem first | MVP | Keep runs audit-ready before adding persistence layers. |
| Native capture | Swift / SwiftUI / AppKit / ScreenCaptureKit / AVFoundation | Phase 2 | Correct stack for mouse chord capture, audio, screen capture, and macOS permissions. |
| Native live STT | Apple Speech framework | Phase 2 | Best fit for live macOS transcription. |

Recommendation:

```text
Build and validate the compiler plus OpenCode handoff first. Keep native capture separate and do not add browser context work.
```

## 8. OpenCode Handoff Strategy

OpenVysta is OpenCode-first.

Relevant capabilities:

| Capability | Use |
| --- | --- |
| `client.tui.appendPrompt` | Place the visible prompt into the current OpenCode prompt box. |
| `client.session.prompt` with `noReply: true` | Inject hidden context into the session without triggering an assistant response. |
| `client.session.prompt` | Send direct prompt messages when running headless. |
| OpenCode server `/tui/*` endpoints | Drive the TUI programmatically from the local helper. |

Recommended handoff flow:

```text
Capture ends
-> compiler builds visible prompt + hidden context
-> OpenCode session receives hidden context with noReply
-> user previews prompt
-> user chooses Send
-> OpenVysta appends visible prompt to OpenCode TUI
```

Fallbacks:

| Failure | Fallback |
| --- | --- |
| Hidden context injection fails | Save `hidden-context.json` locally and never silently drop context. |
| TUI append fails | Save `visible-prompt.md` locally and show explicit manual-paste fallback. |
| No active OpenCode session exists | Ask user to select or start an OpenCode session. |
| OpenCode SDK unavailable | Save artifacts locally and surface explicit recovery steps. |

Rule:

```text
Never silently drop context. Either inject it, show it, copy it, or save it.
```

## 9. Visual Grounding Contract

The compiled prompt is the product.

The visible prompt must answer, before handoff:

1. What did the user ask for?
2. What was visible?
3. What was pointed at?
4. What should the coding agent do?

Preferred visible prompt structure:

```text
Intent: what the user asked for, in one sentence.
Observed: the concrete UI/source facts that matter.
Target: what "this/here/same" refers to, with confidence.
Do: the implementation request, adapted to the user's app.
Acceptance: 2-4 observable checks specific to this capture.
```

The visible prompt must not tell the downstream coding agent to inspect screenshots as its first understanding step.

## 10. Accepted Evidence Contract

### 10.1 Input Contract

| Input | Requirement |
| --- | --- |
| Transcript | Required UTF-8 Markdown or plain text file for build-complete MVP. |
| Screenshots | 1 to 20 files, `.png`, `.jpg`, or `.jpeg`. |
| Audio | Optional artifact only before native STT exists. Never treated as transcribed text. |
| Video | Optional local artifact. |
| Model | Defaults to the current OpenCode-configured model. User may choose another OpenCode-available model. |
| OpenCode server | CLI flag first, then `OPENCODE_SERVER_URL`, then `http://localhost:4096`. |
| Session ID | CLI flag first, then `OPENCODE_SESSION_ID`, then automatic discovery or explicit failure. |
| Output path | Defaults to `./.openvysta/runs/<run-id>/`. |

### 10.2 Artifact Contract

Each run produces:

```text
inputs/transcript.md
inputs/screenshots/<original-name>
inputs/audio/original.<ext>        if supplied
inputs/video/capture-original.<ext> if supplied
artifact-manifest.md
visible-prompt.md
hidden-context.json
sent-to-model.json                 when sent
redaction-report.json
run.json
handoff-result.json                when handoff runs
```

### 10.3 Hidden Context Contract

Hidden context may include:

- Transcript text
- Transcript artifact path
- Screenshot artifact paths
- Optional audio/video paths
- Manifest path
- Hidden-context path
- Visible-prompt path

Hidden context must not include browser-shaped or scout-shaped fields.

## 11. Privacy and Security Requirements

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
| Cloud indicator | Preview/handoff UI shows when selected context was sent to a cloud model. |
| Secret redaction | Redact likely API keys, tokens, cookies, and `.env`-like values before cloud upload. |
| Repo context | Do not upload source files unless explicitly included by the user or a separate approved workflow. |

MVP redaction scope:

```text
Redact obvious token-like strings in transcript text. Warn before uploading screenshots. Do not attempt full image redaction in the MVP.
```

## 12. MVP Build Plan

The MVP is the compiler and OpenCode handoff, not native capture.

One-shot MVP scope:

```text
Input: transcript text + screenshots + optional audio/video artifacts.
Process: OpenCode-configured image-capable model generates visible prompt and hidden context.
Preview: user sees a prompt preview with Send, Retry, Cancel.
Send: OpenCode receives hidden context and visible prompt.
Fallback: if OpenCode handoff fails, write local artifacts and surface explicit recovery.
Eval: compare against manual prompts on real UI tasks.
```

Implementation rules:

1. Prefer CLI plus local preview over app-shell polish.
2. Keep compiler schemas small and explicit.
3. Persist prompt artifacts as files before adding databases.
4. Use the user's OpenCode-configured model first, but always display what was sent.
5. Implement fallback paths before happy-path UI polish.
6. Keep the repository simple and testable.

## 13. Phases

### Phase 0: OpenCode Proof

Goal: prove that OpenCode can receive hidden context and visible prompt handoff.

Exit criteria:

```text
A script can inject hidden context and populate the OpenCode prompt box.
```

### Phase 1: Manual Capture Compiler

Goal: prove prompt quality before native capture complexity.

Tasks:

1. Accept a manually supplied transcript.
2. Accept manually supplied screenshots.
3. Generate visible prompt and hidden context.
4. Generate a prompt preview in CLI.
5. Send visible prompt and hidden context to OpenCode through the bridge.
6. Run a small eval set against manual prompts.

Exit criteria:

```text
User can supply transcript/screenshots and get a prompt good enough to stop writing prompts manually for simple UI changes.
```

### Phase 2: Native macOS Capture

Goal: implement the full ritual.

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
10. Generate prompt card over the editor.

Exit criteria:

```text
Hold mouse chord, speak and point, release, and receive a prompt built from finalized transcript plus visual context.
```

There is no browser-enrichment phase on the roadmap.

## 14. Success Metrics

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
| Prompt rewrite rate | Under 30 percent after first week of use. |
| Recapture rate | Under 20 percent for normal UI changes. |
| First-pass OpenCode relevance | Subjective high rating in 70 percent of captures. |

## 15. Acceptance Criteria

Build-complete MVP is complete when:

1. User can provide transcript and screenshots manually.
2. User can optionally provide audio/video artifacts, but they are stored only and not auto-transcribed in the MVP.
3. Phase 0 real OpenCode server/session discovery and TUI append are proven and documented.
4. The compiler generates an implementation-ready visible prompt.
5. The compiler generates a hidden context packet.
6. A prompt preview appears with `Send`, `Retry`, and `Cancel`.
7. On send, hidden context is injected into OpenCode or saved as documented fallback, and visible prompt is appended.
8. If OpenCode hidden-context injection fails, `hidden-context.json` is saved and the user sees explicit fallback instructions.
9. The visible prompt is honest about uncertainty.
10. The user completes at least one real UI change through OpenCode using OpenVysta output.
11. Unit tests and one fixture E2E pass.

Validation-complete MVP is complete when:

1. 10 real UI tasks are scored with the PRD scorecard.
2. OpenVysta prompts beat manual prompts on at least 7 of 10 real UI tasks.
3. Native macOS capture remains blocked until this gate passes.

## 16. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Product becomes just a screen recorder | High | Keep positioning and UX centered on intent compilation, not recordings. |
| Prompt quality is not good enough | High | Build a grounded validation suite before overbuilding capture infrastructure. |
| MVP scope expands into native capture too early | High | Treat Phase 0 and Phase 1 as the only MVP scope. |
| Screen/audio capture leaks sensitive data | High | Require explicit capture moments, local-first storage, redaction, and visible upload indicators. |
| OpenCode hidden-context assumptions fail | High | Verify in Phase 0 and implement visible/file fallbacks. |
| Preview UI consumes too much time | Medium | Accept CLI preview first; polish is not the core value. |
| macOS permissions are painful | Medium | Invest early in onboarding and permission-state UX. |

## 17. Recommended Next Step

Build and validate Phase 0 and Phase 1 before expanding native capture.

Immediate next implementation target:

```text
Create a CLI/script that accepts transcript + screenshots, generates visible prompt + hidden context, and hands both to OpenCode.
```

## 18. Research References

- OpenCode SDK and server APIs: https://opencode.ai/docs/sdk
- OpenCode TUI APIs: https://opencode.ai/docs/tui
- OpenCode agents: https://opencode.ai/docs/agents
- OpenCode skills: https://opencode.ai/docs/skills
- OpenCode server architecture: https://opencode.ai/docs/server
- Apple ScreenCaptureKit: https://developer.apple.com/documentation/screencapturekit
- NN/g direct manipulation: https://www.nngroup.com/articles/direct-manipulation/
- NN/g visibility of system status: https://www.nngroup.com/articles/visibility-system-status/
- NN/g response-time limits: https://www.nngroup.com/articles/response-times-3-important-limits/
- NN/g progress indicators: https://www.nngroup.com/articles/progress-indicators/
