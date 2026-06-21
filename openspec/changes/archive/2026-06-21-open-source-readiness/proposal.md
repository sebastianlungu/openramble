## Why

Open-Ramble is a small, intentional, build-complete MVP: ~13K lines of TypeScript + Swift, 110+ tests, a real PRD, a real `AGENTS.md`, and a working `/sign` skill for the macOS helper. The product is well-positioned to go open source, but the repository itself is not yet shaped for public consumption. The current `TODO-opensource.md` lists 13 blockers; this change implements Tier A (the non-negotiable floor) plus the parts of Tier B (release automation, OIDC npm publishing, signed macOS artifact) that fit a one-week execution budget. Without this work, the first outside contributor lands in a repo with no license, no lockfile, no CI, and no way to verify the code works.

## What Changes

- **Add `LICENSE` (MIT)** and `package.json#license` so the code is legally usable.
- **Commit `bun.lock` and pin Bun** in `package.json#packageManager` so installs are reproducible and the macOS helper's dependency surface is auditable.
- **Add `AGENTS.md` at the repo root** as the canonical agent-and-human file, following the AGENTS.md standard stewarded by the Linux Foundation Agentic AI Foundation.
- **Add contributor-funnel files**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1), `SECURITY.md`, `.github/ISSUE_TEMPLATE/{bug-report,feature-request,config}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`.
- **Add a single `ci.yml`** at `.github/workflows/ci.yml` running `lint` (oxlint), `typecheck` (`tsc --noEmit`), and `test` (`bun test`) on `ubuntu-latest` for `push` to `main`, `pull_request`, and `workflow_dispatch`. Concurrency group cancels stale runs. SHA-pinned actions. `permissions: {}` at workflow level. Path-filter skips docs-only changes.
- **Enable repo security defaults**: Dependabot for `npm` + `github-actions` ecosystems on weekly cadence, secret scanning + push protection, CodeQL default setup for JS/TS and Swift.
- **Enforce conventional commit PR titles** in CI via `action-semantic-pull-request`. This unlocks release-please for free.
- **Configure branch protection on `main`**: strict required checks (`ci / lint`, `ci / typecheck`, `ci / test`, `commit-lint`, `pr-title`), linear history, conversation resolution, no admin bypass.
- **Configure `release-please`** with a GitHub App installation token (not the default `GITHUB_TOKEN`). Bot opens a Release PR from conventional commits; merging creates a GitHub Release + tag.
- **Add `macos-release.yml`** at `.github/workflows/macos-release.yml` listening for `released` events. It builds the helper via `apps/macos-helper/install.sh`, signs with Developer ID, notarizes via `notarytool`, packages a `.dmg`, and uploads it as a release asset.
- **Switch npm publish to OIDC trusted publishing** with `--provenance`. No long-lived `NPM_TOKEN` secret. `id-token: write` only on the publish job.

## Capabilities

### New Capabilities

- `repo-readiness`: foundational repo files (LICENSE, lockfile, AGENTS.md) that make the source legally usable, reproducible, and agent-friendly.
- `contributor-funnel`: contribution docs, issue and PR templates, branch protection, conventional PR title enforcement. The minimum bar for accepting outside PRs.
- `ci-and-security`: GitHub Actions CI on PRs plus the GitHub-native security defaults (Dependabot, secret scanning + push protection, CodeQL).
- `release-pipeline`: end-to-end release automation — release-please bot, GitHub App identity, OIDC npm trusted publishing, signed-and-notarized macOS `.dmg` artifact.

### Modified Capabilities

None. This change does not modify the compiler, the OpenCode bridge, the macOS helper source, or any existing product spec.

## Impact

- **New files**: `LICENSE`, `AGENTS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/{bug-report,feature-request,config}.yml`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/workflows/ci.yml`, `.github/workflows/macos-release.yml`, `.github/dependabot.yml`, `.github/release-please-config.json`, `.github/.release-please-manifest.json`, `.github/labeler.yml`, `.github/stale.yml`, `.opencodesec-allowlist.yml` (if needed).
- **Modified files**: `package.json` (license, packageManager pin), `.gitignore` (remove `bun.lock`), `README.md` (tighten prerequisites, supported macOS version, exact OpenCode setup, reproducible first run).
- **GitHub-side configuration** (not stored in the repo, but required for the change to be complete): install the GitHub App for release-please, enable Dependabot, enable secret scanning + push protection, enable CodeQL default setup, configure branch protection on `main`, configure OIDC trusted publishing on npm.
- **Apple-side configuration** (required, not in repo): Developer ID Application certificate stored as a base64-encoded `p12` in the `APPLE_CERTIFICATE_P12` secret, App Store Connect API key in `APPLE_API_KEY_P8` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER_ID`. The user has already stated they will reuse the existing `Open-Ramble Dev` identity and accept the implications.
- **No product behavior change.** The compiler, the bridge, the redaction, the enricher quality gate, and the macOS helper source are untouched. The macOS helper is *not* wired into the CLI in this change; the public `.dmg` ships a working capture helper that opens a setup window, asks for permissions, and waits for the wiring work (a future change).
