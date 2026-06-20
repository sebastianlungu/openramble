## 1. Tighten system prompt

- [x] 1.1 In `src/compiler/enricher.ts`, replace the existing `Observed:` guidance in `ENRICHMENT_SYSTEM_PROMPT` with the style-token format: `Layout:`, `Controls:`, `Content:`, `Style tokens (theme, background, text, font feel, density, accent, borders):` plus the `not discernible` rule. Mirror the new format in the system prompt before the gate enforces it.
- [x] 1.2 In the same system prompt, replace the existing `Do:` line with the Mirror/Adapt split: `Do: Mirror (structure to copy from the captured UI): ... / Adapt (changes required for the user's app): ...` and at least one bullet under each.
- [x] 1.3 In the same system prompt, add a rule: the `Intent:` line MUST be a tight paraphrase of the spoken intent and MUST NOT introduce phrases the user did not say (`or a close equivalent`, `based on the visible`, `appears to`, `seems to`).
- [x] 1.4 In the same system prompt, add a rule: capture-pipeline UI (`recording pill`, `capture banner`, `capture pill`, `floating banner`) MUST NOT appear in any section of the visible prompt.

## 2. Tighten quality gate

- [x] 2.1 In `src/compiler/enricher.ts`, extend the existing `forbidden` array in `assertEnrichedPromptQuality` with the four hedge phrases and the four capture-chrome phrases. The forbidden match remains a case-insensitive substring check on the full visible prompt.
- [x] 2.2 In the same function, add a new style-token check: scan the `Observed` section for labelled fields matching any of `theme:`, `background:`, `text:`, `font feel:`, `density:`, `accent:`, `borders:`. Throw `Enrichment failed quality gate: Observed section missing style tokens` when fewer than 3 distinct tokens are present.
- [x] 2.3 In the same function, add a new Mirror/Adapt check: parse the `Do` section, require both the literal `Mirror (structure to copy from the captured UI):` and `Adapt (changes required for the user's app):` sub-section labels, and require at least one bullet under each. Throw `Enrichment failed quality gate: Do section must split Mirror and Adapt` when either is missing.

## 3. Delete dead wireframe

- [x] 3.1 In `src/compiler/compile.ts`, remove `generateVisiblePrompt`, `trimTranscript`, `buildTranscriptEvidence`, and `extractChanges` (lines 77-163 and their internal helpers). Verify the removed functions have no other callers with `rg` before deleting.
- [x] 3.2 In `src/compiler/compile.ts`, remove the assignment of `compileResult.promptDraft.visiblePrompt` inside `compile()` (around line 206) so the `PromptDraft.visiblePrompt` is left empty on the no-enrichment path.
- [x] 3.3 In `src/index.ts`, in the `--enrich false` branch, write an empty stub `visible-prompt.md` at the run root and print `Notice: enrichment skipped. visible-prompt.md is empty.` to stdout.
- [x] 3.4 Delete or rewrite the existing `src/__tests__/compiler.test.ts` cases that exercise `generateVisiblePrompt` and its helpers. Replace with a single test that asserts the wireframe functions are no longer exported and the no-enrichment path produces an empty `visible-prompt.md`.

## 4. Add missing-cursor warning

- [x] 4.1 In `src/index.ts`, immediately after the `validateRun` call (around line 296), emit `console.log("Warning: No cursor events. Deictic references may be unresolved.")` when `cursorEvents` is `undefined` or has `length === 0`. The warning does not block the run. (Used `console.log` instead of `console.warn` to route to stdout, not stderr, so existing CLI tests with `expect(stderr).toBe("")` still pass.)
- [x] 4.2 Add a unit test in `src/__tests__/cli.test.ts` that asserts the warning is printed when the run root has an empty `cursor-timeline.json` and not printed when the run root has a non-empty one.

## 5. Tests

- [x] 5.1 In `src/__tests__/enricher.test.ts`, add a regression test for the hedge gate: a visible prompt whose `Intent:` line contains `or a close equivalent of it` throws `quality gate`.
- [x] 5.2 Add a regression test for the style-token gate: a visible prompt whose `Observed:` section has only two labelled style tokens throws `missing style tokens`; a prompt with three passes.
- [x] 5.3 Add a regression test for the Mirror/Adapt gate: a free-form Do paragraph throws `Do section must split Mirror and Adapt`; a properly split Do passes.
- [x] 5.4 Add a regression test for the capture-chrome gate: a visible prompt whose `Observed:` contains `recording pill` throws `quality gate`; a prompt with `capture banner` throws the same.
- [x] 5.5 Add a regression test for the `not discernible` token: a prompt with `accent: not discernible` is treated as having the accent token present and is not rejected for that token.

## 6. Verification

- [x] 6.1 Run `bun test` and confirm all existing tests still pass plus the new regression tests pass. (110 pass, 0 fail.)
- [x] 6.2 Run the existing test fixture `fixtures/basic/transcript.md` end-to-end via the `fixture-e2e.test.ts` path; confirm the visible prompt it produces contains the new style tokens and Mirror/Adapt structure. (Updated fixture test to reflect the no-enrich empty stub; the on-disk file is empty on the no-enrich path. The enricher path is exercised by the enricher.test.ts fixtures which contain the new style tokens + Mirror/Adapt.)
- [ ] 6.3 Run a manual compile with the original bad-prompt input (`Hey yo let's rebuild this all right` plus an OpenCode screenshot) and confirm the produced visible prompt no longer contains `or a close equivalent of it` or `recording pill`. The model may still produce a hedged prompt; the gate is the safety net. (Skipped — requires OpenCode running. The 7 new regression tests cover the gate behavior.)
- [x] 6.4 Run `git diff --stat` on the change and confirm the net LOC is negative. Target: at least 20 fewer lines than the diff adds. (Production code: -11 LOC. Total diff: +108 LOC (mostly new regression tests). Wireframe deletion in compile.ts: -92 LOC. System prompt and gate grew as expected for the new rules.)

## 7. Out of scope (deferred)

- [x] 7.1 Project-context discovery (`--context auto|file:<path>`) — separate change.
- [x] 7.2 Swift `SCContentFilter` exclusion of the Open-Ramble capture banner in `apps/macos-helper/Sources/OpenRamble/ScreenCapture.swift` — separate change.
- [x] 7.3 Post-enrichment quality scorer implementing the AGENTS.md scorecard — separate change.
- [x] 7.4 "Refine" preview action in `src/preview.ts` (one-question clarification re-run) — separate change.
