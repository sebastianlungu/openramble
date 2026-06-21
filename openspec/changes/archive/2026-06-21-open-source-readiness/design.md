## Context

Open-Ramble is a build-complete MVP for a multimodal intent compiler. The compiler and OpenCode bridge work end-to-end. The macOS native capture helper is scaffolded but not yet wired into the CLI (per `README.md` line 194). The repo is at `a96d6f1` on `main`, single-author, `~13K` lines of TypeScript + Swift, `110/110` tests passing locally via `bun test`. The PRD, `AGENTS.md`, and the `/sign` skill are already strong. The current `TODO-opensource.md` lists 13 blockers; this change implements Tier A and the parts of Tier B that fit a one-week execution budget.

External constraints locked in the brainstorm:

- Outcome: **public source + signed macOS app**, audience: **open community**, budget: **~1 focused work-week**.
- License: **MIT** (matches the brand choice; `LICENSE` file at the repo root).
- Conventional commits: **enforced in CI on PR titles from day one** via `action-semantic-pull-request`. This unlocks `release-please` for free.
- Release cadence: **continuous via `release-please`**, GitHub App identity (not the default `GITHUB_TOKEN`, not a long-lived PAT).
- Distribution: **npm only** (no Homebrew tap in this change).
- AI posture: **welcome AI-assisted PRs with a human-authorship signal** (the PR template asks for a verification step and a screenshot/recording where relevant).
- macOS signing: **reuse the existing `Open-Ramble Dev` Developer ID**; the user accepts the personal-identity implication.

External context: `anomalyco/opencode@dev` (177k★) is the contemporary gold standard for a Bun-monorepo dev tool — 27 workflow files, a deny-by-default `OPENCODE_PERMISSION` contract, a canonical `AGENTS.md`, signed + notarized release pipelines (Azure Trusted Signing on Windows, App Store Connect on macOS), and AUR + Homebrew tap. We are not copying OpenCode; we are taking the **floor** of that bar (Tier A) and the **expected** slice (Tier B) that fits a one-week budget. Detailed benchmark in `docs/research_oss_devops_benchmark/`.

## Goals / Non-Goals

**Goals:**

- Make the source legally usable, reproducible, agent-friendly, and verifiable on every PR.
- Enable `npm install -g open-ramble` and `bunx open-ramble ...` to work for a first-time user, with a notarized macOS `.dmg` attached to the same GitHub Release.
- Reach the 2026 minimum bar for an open community repo (LICENSE, lockfile, CI, conventional commits, security defaults, contributor funnel, AGENTS.md).
- Reach the 2026 expected bar for release engineering (release-please, OIDC trusted publishing, signed macOS artifact, branch protection).
- Produce a single, easy-to-execute plan a senior dev can ship in ~5 focused work-days + 1-2 days of buffer.

**Non-Goals:**

- Wiring the macOS helper into the CLI. That is a separate product change. The public `.dmg` in this release ships a working capture helper that opens a setup window, asks for permissions, and waits for the wiring work (a future change). This is documented in the user-facing release notes.
- Homebrew tap. Distribution is npm only.
- Windows + Linux binaries. Out of scope for this change.
- LLM-driven standards bots, slash commands, scoped LLM permissions, OpenSSF Scorecard, SBOM, multi-locale README, vouch system, `CONTEXT.md` glossary. All Tier C; revisit after the community actually generates real noise.
- Renaming the Swift module / package identity. The rename to `Open-Ramble` already landed in `2ef471d`. No further rename work in this change.
- Any compiler, bridge, or helper source-code change.

## Decisions

### D1. License is MIT, not Apache-2.0, not AGPLv3, not BSL.

Rationale: matches OpenCode's choice, lowest friction for adoption, and a clean fit for a CLI tool. AGPLv3 was rejected because it would deter commercial adoption of the macOS helper. Apache-2.0 was rejected because the patent grant is marginal value for this codebase. BSL was rejected because "source-available but commercially restricted" is not open source.

### D2. Commit `bun.lock`; remove it from `.gitignore`; pin Bun in `package.json#packageManager`.

Rationale: reproducible installs are the single most important property for a public CLI. `bun install` against a `^1.16.2` range on a contributor's machine can resolve to a different tree than the maintainer's. Pinning via `bun.lock` plus a `packageManager` field makes the toolchain explicit. This is also what the `oven-sh/setup-bun@v2` action reads.

Alternatives considered: keep the lockfile ignored and rely on `packageManager` only (rejected — `packageManager` only pins the toolchain, not the dependency tree); use `bunfig.toml#install.exact = true` (rejected — too aggressive, would require pinning every transitive dep; OpenCode uses this with a curated allowlist for monorepos, not a fit for a single-package CLI).

### D3. Single `ci.yml`, not per-signal files.

Rationale: OpenCode uses 27 files, but OpenCode is a Bun monorepo with a Storybook, Nix flake, Tauri updater, LLM bots, and a vouch system. For a single-package TypeScript CLI with `lint + typecheck + test`, one file is enough. If we add a Swift test signal in a future change, we add `swift.yml` then — not now.

Alternatives considered: per-signal split (`lint.yml`, `typecheck.yml`, `test.yml`) for the same reason some repos do it (faster partial reruns, easier code review per file). Rejected because we have no reusable workflows and no merge-queue to optimize for. The 3 signals together on `ubuntu-latest` finish in <2 minutes.

### D4. SHA-pinned actions + `permissions: {}` at workflow level.

Rationale: tag-pinned actions (`@v4`) are a documented supply-chain attack surface (the `tj-actions/changed-files` incident in March 2025). SHA-pinning with a `# vX.Y.Z` comment gives the same upgrade path with a real diff to review. `permissions: {}` is the default-deny posture GitHub recommends for third-party PRs.

### D5. Concurrency group cancels stale PR runs; default is per-PR, per-sha.

Rationale: matches the 2026 standard (Vite, Next.js, OpenCode). Prevents a contributor's later push from being evaluated against an old tree. Push runs are keyed by `sha` so concurrent pushes do not cancel each other.

### D6. Dependabot over Renovate.

Rationale: Dependabot is the GitHub-native default, zero cost, and sufficient for a single-package CLI. Renovate is the right pick if PR volume or per-package schedule matters; neither applies here. If PR noise becomes a real problem, we can switch later — the config files live in different places.

### D7. release-please with a GitHub App, not the default `GITHUB_TOKEN`, not a PAT.

Rationale: the default `GITHUB_TOKEN` cannot trigger downstream workflows. The macOS release pipeline (Shape A) needs to fire on a `released` event, and that requires the Release to be created by an actor with `Contents: Write` and `Pull requests: Write` — a GitHub App. A PAT is technically possible but is a long-lived secret in a secret manager, which fails the OIDC posture for the npm half of the pipeline.

Setup cost: ~30 minutes to register the App, install it on the repo, and store the private key as `RELEASE_PLEASE_APP_PRIVATE_KEY`. Documented in `tasks.md`.

Alternatives considered: classic PAT scoped to the repo (rejected: long-lived secret, blocks OIDC trusted publishing downstream); default `GITHUB_TOKEN` (rejected: blocks the macOS pipeline).

### D8. macOS pipeline is Shape A: `release-please` creates the release, `macos-release.yml` listens for `released` events and attaches the `.dmg`.

Rationale: clean separation between the npm publish (release-please's job) and the macOS artifact (the macOS runner's job). The `.dmg` lands in the same GitHub Release as the npm tarball, atomically from the user's perspective. If Apple notarization is slow or fails, the npm publish still ships, and the `.dmg` upload is retried as a separate run.

Alternatives considered: Shape B (single tag-triggered workflow). Rejected because it requires the maintainer to remember to `git tag` and `git push --tags`; we lose continuous releases. Shape C (release-please owns the macOS build too). Rejected because it couples the macOS pipeline to npm versioning, and Apple's notarytool can take several minutes — coupling would delay or fail npm publishes.

### D9. Reuse the existing `Open-Ramble Dev` Developer ID, not a new `Open-Ramble` ID.

Rationale: the user has decided to accept the personal-identity implication. The `/sign` skill already imports a `p12` from `APPLE_CERTIFICATE_P12` and an App Store Connect API key from `APPLE_API_KEY_P8` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER_ID`. The CI workflow reuses the same secret names. If the cert or key changes, both `/sign` and the new `macos-release.yml` pick it up.

Implication: the public notarized `.dmg` will be tied to the user's personal Apple ID. If the user ever loses the cert or transfers ownership, the public artifact breaks. Documented in the release notes and in the AGENTS.md section on signing.

### D10. OIDC trusted publishing for npm, with `--provenance`.

Rationale: long-lived `NPM_TOKEN` is the most common credential leak in OSS. OIDC trusted publishing replaces the secret with a short-lived OIDC token issued by GitHub Actions. The token is automatically rotated, scoped to the package, and cannot be exfiltrated. The `--provenance` flag produces a Sigstore-signed attestation that the artifact came from this repo's CI.

Setup cost: ~15 minutes to configure the npm trusted publisher in the package settings. `id-token: write` is added to the `publish` job only.

### D11. Strict branch protection on `main`, no admin bypass.

Rationale: matches the 2026 standard. Required checks: `ci / lint`, `ci / typecheck`, `ci / test`, `commit-lint`, `pr-title`. Linear history. Conversation resolution. No force-push. No admin bypass. The user can still push to a `dev` branch and merge with `--admin` if a real emergency happens — that path is not removed, it is just not a default.

### D12. AGENTS.md is one canonical file at the repo root.

Rationale: the AGENTS.md standard is stewarded by the Linux Foundation Agentic AI Foundation and is consumed by 60k+ repos, including OpenCode, OpenAI Codex, Cursor, Aider, Goose, Devin, Gemini CLI, Claude Code. One file, no vendor overlays. If a vendor needs a specific filename, it is their job to read `AGENTS.md` and symlink.

Content: the file is the source of truth for both humans and agents. It will be extracted from the existing `AGENTS.md` (which is already a model of intent) with the open-source-specific additions: contribution flow, release flow, macOS pipeline, codeowners, signing identity.

## Risks / Trade-offs

- **Risk:** the macOS pipeline is new infrastructure. First run on the real `macos-14` runner will likely fail. → **Mitigation:** tasks 5.1-5.6 are explicit dry-run, debug, and re-run steps. Buffer day at the end of the week absorbs this.
- **Risk:** Apple notarization can take 1-15 minutes and occasionally fail with a generic "unable to notarize" error. → **Mitigation:** upload includes `--wait` and a 10-minute timeout. The run is idempotent; a re-run re-attaches the `.dmg` if the first one failed mid-upload.
- **Risk:** release-please opens a Release PR on first push; if the user has not yet configured the GitHub App, the bot PR will be opened by the user's account and will fail to push tags. → **Mitigation:** tasks 4.1-4.4 explicitly install the App and verify with a `--dry-run` push before going live.
- **Risk:** conventional PR title enforcement breaks the existing commit history style (`a96d6f1 chore: mark rename change complete`). → **Mitigation:** the existing history is already conventional-compat. The new rule only applies to new PR titles; the existing history is grandfathered.
- **Risk:** OIDC trusted publishing requires the package to be already published at least once with the old `NPM_TOKEN` workflow. → **Mitigation:** documented in tasks. First publish uses the existing manual `NPM_TOKEN`; the second publish uses OIDC; subsequent publishes are OIDC-only.
- **Risk:** `bun.lock` may contain versions of `@opencode-ai/sdk` that the user does not want to expose publicly. → **Mitigation:** the audit in task 1.5 explicitly checks the lockfile for any non-redistributable dependency. If found, the task stops and surfaces the issue.
- **Risk:** strict branch protection blocks the user's own first merge to `main` if any required check is flaky. → **Mitigation:** the first push to `main` is in task 3.5 and is a deliberate dry-run to surface any flakiness before protection is enforced.
- **Trade-off:** the macOS helper ships a non-functional public `.dmg` (it opens a setup window and waits for the wiring). → **Trade-off accepted** because the user explicitly chose this. The release notes document it; the README documents it; the AGENTS.md documents it. The wiring is the user's first v0.2 PR.
- **Trade-off:** one `ci.yml` file instead of per-signal files. → **Trade-off accepted** because the 3 signals together are <2 minutes and the file is <80 lines. If we add Swift or e2e, we split then.
- **Trade-off:** Dependabot's noisier PR cadence over Renovate's grouping. → **Trade-off accepted** because the project is small enough that a weekly PR per ecosystem is not a problem.

## Migration Plan

This is a greenfield open-source release. There is no existing public artifact to migrate. The internal "staging" steps are:

1. Day 1: foundation (LICENSE, lockfile, AGENTS.md, branch protection dry-run).
2. Day 2: CI green on first push.
3. Day 3: contributor funnel and security defaults.
4. Day 4: release-please and AGENTS.md content.
5. Day 5: macOS pipeline and OIDC npm.
6. Buffer: failures, re-runs, Apple approval if needed, npm trusted publisher setup.

Rollback strategy per change:

- **LICENSE / lockfile / AGENTS.md / contributor files / `ci.yml` / Dependabot / CodeQL / branch protection**: trivial revert. Each is a single commit.
- **release-please config**: trivial revert. Disable the workflow file, run `git tag` manually for the next cut.
- **`macos-release.yml`**: trivial revert. Delete the file. The next release just won't have a `.dmg`.
- **OIDC trusted publishing**: revert by re-enabling the manual `NPM_TOKEN` workflow. The npm package's "trusted publisher" config can be removed in the npm web UI.

Public timeline (target):

- **Day 6**: tweet/announce. Repo is public. `npm install -g open-ramble` works. macOS `.dmg` is downloadable from the latest release.
- **Day 7**: monitor issues and PRs. Adjust templates if the first 3 issues reveal a missing field.

## Open Questions

- **Q1: Is the public repo name `open-ramble` (kebab-case, matches npm) or `Open-Ramble` (Title-Case, matches the brand)?** The current local repo is `open-ramble` on disk; the package name is `open-ramble`; the CLI is `open-ramble`. The display name is `Open-Ramble`. The GitHub repo is `open-ramble/open-ramble` by convention, but the user may prefer `openramble/open-ramble` or `Open-Ramble/Open-Ramble`. **Decision needed before Day 1.**
- **Q2: Should the README ship a "Roadmap" section, or is the existing PRD enough?** The PRD is internal-by-convention. The README is public. A short "Roadmap" link to the PRD, or a "Status" section copied from the PRD, would help a first-time visitor. **Decision needed before Day 3.**
- **Q3: `prisma/agent-skills` ships `SKILL.md` files for the Bun runtime, Swift concurrency, etc. Do we want to ship our own `skills/` folder, or rely on the upstream skills being installed at the agent level?** Open-Ramble's PRD is unique (multimodal intent compiler, visual grounding contract, OpenCode bridge). Skills like `swift-concurrency` and `bun-runtime` would be useful but are not specific to Open-Ramble. **Decision: defer. Ship `AGENTS.md` only in this change; add `.opencode/skills/` in a v0.2 change if a contributor friction signal appears.**
- **Q4: Does the user want a `CODEOWNERS` file, or is that overkill for a single-author repo?** OpenCode's CODEOWNERS is intentionally narrow (`packages/app/`, `packages/desktop/` only). For a single-author repo, CODEOWNERS is a no-op. **Decision: defer until a second author joins.**
- **Q5: Should the macOS pipeline also publish a `latest-mac.yml` for a future Sparkle/Tauri in-app updater, or is that out of scope?** A future-proofed `latest-mac.yml` is ~10 lines of YAML and is required for in-app auto-update. **Decision: out of scope for v0.1; revisit when the helper is wired into the CLI.**
