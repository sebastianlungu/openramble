# OmniCaptain Agent Guidance

## Product Philosophy

OmniCaptain/Omnicapture is a zero-friction multimodal intent compiler for coding agents.

The user should be able to hold a mouse chord, speak naturally while pointing at the screen, release, and get an implementation-ready prompt that proves the system understood what they meant. The product is not a screen recorder, transcript cleaner, bug-report template, dictation tool, or generic prompt generator.

The magic is not "we saved screenshots." The magic is grounded translation:

```text
spoken intent + visible UI + cursor emphasis + timing + app/code context -> precise development brief
```

If the output only says "inspect the screenshots" without first extracting the obvious visual structure, it has failed the core product promise.

The compiled prompt is the product. Hidden context, manifests, raw frames, cursor logs, and transcripts are compiler inputs and audit trails, not a substitute for interpretation. The user should receive a clean prompt that is already fully aware of the visual context.

For visual captures, screenshots and image understanding are mandatory. If screenshots are missing or no image-capable understanding path is available, fail hard before handoff. Do not create a fake-safe prompt that asks the downstream coding agent to inspect images for the first time.

## Non-Negotiable Standard

Every visual/UI OmniCapture prompt must answer four questions before asking an implementation agent to code. For non-visual captures, state that visual evidence is not applicable rather than inventing it.

| Question | Required Standard | Failure Mode |
| --- | --- | --- |
| What did the user ask for? | Quote or tightly paraphrase the spoken intent. | Generic task summary detached from the transcript. |
| What was visible? | Describe concrete UI elements, layout, labels, state, and styling visible in the selected frames. | "Screenshots are available; inspect them." |
| What was pointed at? | Align cursor pauses/clicks/deictic words like "this," "here," and "same" to regions or admit the alignment is missing. | Treating cursor data as trivia instead of intent evidence. |
| What should the coding agent do? | Produce a bounded, observable implementation brief with acceptance criteria. | Open-ended prompt that forces the coding agent to rediscover the request. |

The final compiled prompt should be brief but complete. Prefer five task-specific sections:

```text
Intent: what the user asked for, in one sentence.
Observed: the concrete UI/source facts that matter.
Target: what "this/here/same" refers to, with confidence.
Do: the implementation request, adapted to the user's app.
Acceptance: 2-4 observable checks specific to this capture.
```

Move repeated boilerplate, artifact listings, generic constraints, and raw evidence dumps out of the visible prompt. Keep artifacts available for audit/replay, but never make artifact inspection the first step of the downstream coding agent's understanding.

## Critical Ranking Of Current Weaknesses

Current as of 2026-06-12. Update this table when fixes land so agents do not optimize against stale weaknesses.

| Rank | Importance | Problem | Why It Is Bad | Fix Standard |
| --- | --- | --- | --- | --- |
| 1 | Existential | Visual understanding is deferred to the downstream coding agent. | OmniCapture's whole value is doing the multimodal interpretation before handoff. Deferring it makes the product a fancy artifact copier. | The compiler/enricher must summarize visible UI facts from screenshots or explicitly block/ask when it cannot. |
| 2 | Existential | Deictic speech is not resolved. | Requests like "make this like here" are the primary use case. If "this/here" remains unresolved, the prompt is worthless. | Align transcript segments, cursor pauses, clicks, and frames into a short target map. |
| 3 | Critical | Screenshot timing and cursor coverage gaps are reported but not acted on. | Warning text is not enough; the product must choose better frames or lower confidence. | Missing coverage must trigger re-extraction, clarification, or a visibly low-confidence handoff. |
| 4 | Critical | The prompt is too safe and too vague. | Safety language without extracted facts creates a bureaucratic prompt that still makes the coding agent guess. | Lead with concrete observed UI structure, then constraints and uncertainty. |
| 5 | High | No quality gate for "I understood the screen." | Evals can pass on easy text tasks while the core visual product rots. | Score each run for visual specificity, target alignment, uncertainty honesty, and implementation usefulness. |
| 6 | High | Model capability mismatch is tolerated. | Local screenshot paths do not give image understanding to a text-only model. Pretending otherwise is product gaslighting. | If no image-capable path exists, use a dedicated vision step, browser context, human clarification, or block. |
| 7 | High | Browser context is optional but not treated as a precision multiplier. | For web UI, DOM/accessibility/route data can remove ambiguity cheaply. | Prefer explicit user-gesture capture of active-tab context when available. |
| 8 | Medium | Artifact manifests are treated as enough. | Artifacts preserve replayability, but users pay for interpretation, not storage. | Keep artifacts as audit links, not visible prompt filler. |
| 9 | Medium | Acceptance criteria are generic. | "Matches requested behavior" cannot catch visual misunderstanding. | Acceptance must name the target screen, copied structure, adapted labels, and visual parity expectations. |
| 10 | Medium | Product language is not ruthless enough. | Agents optimize for plausible completion unless told that vague outputs are failures. | Reject prompts that do not materially reduce ambiguity for the implementation agent. |

## Visual Grounding Contract

Before producing a visible prompt, the agent/compiler must inspect or receive a visual summary of every selected frame.

For each frame, capture:

- Timestamp or ordering.
- Frame reason, such as start, pointer pause, speech deixis, click, visual change, or end.
- Active app/window/browser route when available.
- Primary visible screen or panel.
- Visible headings, tabs, nav items, buttons, form fields, labels, and metrics.
- Layout structure, such as sidebar, header, cards, table, chart, empty state, modal, or split pane.
- Styling signals that matter for implementation, such as dark/light theme, density, typography feel, borders, spacing, accent colors, and progress bars.
- Cursor location relative to visible UI, if known.
- Confidence level and exact unknowns.

If the current model cannot see the screenshots, do not pretend. Use one of these paths:

| Path | When To Use | Required Output |
| --- | --- | --- |
| Vision-capable enrichment | Image input is available. | A concise visual inventory and target map. |
| Browser/DOM enrichment | The target is a browser tab and active-tab context exists. | Route, title, DOM/accessibility summary, element under cursor, viewport, console/page/network issues. |
| Human clarification | The visual target cannot be resolved from available evidence. | One short question with the most likely interpretations. |
| Low-confidence handoff | User explicitly wants to proceed despite weak evidence. | Prominent low-confidence warning and exact missing evidence. |

## Example Failure Case

Transcript:

```text
Can you help me design exactly the same here kind of wanna see this whole set up here but for my app Omni capture so I see my usage
```

Bad output:

```text
The user likely wants a usage dashboard. Inspect screenshots to determine details.
```

Why it is bad:

- It ignores the visible source UI.
- It does not identify what "same" refers to.
- It forces the implementation agent to do OmniCapture's job.
- It cannot produce a recognizably similar result because it extracted no structure.

Good output must say something closer to:

```text
The user is pointing at OpenCode's Go usage/settings page.

Observed UI: dark sparse settings layout, left sidebar navigation, top workspace/account bar, large "GO" product mark, subscription status, Manage Subscription button, instructional callout, three horizontal usage meters for rolling/weekly/monthly usage with reset times, balance-after-limits toggle, and invite/referral section with copy-link field.

Implementation brief: build an OmniCapture usage view modeled on this structure, adapted to capture/product usage: plan/status, capture quota, weekly/monthly usage, reset times, optional overage/balance behavior if the app has it, and referral/invite only if the product already supports it or the user approves it.
```

The good version does not invent implementation files. It does extract visible structure and makes adaptation boundaries explicit.

## Prompt Quality Gate

Reject or regenerate any OmniCapture prompt that matches one of these conditions, unless the user explicitly approves a low-confidence handoff. Low-confidence handoffs must prominently name the missing evidence before the task brief.

| Gate | Reject If | Minimum Passing Bar |
| --- | --- | --- |
| Visual specificity | The prompt contains screenshot paths but no visible UI description. | At least five concrete visible facts from the relevant frames. |
| Target grounding | The user says "this," "that," "here," "same," or points/clicks, but the prompt does not map it to a target. | Target map or explicit unresolved ambiguity. |
| Confidence honesty | The prompt sounds certain while evidence is sparse, untimed, or image-inaccessible. | Confidence and missing-evidence notes are obvious. |
| Implementation usefulness | The coding agent still has to decide what the user meant. | Requested changes are bounded and observable. |
| Style preservation | The prompt copies an external UI blindly into the user's app. | It states what to mirror and what to adapt to the app's visual language. |

Recommended run score:

| Dimension | Weight | Scoring Question |
| --- | --- | --- |
| Visual grounding | 30 | Did it describe the actual source UI accurately? |
| Deictic/cursor alignment | 25 | Did it resolve what "this/here/same" referred to? |
| Task translation | 20 | Did it turn the capture into a clear implementation brief? |
| Uncertainty handling | 15 | Did it avoid fake certainty and ask/block when needed? |
| UX usefulness | 10 | Would a skilled coding agent produce the intended result without re-prompting? |

Below 80/100 is not good enough for a visual UI request. Below 60/100 means OmniCapture was worse than writing the prompt manually.

## UX Principles For The Product Itself

Use these principles when designing OmniCapture features, especially capture, preview, retry, usage, and prompt handoff flows.

| Principle | Product Meaning |
| --- | --- |
| Visibility of system status | The user must know when capture is active, what was captured, when compilation is running, and whether confidence is high or low. |
| Recognition over recall | Show the selected frames, target regions, transcript snippet, and inferred task so the user can recognize whether the system understood. |
| User control and freedom | Always support Retry, Cancel, and manual clarification before sending. Auto-submit must stay opt-in. |
| Aesthetic minimalism | The capture overlay should be nearly invisible. The prompt preview should show only the evidence and choices needed to trust/send. |
| Error prevention | Prevent hallucinated handoffs by blocking when visual evidence is inaccessible or target alignment fails. |
| Privacy by gesture | Collect browser/page context only in response to explicit user invocation, and keep access scoped to the active tab/session. |
| Accessible controls | Interactive controls should meet at least WCAG 2.2 target-size minimums and have clear labels. |

## OpenCode And Agent Usage

OpenCode supports project-specific agents/rules and read-only planning agents. Use that separation intentionally.

- Use read-only exploration before implementation when diagnosing prompt quality or artifact interpretation.
- Use implementation agents only after the visual target, uncertainty, and acceptance criteria are clear.
- Use review/devil's-advocate passes for non-trivial compiler, capture, or handoff changes.
- Never let an implementation agent silently fix the user's request by guessing what the screenshots showed.

## Implementation Rules For This Repo

- Read `PRD.md` before changing product behavior.
- Preserve the project thesis: OmniCapture compiles multimodal intent into coding-agent-ready instructions.
- Do not add heavyweight providers, cloud STT, Whisper, or expand native capture scope unless explicitly approved.
- Do not hardcode OpenCode server URLs, session IDs, user emails, provider credentials, or local absolute paths into source.
- Do not write to `memory/` or `MEMORY.md`.
- Keep changes small, testable, and artifact-first.
- Treat screenshot paths as replay evidence, not as proof of visual understanding.
- Fail loudly at evidence boundaries.

## Research Grounding

Use primary or near-primary sources when changing product rules:

- OpenCode agents docs confirm project agents, permissions, plan/build separation, and subagent workflows: https://opencode.ai/docs/agents
- NN/g usability heuristics support visibility of system status, recognition over recall, user control, minimalist design, and error prevention: https://www.nngroup.com/articles/ten-usability-heuristics/
- Chrome `activeTab` docs support temporary active-tab access triggered by explicit user gestures, matching OmniCapture's privacy model: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- WCAG 2.2 target-size guidance sets a minimum bar for pointer/touch controls: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

Research date for this guidance: 2026-06-12.
