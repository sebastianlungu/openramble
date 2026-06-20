## Context

The compiler in `src/compiler/enricher.ts` issues a single system prompt to the OpenCode `plan` agent, asking it to produce a 5-section visible prompt (Intent, Observed, Target, Do, Acceptance). The accompanying `assertEnrichedPromptQuality` in `src/compiler/enricher.ts:161-209` checks for forbidden phrases, a minimum word count, and a UI-term vocabulary count. The system prompt and the gate were drafted together; in practice the system prompt is the soft contract and the gate is the hard contract. The gap between them is the surface area this change targets.

The current `compile.ts:77-114` ships a pre-enrichment wireframe that traces to one call site: `--enrich false`. On every other path the wireframe is overwritten by the validation blocker or never reached. It is dead code that also mislabels the raw transcript as "Observed" — a small bug that the deletion will close. The change is a refactor: tighten the rules, remove the dead code, do not expand the public surface.

The Swift `SCContentFilter` exclusion of the Open-Ramble capture banner in `apps/macos-helper/Sources/OpenRamble/ScreenCapture.swift` is **out of scope** for this change. It will be a follow-up. For the manual CLI flow, the visible-prompt forbidden-phrase list is sufficient.

Project-context discovery (`--context auto|file:<path>`) is **out of scope** for this change. It will be a follow-up. Without it, the user must speak their app's context into the transcript (e.g. "rebuild this for my Open-Ramble capture screen"). The current change does not require project context to ship.

## Goals / Non-Goals

**Goals:**

- Tighten `ENRICHMENT_SYSTEM_PROMPT` and `assertEnrichedPromptQuality` so that the visible prompt's hedges, structure, and capture-chrome contamination are mechanically rejected instead of trusted to the model.
- Make every new rule enforceable: a phrase that is forbidden in the system prompt must be in the gate's forbidden list, and a structure the system prompt requires must be in the gate's structure check.
- Delete `generateVisiblePrompt` and its helpers in `compile.ts` and replace the `--enrich false` path with an empty stub and a clear notice. Net negative LOC.
- Emit a one-line warning when `cursorEvents` is empty so the user knows the prompt is degraded.
- Keep the existing 5-section structure (`Intent`, `Observed`, `Target`, `Do`, `Acceptance`); the change is *how* the sections are populated, not the structure itself.

**Non-Goals:**

- Add a new public CLI flag, env var, or input type.
- Change the artifact contract (no new files in the run root, no schema changes).
- Touch the macOS helper Swift code (the `SCContentFilter` exclusion is a separate change).
- Add a post-enrichment quality scorer against the AGENTS.md scorecard (a separate change).
- Add project-context discovery (`--context auto|file:<path>` is a separate change).
- Change the enricher's `plan` agent choice or model selection logic.

## Decisions

### Decision 1: Reframe the change as rule-tightening, not feature addition

The user constraint was: "refactor and negative LOC, don't just add." Every change here is either a reformat of an existing string (system prompt, gate list), a new entry in an existing array (forbidden phrases), or a deletion (wireframe). No new public surface, no new files, no new flags. The acceptance criteria in `tasks.md` will measure this with a "before/after LOC" check.

**Alternatives considered:**

- *Add a new "prompt quality scorer" pass after enrichment.* Rejected — out of scope and a much bigger change.
- *Add a new project-context discovery step.* Rejected — deferred per user.
- *Add a new "Refine" preview action.* Rejected — out of scope; belongs to a UX overhaul change.

### Decision 2: Forbid specific phrases, not a category

The gate currently has a small forbidden list (e.g. "inspect the screenshot"). Adding 8 more phrases (4 hedges, 4 capture-chrome) keeps the gate simple and avoids the false positives of a category match. The phrases are case-insensitive substring matches. The system prompt is updated to mirror the forbidden list so the model sees the rules before the gate enforces them.

**Alternatives considered:**

- *Forbid a regex category like `\bappears to\b`.* Rejected — too easy to evade with paraphrase; substring match is what the existing gate does and is consistent.
- *Forbid "any hedge-y phrasing" with a sentiment heuristic.* Rejected — adds a dependency, the model would fight it, and the four chosen phrases cover the actual surface area observed in the bug report.

### Decision 3: Style tokens are labels, not a schema

The Observed section must contain at least 3 of 7 labelled tokens (`theme:`, `background:`, `text:`, `font feel:`, `density:`, `accent:`, `borders:`). The tokens are checked as labelled fields in the gate (regex match `^<token>:`), not as a structured schema. This keeps the visible prompt a free-form text the downstream coding agent can read, while making the extraction mechanically checkable.

**Alternatives considered:**

- *Output the Observed section as a JSON block in the visible prompt.* Rejected — the visible prompt is a brief for a human reader (the OpenCode agent), not structured data.
- *Generate a separate `style-tokens.json` artifact.* Rejected — expands the artifact contract for marginal value.

### Decision 4: Mirror/Adapt is a structure check, not a content check

The gate requires both `Mirror` and `Adapt` literal headers in the Do section, each followed by at least one bullet. It does not check that the Mirror bullets are structural or that the Adapt bullets are labels — that is still the model's job. The structure check is sufficient to force the split without false-positive rejections.

**Alternatives considered:**

- *Score Mirror bullets against a structural-keyword list and Adapt bullets against a content-keyword list.* Rejected — false positives are easy (a Mirror bullet like "right sidebar with task labels" contains "labels" which is a content keyword) and the split itself is the win.
- *Drop the Acceptance section entirely and replace it with Mirror/Adapt bullets.* Rejected — the 5-section structure is in PRD §9; the change does not re-open that.

### Decision 5: Delete the wireframe outright

`generateVisiblePrompt` in `compile.ts:77-114` and its three helpers (`trimTranscript`, `buildTranscriptEvidence`, `extractChanges`) have one call site (`compile()` at line 206) and that call site is only reached with `--enrich false`. Every other path overwrites the wireframe or exits before reaching it. Deletion is safe and removes the mislabeled-raw-transcript-as-Observed bug. The `--enrich false` path writes an empty stub `visible-prompt.md` and prints a notice.

**Alternatives considered:**

- *Wire the wireframe up as a real fallback on enricher failure.* Rejected — the wireframe as it stands is not a useful brief and would actively harm a coding agent if shown to one. A real fallback would be its own change.
- *Keep the wireframe but rename "Observed" to "Source text" in it.* Rejected — partial fix; the rest of the wireframe is still thin filler.

### Decision 6: Cursor warning is a one-liner, not a gate

The validation gate stays as-is. The new warning is a `console.warn` line printed at `src/index.ts:296-297` when `cursorEvents.length === 0` and a timeline file is present (i.e. native capture produced nothing, or the manual flow wrote an empty array). The warning is user-visible honesty; it does not block the run, because a missing cursor is a normal state for the manual CLI flow.

**Alternatives considered:**

- *Block the run when cursor events are empty and the transcript contains deictic words.* Rejected — too aggressive for the manual flow where the user is explicitly providing screenshots. The warning is the right escalation level.
- *Auto-disable enrichment and fall back to the wireframe when cursor events are empty.* Rejected — the wireframe is being deleted in this same change.

## Risks / Trade-offs

- **Risk:** the new forbidden-phrase list may reject legitimate phrasings (e.g. a model that legitimately needs to say "this screen appears to be a settings page" because the user typed that and the Observed is faithfully reproducing it).
  - **Mitigation:** the gate's forbidden list is applied to the visible prompt as a whole, not to individual sections. The existing `assertEnrichedPromptQuality` already does whole-text forbidden-phrase checks. If a real user transcript legitimately contains "appears to", the Observed can include it via the workaround of putting it in a quoted transcript block, but the gate is intentionally strict. A future change can split the forbidden list per section if this becomes a real-world problem.

- **Risk:** the new Mirror/Adapt structure may produce awkward prompts when the captured UI is genuinely a single element (e.g. "rebuild this button") rather than a full screen.
  - **Mitigation:** the Mirror block can contain a single element ("a single primary button, top-right of the page") and the Adapt block can contain a single change ("change the label to 'Subscribe'"). The split is structurally enforced but the bullets are still free-form.

- **Risk:** the style-token gate (≥3 of 7) is shallow; a model that writes three labels and then invents the rest of the Observed would pass.
  - **Mitigation:** the existing gate still requires the Observed section to be ≥8 words and to contain ≥2 of the structural UI-term list. The style tokens are additive; the existing checks remain.

- **Risk:** deleting the wireframe breaks a user who relied on `--enrich false` to ship a manual prompt to OpenCode.
  - **Mitigation:** the wireframe was a near-empty template (transcript-into-Intent, transcript-into-Observe, transcript-into-Do as numbered lines). A user who disabled enrichment had nothing useful to ship. The notice makes the change explicit.

- **Risk:** the no-cursor warning is a permanent line of noise for users on the manual CLI flow.
  - **Mitigation:** the warning is one line, names the failure mode, and helps the user understand why their prompt is degraded. It is the cheapest possible honesty.

- **Trade-off:** the change tightens the contract between the model and the gate, but does not address the deeper problem that a 7-word transcript cannot produce a high-confidence brief no matter how tight the gate is. That problem requires either project context (deferred) or user-provided richer transcripts (not in scope for code).

## Migration Plan

1. Land the change behind the existing CLI surface — no new flags, no new env vars, no new artifacts. Users running `open-ramble compile` with the same arguments see a stricter visible prompt and, in the worst case, a quality-gate error if the model produces a forbidden phrase.
2. If a real production user reports a legitimate use case that the new rules reject, the gate is one file (`enricher.ts:161-209`) and the forbidden list is a literal array — adjustment is a one-line change.
3. Rollback is a single revert. The change is a refactor of an existing function; there is no schema, no data migration, and no on-disk state.

## Open Questions

- Should the Style Tokens block be a separate section in the visible prompt (e.g. `## Style tokens` after `## Observed`) or inlined into the Observed paragraph? The spec currently allows either. Recommendation: inlined as labelled fields, because the visible prompt is a brief for a human reader and a separate section breaks the 5-section structure that PRD §9 specifies. Revisit if a real prompt shows the inline form is awkward.
- Should the deictic-without-cursor condition also block the run (not just warn)? The current proposal is "warn, not block," because the manual CLI flow is a primary use case. Revisit after a release of the change sees real usage.
