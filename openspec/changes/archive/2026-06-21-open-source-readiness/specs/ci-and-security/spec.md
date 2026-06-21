## ADDED Requirements

### Requirement: CI runs lint, typecheck, and test on every PR

A single `.github/workflows/ci.yml` workflow MUST run on `push` to `main`, on `pull_request`, and on `workflow_dispatch`. The workflow MUST run three sequential jobs: `lint` (oxlint), `typecheck` (`tsc --noEmit`), and `test` (`bun test`) on `ubuntu-latest`. Each job MUST set `permissions: {}` and use SHA-pinned actions.

#### Scenario: PR triggers CI

- **WHEN** a contributor opens a pull request
- **THEN** the `ci.yml` workflow runs
- **AND** the three jobs (`lint`, `typecheck`, `test`) execute in parallel
- **AND** the PR's required-checks list updates with the new run

#### Scenario: Pushing to `main` triggers CI

- **WHEN** a push is made to `main`
- **THEN** the `ci.yml` workflow runs
- **AND** the same three jobs execute

### Requirement: CI cancels stale runs and uses path filters

The `ci.yml` workflow MUST declare a `concurrency` group keyed by `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true`. The workflow MUST skip when the changed files are docs-only (using `dorny/paths-filter` or `paths-ignore`).

#### Scenario: Stale PR run is cancelled

- **WHEN** a contributor pushes a new commit to an open PR
- **THEN** the previous CI run for that PR is cancelled
- **AND** only the latest commit is evaluated

#### Scenario: Docs-only PR skips CI

- **WHEN** a PR changes only `.md` files
- **THEN** the `ci.yml` workflow is skipped
- **AND** no runner minutes are consumed

### Requirement: Dependabot opens weekly dependency PRs

A `.github/dependabot.yml` file MUST configure Dependabot for the `npm` and `github-actions` ecosystems on a weekly schedule.

#### Scenario: Dependabot opens a PR for an outdated dependency

- **WHEN** the weekly schedule fires and an outdated dependency is detected
- **THEN** Dependabot opens a PR titled "Bump <package> from <old> to <new>"
- **AND** the PR runs the same CI checks as a normal PR

### Requirement: Secret scanning and push protection are enabled

The repository MUST have GitHub Secret Scanning enabled. Push Protection MUST be enabled so that commits containing likely secrets are blocked at pre-receive. Both are free on public repositories.

#### Scenario: Commit containing a likely API key is blocked

- **WHEN** a contributor attempts to push a commit containing a string that matches the OpenAI API key pattern
- **THEN** GitHub blocks the push
- **AND** the contributor is shown the secret location and must rotate/remove the secret

#### Scenario: Historical secrets are detected

- **WHEN** secret scanning runs against the repository history
- **THEN** any likely secret is surfaced in the Security tab
- **AND** the user is notified via the security alerts inbox

### Requirement: CodeQL default setup runs on every PR

CodeQL default setup MUST be enabled for JavaScript/TypeScript and Swift. The analysis MUST run on `pull_request` and `push` to `main` and surface findings in the Security tab.

#### Scenario: CodeQL detects a vulnerability in a PR

- **WHEN** a PR introduces code that triggers a CodeQL alert (e.g., path traversal, command injection, unsafe deserialization)
- **THEN** the alert is surfaced in the PR's checks
- **AND** the alert is also listed in the Security tab
