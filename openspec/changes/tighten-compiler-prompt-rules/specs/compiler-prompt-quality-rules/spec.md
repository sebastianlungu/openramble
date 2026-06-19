## ADDED Requirements

### Requirement: Visible prompt rejects transcript-foreign hedges
The compiler's quality gate MUST reject any visible prompt that contains hedge phrases the user did not say. Specifically, the gate MUST fail when the visible prompt text (case-insensitive) contains any of: `or a close equivalent`, `or a close equivalent of it`, `based on the visible`, `appears to`, `seems to`. The system prompt MUST state that the Intent line is a tight paraphrase of the spoken intent and MUST NOT introduce softening phrases the user did not say.

#### Scenario: Quality gate rejects "or a close equivalent of it" hedge
- **WHEN** the enricher returns a visible prompt whose `Intent:` line contains `or a close equivalent of it`
- **THEN** the enricher throws an `Enrichment failed quality gate` error
- **AND** the error message names the offending phrase
- **AND** no `visible-prompt.md` is written to disk

#### Scenario: Quality gate rejects "based on the visible" hedge
- **WHEN** the enricher returns a visible prompt containing `based on the visible`
- **THEN** the enricher throws an `Enrichment failed quality gate` error

#### Scenario: Quality gate accepts a tight paraphrase
- **WHEN** the user transcript is `Let's rebuild this for my app`
- **AND** the enricher returns `Intent: Rebuild the visible screen for the user's app.`
- **THEN** the quality gate accepts the prompt
- **AND** `visible-prompt.md` is written to disk

### Requirement: Visible prompt extracts explicit style tokens
The compiler's quality gate MUST require the visible prompt's `Observed:` section to contain at least 3 of the following style tokens as labelled fields: `theme`, `background`, `text`, `font feel`, `density`, `accent`, `borders`. The system prompt MUST instruct the enricher to extract these tokens from the captured frame and to write `not discernible` for any token that cannot be read rather than inventing a value. The `Do:` section's "feel like" design language MUST NOT appear in the visible prompt without an accompanying style-token extraction.

#### Scenario: Quality gate accepts a prompt with three style tokens
- **WHEN** the visible prompt's `Observed:` section contains labelled `theme: dark`, `density: sparse`, `font feel: monospace` fields
- **THEN** the quality gate accepts the prompt on the style-token requirement

#### Scenario: Quality gate rejects a prompt with no style tokens
- **WHEN** the visible prompt's `Observed:` section describes the screen without any of the required style-token labels
- **THEN** the enricher throws an `Enrichment failed quality gate: Observed section missing style tokens` error

#### Scenario: Quality gate accepts a `not discernible` token
- **WHEN** the visible prompt's `Observed:` section contains `accent: not discernible`
- **THEN** the quality gate treats the token as present
- **AND** the prompt is not rejected for the accent token specifically

### Requirement: Do section splits Mirror from Adapt
The compiler's quality gate MUST require the visible prompt's `Do:` section to contain two named sub-sections: `Mirror (structure to copy from the captured UI)` and `Adapt (changes required for the user's app)`. Each sub-section MUST contain at least one bullet. The system prompt MUST instruct the enricher to populate Mirror with named structural elements visible in the captured frame and to populate Adapt with the label, content, or copy changes required so the rebuilt screen fits the user's app. The Do section MUST NOT be a single free-form paragraph.

#### Scenario: Quality gate accepts a properly split Do section
- **WHEN** the visible prompt's `Do:` section contains a `Mirror (structure to copy from the captured UI):` block with one bullet and an `Adapt (changes required for the user's app):` block with one bullet
- **THEN** the quality gate accepts the prompt

#### Scenario: Quality gate rejects a free-form Do paragraph
- **WHEN** the visible prompt's `Do:` section is a single paragraph without `Mirror` and `Adapt` sub-section labels
- **THEN** the enricher throws an `Enrichment failed quality gate: Do section must split Mirror and Adapt` error

#### Scenario: Quality gate rejects a Do section with one side missing
- **WHEN** the visible prompt's `Do:` section contains a `Mirror` block but no `Adapt` block (or vice versa)
- **THEN** the enricher throws the same quality-gate error
- **AND** the error message names the missing side

### Requirement: Capture-chrome phrases are forbidden in the visible prompt
The compiler's quality gate MUST reject any visible prompt that contains the literal phrases `recording pill`, `capture banner`, `capture pill`, or `floating banner`. The system prompt MUST instruct the enricher to treat these as capture-pipeline UI that does not belong in the target brief.

#### Scenario: Quality gate rejects "recording pill"
- **WHEN** the visible prompt's `Observed:` section contains the phrase `recording pill`
- **THEN** the enricher throws an `Enrichment failed quality gate: capture chrome must not appear in the visible prompt` error

#### Scenario: Quality gate rejects "capture banner"
- **WHEN** the visible prompt's `Observed:` section contains the phrase `capture banner`
- **THEN** the enricher throws the same quality-gate error

### Requirement: Degraded runs surface a missing-cursor warning
The CLI MUST emit a one-line warning to the user when the run is started without any cursor events in the run root. The warning MUST name the failure mode (deictic references may be unresolved) and MUST NOT block the run. The warning is user-visible honesty, not a gate.

#### Scenario: Manual CLI run with empty cursor timeline prints the warning
- **WHEN** the user invokes `openvysta compile --transcript ... --screenshots ...` with no `cursor-timeline.json` or with an empty one
- **THEN** the CLI prints `Warning: No cursor events. Deictic references may be unresolved.` before any other output

#### Scenario: Native capture with a non-empty cursor timeline does not print the warning
- **WHEN** the user runs a native capture that produces a non-empty `cursor-timeline.json`
- **THEN** the CLI does NOT print the missing-cursor warning

### Requirement: Pre-enrichment wireframe is removed
The compiler MUST NOT generate the pre-enrichment `visible-prompt.md` template. When the user explicitly disables enrichment with `--enrich false`, the CLI MUST write an empty stub `visible-prompt.md` (or no file) and surface a clear notice that no enriched prompt was produced. The functions `generateVisiblePrompt`, `trimTranscript`, `buildTranscriptEvidence`, and `extractChanges` in `src/compiler/compile.ts` MUST be removed because they only feed the deleted wireframe and have no other callers.

#### Scenario: --enrich false produces no template prompt
- **WHEN** the user invokes `openvysta compile --transcript ... --screenshots ... --enrich false`
- **THEN** the CLI writes an empty `visible-prompt.md` (or no file) at the run root
- **AND** prints a notice that enrichment was skipped

#### Scenario: Default compile flow does not call the removed functions
- **WHEN** the user invokes `openvysta compile` without `--enrich false`
- **THEN** the enricher path is the only producer of `visible-prompt.md`
- **AND** the deleted functions are not referenced anywhere in the codebase
