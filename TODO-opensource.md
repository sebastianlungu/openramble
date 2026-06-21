# Open Source Readiness — 12/100

## Current State

- No hardcoded secrets, paths, or credentials
- ~13K lines of source code (TypeScript + Swift)
- 100+ test cases
- Evals with scoring framework
- `.gitignore` is clean

## Blockers

| Blocker | Severity | Status |
|---|---|---|
| LICENSE | Critical | Missing. Legally, no one can use it. |
| README | Critical | Missing. Nobody knows what this is. |
| CI/CD | Critical | No GitHub Actions. No way to verify code works. |
| CONTRIBUTING.md | High | No contribution guide. |
| Issue/PR templates | High | None. |
| macOS code signing | High | App won't open on other Macs without notarization. |
| Setup/install docs | High | No instructions to run locally. |
| npm package | Medium | Not published. |
| Product docs | Medium | Need the public docs to stay aligned with the narrowed speech/screenshot/cursor contract. |
| API docs | Medium | No docs on compiler interface, schemas, or CLI. |
| Example tasks | Medium | None yet. |
| Security policy | Medium | No SECURITY.md. |
| Changelog | Low | None. |
| Code of Conduct | Low | None. |

## Minimum to Open Source (8-16 hours)

1. Pick a license (MIT or AGPLv3 depending on your goals)
2. Write a 200-line README: what it is, screenshot, quickstart, architecture
3. Add GitHub Actions CI (build TS, run tests, build Swift)
4. Add `CONTRIBUTING.md`
5. Package the macOS helper clearly and keep the browser/DOM purge reflected in public docs
6. Add `.github/ISSUE_TEMPLATE` and `PULL_REQUEST_TEMPLATE.md`

The code itself is publishable. The packaging and docs are not.

## In Progress — Open-Source Readiness (branch `feat/open-source-readiness`)

**Status (2026-06-21).** All 9 in-scope tasks landed on `feat/open-source-readiness`. The change has been archived to `openspec/changes/archive/2026-06-21-open-source-readiness/`. The remaining work is human-driven, not code-driven, and is listed under "Open follow-ups" below.

### Landed on the branch (9 commits on top of `main`)

- `790e802` — chore: add MIT license, commit `bun.lock`, pin bun toolchain, extend `AGENTS.md`
- `4ec493c` — ci: add `lint`, `typecheck`, `test`, and `pr-title` checks
- `ffa94da` — docs: add `CONTRIBUTING`, `CoC`, `SECURITY`, issue and PR templates
- `e22b738` — ci: add Dependabot config for `npm` and `github-actions` ecosystems
- `66f6a34` — ci: add CodeQL config for `javascript-typescript` and `swift`
- `7891605` — ci: add `release-please` workflow, config, manifest, and validation test
- `e18a6f0` — ci: add macOS release pipeline (sign + notarize + DMG upload)
- `e5b7b94` — ci: add npm publish `--provenance` step to `release-please` workflow
- `5535f17` — docs: tighten `README.md` Quick start, add Community section, finalize `AGENTS.md`

### Source repo blockers — resolved by this change

- `LICENSE` (MIT) at the repo root, `package.json#license = "MIT"`.
- `bun.lock` is tracked; `bun` is pinned in `package.json#packageManager`.
- `AGENTS.md` is the canonical agent-and-human file at the repo root.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1), `SECURITY.md` are in place.
- `.github/ISSUE_TEMPLATE/{bug-report,feature-request,config}.yml` and `.github/PULL_REQUEST_TEMPLATE.md` exist.
- CI runs `lint` (oxlint), `typecheck` (`tsc --noEmit`), `test` (`bun test`) on `ubuntu-latest` for `push` to `main`, `pull_request`, and `workflow_dispatch`. `pr-title` enforces conventional commits. Stale runs are cancelled; docs-only changes skip the heavy jobs. Actions are SHA-pinned and `permissions: {}` at the workflow level.
- Dependabot opens weekly PRs for `npm` and `github-actions`.
- `release-please` opens Release PRs from conventional commits using a GitHub App identity. Merging creates a GitHub Release with a `v<version>` tag.
- `.github/workflows/macos-release.yml` runs on `released` events on `macos-14`, builds the helper via `apps/macos-helper/install.sh`, signs with Developer ID, notarizes via `notarytool`, and uploads `open-ramble-macos-x64.dmg` and `open-ramble-macos-arm64.dmg` as release assets.
- `release-please.yml` publishes to npm with `--provenance` using OIDC (`id-token: write`); no long-lived `NPM_TOKEN` is required once the OIDC binding is created.
- `README.md` links to `AGENTS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `LICENSE`; Quick start names the Bun version, supported macOS version, and the `npm install -g open-ramble` install path.

### Public macOS `.dmg` blockers — partially resolved

- The `macos-release.yml` workflow is in place and tested via a unit test that asserts the workflow shape.
- The repo-side configuration is complete.
- Apple-side secrets (`APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`) and the `Open-Ramble Dev` Developer ID Application certificate are the only things blocking the first end-to-end `.dmg` build.
- Full end-to-end product wiring (helper → CLI integration) is a separate product change and is **not** in scope for this branch.

### Open follow-ups (human, in order)

1. **Make the repository public.** Settings → General → Danger Zone → Change repository visibility → Make public. This unlocks secret scanning, push protection, and branch protection on the Free plan. **Irreversible.**
2. **Enable CodeQL default setup.** Settings → Code security and analysis → Code scanning → Set up → Default. The `.github/codeql/codeql-config.yml` file is already on the branch and will be picked up.
3. **Verify / enable secret scanning and push protection.** Both should auto-enable once the repo is public; toggle them on if not.
4. **Apply branch protection on `main`.** 1+ required review, strict required checks (`ci / lint`, `ci / typecheck`, `ci / test`, `pr-title`), conversation resolution, linear history, no force-push, no admin bypass.
5. **Provision Apple-side secrets** in repo Settings → Secrets and variables → Actions: `APPLE_CERTIFICATE_P12` (base64 of the `Open-Ramble Dev` Developer ID Application `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_API_KEY_P8` (App Store Connect API key), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`.
6. **First npm publish (one-time, manual).** npm requires a manual publish before OIDC trusted publishing can be bound. Create a one-time `NPM_TOKEN` classic automation token, publish locally, then delete the secret.
7. **Bind the OIDC trusted publisher** on the `open-ramble` npm package: GitHub Actions, owner `open-ramble` (or `sebastianlungu`), repository `open-ramble`, workflow filename `release-please.yml`.
8. **Cut the first real Release PR** by merging a conventional commit to `main`. The merged Release PR triggers `macos-release.yml` (when the Apple-side secrets exist) and the OIDC npm publish (when the trusted-publisher binding exists). Verify the `Provenance` badge on npm and the `.dmg` on the GitHub Release.
9. **Smoke-test the `.dmg`** on a clean Mac: open the downloaded `.dmg`, drag `Open-Ramble.app` to `/Applications`, launch it, confirm Gatekeeper accepts the notarized binary.

### Tier C — still deferred, still not blocking

- Homebrew tap, Windows + Linux binaries, Sparkle updater (`latest-mac.yml`), `skills/` directory, `CODEOWNERS`, OpenSSF Scorecard, SBOM, multi-locale README, vouch system, `CONTEXT.md` glossary.
- A product change to wire the macOS helper into the CLI; that lives in a separate OpenSpec change.

### Verification

- `bun test` is 135/135 on the branch.
- `git log --oneline main..feat/open-source-readiness` shows the 9 commits listed above.
- The full handoff is in `docs/hoff/2026-06-21-open-source-readiness-handoff.md`; the manual-step transcript is in `docs/hoff/2026-06-21-open-source-readiness-handoff-appendix.md` (not staged, in `.gitignore`).
