# Contributing to Open-Ramble

Thanks for your interest in Open-Ramble. This guide covers the contribution flow, branching model, commit format, and PR expectations. Read it end-to-end before opening your first PR.

## Code of conduct

All participants are bound by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to its terms.

## Reporting vulnerabilities

Please **do not** file a public issue for security vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md) to report privately.

## Filing an issue

Open-Ramble uses GitHub issue templates. Pick the template that best matches your situation:

- **Bug report** — something is broken or behaves incorrectly.
- **Feature request** — you want to propose a new behavior or change.

Blank issues are disabled. If neither template fits, open a discussion or reach out via the channels listed in [README.md](README.md).

When filing a bug, please include:

- A clear description of the problem and its impact.
- Steps to reproduce (transcript, screenshots, CLI flags, OpenCode version).
- Expected vs actual behavior.
- Your environment (Bun version, macOS version, OpenCode server version).

## Development setup

Prerequisites:

- [Bun](https://bun.sh) 1.3.x (see `package.json#packageManager`).
- macOS 14+ if you plan to build the native capture helper at `apps/macos-helper/`.
- An OpenCode server reachable at `http://localhost:4096` (default).

Local setup:

```bash
bun install
bun test
```

Useful scripts:

```bash
bun run open-ramble   # run the CLI from source
bun run proof         # opencode-bridge proof
bunx oxlint .         # lint
bunx tsc --noEmit     # typecheck
```

For a deeper read on agent rules, project structure, and product philosophy, see [AGENTS.md](AGENTS.md).

## Branching model

- Branch off `main`.
- Use one of these branch prefixes: `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`, `test/`, `perf/`, `build/`, `ci/`.
- Keep branches short and descriptive: `feat/cursor-timeline-warning`, `fix/redact-jwt-bearer`, not `my-changes`.

## Commit and PR title format

Open-Ramble uses **Conventional Commits** for both commit messages and PR titles. The CI enforces the PR title via `amannn/action-semantic-pull-request`.

Format:

```
<type>(<optional-scope>)<optional !>: <subject>
```

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`. Scope is optional but recommended for product modules (e.g. `compiler`, `opencode-bridge`, `macos-helper`).

Examples:

- `feat(compiler): add style-token mirror gate`
- `fix(redact): catch jwt bearer with trailing slash`
- `chore: bump @opencode-ai/sdk to 1.17.0`

The `!` marks a breaking change. Add a `BREAKING CHANGE:` footer explaining the impact.

PR titles feed `release-please`. Bad PR titles block the release.

## Pull request process

1. Find or open an issue describing the problem. PRs without a linked issue are reviewed but not merged until an issue exists.
2. Create a branch from `main` using the naming above.
3. Make your change. Add or update tests for any behavior change.
4. Verify locally before pushing: `bun test`, `bunx oxlint .`, `bunx tsc --noEmit`.
5. Open the PR using `.github/PULL_REQUEST_TEMPLATE.md`. Fill in every section. Link the issue with `Closes #<n>`.
6. CI must be green: `ci / lint`, `ci / typecheck`, `ci / test`, `commit-lint`, `pr-title`.
7. 1+ reviewer approval. Conversation resolution required. No force-push after review starts.
8. Squash-merge once the branch is green and reviewed.

## AI-assisted contributions

AI-assisted PRs are welcome. The PR template requires a human-authorship signal: **"I understand this change and can defend it."** A PR opened by a bot without a human in the loop is a closing offense. The human author is the one who clicks Merge.

## Release flow

`main` is the source of truth. Conventional commits on `main` drive a `release-please` Release PR. Merging the Release PR creates a GitHub Release and tag `v<version>`, which triggers the macOS pipeline to attach a signed `.dmg` and publishes the npm tarball via OIDC trusted publishing. See [AGENTS.md](AGENTS.md#release-flow-open-source) for the full flow.

## Style and conventions

- Linter: `oxlint` (run via `bunx oxlint .`). No ESLint, no Prettier.
- Type checker: `tsc --noEmit`. Strict mode is on.
- Imports: ESM, prefer named exports for new modules.
- Filenames: `kebab-case`.
- Max file size: 500 lines. Max function size: 50 lines. Max parameters: 4. Max cyclomatic complexity: 10. Split functions that exceed these limits.
- No comments unless asked. Self-explanatory code > commented code.

## Need help?

- Read [AGENTS.md](AGENTS.md) for project philosophy, build commands, and product rules.
- Open a discussion or issue if you're stuck.
- Be patient. Maintainers are volunteers. We'll get back to you.
