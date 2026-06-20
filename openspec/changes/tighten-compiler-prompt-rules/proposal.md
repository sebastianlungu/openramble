## Why

The compiler's visible prompt is leaking quality debt into the user-facing brief. A representative run with a 7-word transcript (`Hey yo let's rebuild this all right`) produced a ~290-word prompt that: (a) added hedges the user did not say ("or a close equivalent of it", "based on the visible layout"), (b) extracted Open-Ramble's own capture overlay as a feature of the target UI, (c) treated content from a sidebar task title as structural UI facts, (d) used a "feel like" design-language paragraph the downstream coding agent cannot act on, and (e) left a "do" instruction that conflates "what to mirror" with "what to adapt." The 5-section prompt structure is sound; the *enforcement* is shallow. This change tightens the existing compiler rules and removes dead code so the same input produces a measurably better brief — without expanding the product surface.

The change is **a refactor**, not a feature addition. New behavior comes from tightening existing rules and reformatting existing structures. Project-context discovery is deliberately **out of scope** for this change; it will be a follow-up.

## What Changes

- **Forbid transcript-foreign hedges** in the enricher system prompt + quality gate. Phrases like "or a close equivalent of it", "based on the visible layout", "appears to", "seems to" are added to the existing forbidden-phrase list. The system prompt rule "Quote or tightly paraphrase the spoken intent" becomes enforceable.
- **Split the Do section into Mirror and Adapt.** The current free-form Do paragraph is replaced with two named sub-sections: `Mirror (structure to copy)` and `Adapt (changes required)`. The quality gate checks both literals and at least one bullet under each.
- **Extract visual style tokens in Observed.** The Observed section is reformatted to require a fixed set of style tokens (theme, background, text, font feel, density, accent, borders). Quality gate requires at least 3 of the 7 tokens. Replaces the existing "layout, labels, controls, state, style" guidance.
- **Reject capture-chrome in the visible prompt.** The existing forbidden-phrase list gains `recording pill`, `capture banner`, `capture pill`, `floating banner`. The downstream coding agent can no longer be told to "rebuild" Open-Ramble's own capture overlay.
- **Delete the dead pre-enrichment wireframe** in `src/compiler/compile.ts:77-114` (`generateVisiblePrompt`). Trace the call sites: the wireframe is only the final visible prompt when `--enrich false` is passed, and is otherwise overwritten by the blocker report or never reached. Deletion is pure negative-LOC and removes a small bug where the wireframe mislabels raw transcript text as "Observed".
- **Surface degraded runs honestly.** When `cursorEvents` is empty (e.g. a manual CLI run with no native capture), emit a one-line warning to the user that deictic references may be unresolved. Pure user-visible honesty, 1 line.

## Capabilities

### New Capabilities

- `compiler-prompt-quality-rules`: The set of rules the compiler enforces on the visible prompt — forbidden phrases, style-token extraction, Mirror/Adapt structure, capture-chrome rejection — and the user-visible degradation warning when cursor events are missing.

### Modified Capabilities

None. There are no existing capabilities with REQUIREMENTS at the spec level being changed. The change is implemented as tightening rules inside the existing `enrichPrompt` function and removing dead code in `compile.ts`.

## Impact

- **Code**:
  - `src/compiler/enricher.ts:25-59` — tighten system prompt: replace generic Observed guidance with the style-token format, split Do into Mirror/Adapt, add explicit hedge-forbidden rule.
  - `src/compiler/enricher.ts:161-209` — extend `assertEnrichedPromptQuality`: enforce forbidden hedges, require ≥3 style tokens in Observed, require both `Mirror` and `Adapt` literals with ≥1 bullet each in Do, add capture-chrome phrases to forbidden list.
  - `src/compiler/compile.ts:77-114` — delete `generateVisiblePrompt` (and the related `trimTranscript`, `buildTranscriptEvidence`, `extractChanges` helpers if no longer referenced). On `--enrich false` write an empty stub `visible-prompt.md`.
  - `src/index.ts:296-297` — add a one-line `console.warn` when `cursorEvents.length === 0`.
  - `src/__tests__/enricher.test.ts` — add regression tests: hedge rejection, style-token gate, Mirror/Adapt gate, capture-chrome rejection. Existing tests already cover the structural shape and the blank-screen paths.
  - `src/__tests__/compiler.test.ts` — remove tests for `generateVisiblePrompt` and helpers that go with it.
- **Behavior**:
  - The visible prompt format changes from `Do: <paragraph>` to `Do: Mirror: ... / Adapt: ...`. OpenCode receives the new format on next send.
  - The forbidden-phrase list grows by 8 phrases (4 hedge phrases, 4 capture-chrome phrases). Anything in the visible prompt matching these fails the quality gate and the run is blocked; the user sees a clear error.
  - A new warning appears in the CLI output when cursor events are empty.
  - Net LOC: **negative**. System prompt changes are reformat. Quality-gate changes are additions to existing arrays and predicates. The wireframe deletion is `-~38 LOC` net.
- **Data**: None. No schema changes. No artifact format changes.
- **APIs / dependencies**: None. The CLI surface is unchanged.
- **PRD**: Aligns with PRD §9 Visual Grounding Contract and AGENTS.md Prompt Quality Gate. Does not change any PRD-level requirement; it makes an existing one (the "Quote or tightly paraphrase" rule) enforceable for the first time.
- **Out of scope (deferred to a follow-up change)**: project-context discovery (`--context auto|file:<path>`), post-enrichment scoring against the AGENTS.md scorecard, the Swift `SCContentFilter` exclusion of the Open-Ramble capture banner in `ScreenCapture.swift`. None of these are required for this change to ship.
