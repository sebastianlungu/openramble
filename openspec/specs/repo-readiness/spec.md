# repo-readiness Specification

## Purpose
TBD - created by archiving change open-source-readiness. Update Purpose after archive.
## Requirements
### Requirement: Repository is MIT-licensed

The repository root MUST contain a `LICENSE` file with the MIT license text, copyright "Open-Ramble contributors" and the current year. The `package.json` MUST declare `"license": "MIT"`. The `README.md` MUST link to the `LICENSE` file in the footer.

#### Scenario: First-time visitor finds the license

- **WHEN** a visitor opens the repository on GitHub
- **THEN** the repository header shows "MIT" as the detected license
- **AND** the `LICENSE` file is reachable from the footer of `README.md`

#### Scenario: npm publish carries the MIT license

- **WHEN** `npm publish` runs from CI
- **THEN** the published `package.json` declares `"license": "MIT"`
- **AND** the npm registry page shows the MIT license

### Requirement: Lockfile is committed and toolchain is pinned

The `bun.lock` file MUST be tracked in git. The `.gitignore` MUST NOT list `bun.lock`. The `package.json` MUST declare a `packageManager` field pinning the Bun version in the form `bun@x.y.z`.

#### Scenario: Contributor clone installs the exact dependency tree

- **WHEN** a contributor clones the repository and runs `bun install`
- **THEN** the installed dependency tree matches the committed `bun.lock`
- **AND** the toolchain version matches the `packageManager` field

#### Scenario: CI installs the exact dependency tree

- **WHEN** the CI workflow runs `bun install`
- **THEN** the installed dependency tree matches the committed `bun.lock`

### Requirement: AGENTS.md is the canonical agent-and-human file

The repository root MUST contain a single `AGENTS.md` file readable by both humans and AI agents. The file MUST follow the AGENTS.md standard (Markdown, no required fields) and MUST include at minimum: project overview, build commands, test commands, code style, contribution flow, release flow, macOS signing identity, and a "do not" section listing forbidden actions.

#### Scenario: AI agent finds AGENTS.md

- **WHEN** an AI coding agent (Claude Code, Cursor, Aider, Goose, OpenAI Codex, etc.) opens the repository
- **THEN** the agent reads `AGENTS.md` before generating code
- **AND** the agent's output respects the documented do/don't rules

#### Scenario: Human contributor finds AGENTS.md

- **WHEN** a human contributor opens the repository for the first time
- **THEN** the `AGENTS.md` is linked from `README.md` and `CONTRIBUTING.md`
- **AND** the file explains how to build, test, and submit a PR

