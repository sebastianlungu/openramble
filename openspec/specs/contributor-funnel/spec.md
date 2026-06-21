# contributor-funnel Specification

## Purpose
TBD - created by archiving change open-source-readiness. Update Purpose after archive.
## Requirements
### Requirement: CONTRIBUTING.md documents the contribution flow

The repository root MUST contain a `CONTRIBUTING.md` file that explains: how to search existing issues, how to file a new issue, the branching model, the commit-message format (conventional commits), the PR title format, how to run tests locally, and how to request review.

#### Scenario: First-time contributor finds the contribution flow

- **WHEN** a first-time contributor opens `CONTRIBUTING.md`
- **THEN** the file explains how to file a bug, file a feature request, branch, commit, run tests, and open a PR
- **AND** the file links to `AGENTS.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`

### Requirement: CODE_OF_CONDUCT.md is the Contributor Covenant v2.1

The repository root MUST contain a `CODE_OF_CONDUCT.md` file with the text of the Contributor Covenant v2.1.

#### Scenario: GitHub community health check passes

- **WHEN** GitHub runs its community health check on the repository
- **THEN** the `CODE_OF_CONDUCT.md` file is detected and the repository is marked as having a community health file

### Requirement: SECURITY.md documents a private disclosure channel

The repository root MUST contain a `SECURITY.md` file that includes: a private disclosure channel (GitHub Security Advisories), a list of supported versions, and a response-time expectation.

#### Scenario: Security researcher finds the disclosure channel

- **WHEN** a security researcher finds a vulnerability
- **THEN** `SECURITY.md` instructs them NOT to file a public issue
- **AND** provides a private disclosure channel (GitHub Security Advisories)

### Requirement: Issue templates enforce structured fields

The `.github/ISSUE_TEMPLATE/` directory MUST contain at least a `bug-report.yml`, a `feature-request.yml`, and a `config.yml` that disables blank issues. The `bug-report.yml` MUST require a description and a reproduction path. The `feature-request.yml` MUST require a problem statement and a proposed solution.

#### Scenario: Bug report requires reproduction

- **WHEN** a user opens a new issue and selects "Bug report"
- **THEN** the form requires a description (non-empty) and a reproduction path
- **AND** the issue cannot be submitted without these fields

#### Scenario: Blank issues are disabled

- **WHEN** a user clicks "New issue" without selecting a template
- **THEN** the user is redirected to the template chooser
- **AND** blank issues are not allowed

### Requirement: PR template enforces verification and AI-authorship signal

The `.github/PULL_REQUEST_TEMPLATE.md` file MUST require: a linked issue (with `Closes #<n>`), a type of change checkbox, a "what does this PR do" section, a "how did you verify your code works" section, and a checklist that includes "I understand this change and can defend it" (the AI-authorship signal).

#### Scenario: PR template surfaces the verification step

- **WHEN** a contributor opens a new PR
- **THEN** the PR body pre-fills the template
- **AND** the "How did you verify" section is visible above the fold

### Requirement: Conventional PR titles are enforced in CI

A CI check MUST verify that the PR title matches the Conventional Commits regex `^(feat|fix|docs|chore|refactor|test|perf|build|ci)(\([a-zA-Z0-9-]+\))?!?:\s.+`. The check MUST use `action-semantic-pull-request` or equivalent.

#### Scenario: Non-conventional PR title is rejected

- **WHEN** a contributor opens a PR with the title "fix the bug"
- **THEN** the `pr-title` CI check fails
- **AND** the PR cannot be merged until the title is changed to e.g. `fix: resolve the bug`

#### Scenario: Conventional PR title passes

- **WHEN** a contributor opens a PR with the title "feat(cli): add --no-preview flag"
- **THEN** the `pr-title` CI check passes

### Requirement: Branch protection on `main` is strict

The `main` branch MUST be protected with: required PR reviews (1 minimum), strict required status checks (`ci / lint`, `ci / typecheck`, `ci / test`, `commit-lint`, `pr-title`), conversation resolution required, linear history required, no force-push, no admin bypass.

#### Scenario: PR cannot merge with failing checks

- **WHEN** any required status check fails on a PR
- **THEN** the "Merge" button is disabled
- **AND** the PR cannot be merged via API or CLI

#### Scenario: Admin cannot bypass protection

- **WHEN** an admin attempts to merge a PR with failing checks using `--admin`
- **THEN** GitHub blocks the merge
- **AND** the required checks must pass first

