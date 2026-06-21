## 1. Day 1 — Foundation

- [ ] 1.1 Add `LICENSE` (MIT) at the repo root with copyright "Open-Ramble contributors" and the current year.
- [ ] 1.2 Add `"license": "MIT"` to `package.json`. Verify `bun pm pkg get license` prints `MIT`.
- [ ] 1.3 Remove `bun.lock` from `.gitignore` and commit the existing `bun.lock` to the repo.
- [ ] 1.4 Add a `packageManager` field to `package.json` pinning the Bun version (e.g. `"bun@1.2.18"`). Verify with `bun --version`.
- [ ] 1.5 Audit `bun.lock` for any non-redistributable dependency. If found, stop and surface the issue.
- [ ] 1.6 Create `AGENTS.md` at the repo root. Start from the existing `AGENTS.md` content; add the open-source-specific sections: contribution flow, release flow, macOS signing identity, do/don't rules.
- [ ] 1.7 Verify Day 1: `git status` shows the new `LICENSE`, the now-tracked `bun.lock`, and `AGENTS.md`. `bun test` still passes locally.

## 2. Day 2 — CI Green on First Push

- [ ] 2.1 Add `.github/workflows/ci.yml` with `permissions: {}`, SHA-pinned actions, and three jobs: `lint` (oxlint), `typecheck` (`tsc --noEmit`), `test` (`bun test`) on `ubuntu-latest`.
- [ ] 2.2 Add a `concurrency` group keyed by `${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true`.
- [ ] 2.3 Add `dorny/paths-filter` to skip the `lint`, `typecheck`, and `test` jobs when only `.md` files changed.
- [ ] 2.4 Add `action-semantic-pull-request` as a fourth job (`pr-title`) that checks the PR title against the conventional-commits regex.
- [ ] 2.5 Open a test PR (e.g. a docs-only change) and verify all four jobs run, the docs-only path skips the lint/typecheck/test jobs, and `pr-title` passes on a conventional title.
- [ ] 2.6 Re-run with a non-conventional title and verify `pr-title` fails.
- [ ] 2.7 Verify Day 2: a non-trivial PR shows four green checks; a docs-only PR shows one green check; a non-conventional title shows a red `pr-title`.

## 3. Day 3 — Contributor Funnel and Security Defaults

- [ ] 3.1 Add `CONTRIBUTING.md` at the repo root. Link to `AGENTS.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`. Include the branching model, commit-message format, test instructions, and PR title format.
- [ ] 3.2 Add `CODE_OF_CONDUCT.md` (Contributor Covenant v2.1 verbatim).
- [ ] 3.3 Add `SECURITY.md` with GitHub Security Advisories as the disclosure channel, the supported-versions list, and a 7-day response-time expectation.
- [ ] 3.4 Add `.github/ISSUE_TEMPLATE/bug-report.yml` (requires description + reproduction), `feature-request.yml` (requires problem + proposed solution), and `config.yml` (disables blank issues).
- [ ] 3.5 Add `.github/PULL_REQUEST_TEMPLATE.md` with the linked-issue field, type-of-change checkbox, "what does this PR do", "how did you verify", and the AI-authorship-signal checklist item.
- [ ] 3.6 Add `.github/dependabot.yml` for `npm` and `github-actions` ecosystems on a weekly schedule.
- [ ] 3.7 (GitHub-side, not in repo) Enable Secret Scanning + Push Protection in the repository's Code Security settings.
- [ ] 3.8 (GitHub-side, not in repo) Enable CodeQL default setup for JavaScript/TypeScript and Swift in the repository's Code Security settings.
- [ ] 3.9 (GitHub-side, not in repo) Configure branch protection on `main`: required reviews (1), strict required status checks (`ci / lint`, `ci / typecheck`, `ci / test`, `pr-title`), conversation resolution, linear history, no force-push, no admin bypass.
- [ ] 3.10 Verify Day 3: a test PR is blocked from merge with failing `pr-title`; Secret Scanning blocks a test commit containing a fake OpenAI key; Dependabot opens its first PR within 24 hours.

## 4. Day 4 — release-please and AGENTS.md Content

- [ ] 4.1 (GitHub-side) Register a GitHub App named `open-ramble-release-bot`. Grant `Contents: Write` and `Pull requests: Write`. Install on the repository. Store the private key as `RELEASE_PLEASE_APP_PRIVATE_KEY` in repository secrets. Store the App ID as `RELEASE_PLEASE_APP_ID`.
- [ ] 4.2 Add `.github/workflows/release-please.yml` using `googleapis/release-please-action@v4` with `app-id: ${{ secrets.RELEASE_PLEASE_APP_ID }}` and `private-key: ${{ secrets.RELEASE_PLEASE_APP_PRIVATE_KEY }}`.
- [ ] 4.3 Add `.github/release-please-config.json` with `package-name: open-ramble`, `package-version: 0.1.0`, `changelog-path: CHANGELOG.md`, `release-type: node`.
- [ ] 4.4 Add `.github/.release-please-manifest.json` with `{".": "0.1.0"}`.
- [ ] 4.5 Push a test commit to a `dev` branch to verify release-please opens a Release PR. Merge the Release PR. Verify a GitHub Release is created.
- [ ] 4.6 Verify the Release event triggers the `released` filter (check the Actions tab — no `macos-release.yml` run yet because that file doesn't exist).
- [ ] 4.7 Update `AGENTS.md` with the release flow, the macOS signing identity, and the AI-authorship posture.
- [ ] 4.8 Update `README.md` to link to `AGENTS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`; tighten the prerequisites (Bun version, OpenCode setup); document the supported macOS version; document the install command and the `.dmg` download path.
- [ ] 4.9 Verify Day 4: a fresh push to `main` opens a Release PR within 5 minutes; merging creates a GitHub Release; `AGENTS.md` is linked from `README.md`.

## 5. Day 5 — macOS Pipeline and OIDC npm

- [ ] 5.1 (Apple-side, not in repo) Confirm the `Open-Ramble Dev` Developer ID Application certificate is exported as a `p12` with a known password. Store as `APPLE_CERTIFICATE_P12` (base64-encoded) and `APPLE_CERTIFICATE_PASSWORD` in repository secrets.
- [ ] 5.2 (Apple-side, not in repo) Confirm the App Store Connect API key (`AuthKey_XXXXXX.p8`) is stored as `APPLE_API_KEY_P8`, with `APPLE_API_KEY_ID` and `APPLE_API_ISSUER_ID` in repository secrets.
- [ ] 5.3 Add `.github/workflows/macos-release.yml` triggered by `on.release.types: [published]` on `macos-14`. Steps: checkout, install Bun, install helper via `apps/macos-helper/install.sh`, import cert with `apple-actions/import-codesign-certs@v2.0.0`, sign, notarize with `notarytool --wait`, package `.dmg`, upload via `softprops/action-gh-release@v2`.
- [ ] 5.4 Dry-run: create a test GitHub Release and verify the macOS workflow runs, signs, notarizes, and uploads a `.dmg`. Verify the `.dmg` opens on a clean Mac and the helper launches.
- [ ] 5.5 (npm-side) In the npm package settings for `open-ramble`, add a trusted publisher: `Repository: open-ramble/open-ramble`, `Workflow filename: release-please.yml`.
- [ ] 5.6 Update `.github/workflows/release-please.yml` to add `permissions: id-token: write` on the `release-please` job and pass `--provenance` to the publish step.
- [ ] 5.7 Cut a real release by merging the next Release PR. Verify: the npm package is published with `npm view open-ramble`; the GitHub Release has the `.dmg` attached; the npm page shows a "Provenance" badge.
- [ ] 5.8 Verify Day 5: a fresh end-to-end release produces a working `.dmg` and a working npm package, both atomically from a single merged Release PR.

## 6. Buffer — Re-runs, Apple Delays, and Cleanup

- [ ] 6.1 Monitor the first three real releases. If Apple notarization is slow, add `--timeout 15m` to `notarytool` calls and document the expected wait.
- [ ] 6.2 (Optional, only if the first release is green) Add `actions/labeler.yml` for path-based auto-labeling and `actions/stale.yml` for stale-issue cleanup. Both are out of the one-week plan but cheap to add.
- [ ] 6.3 (Optional, only if the first release is green) Add `gitleaks` as a pre-commit hook or a CI step. Document the allowlist in `.gitleaksignore`.
- [ ] 6.4 Run the verification suite from `design.md` Migration Plan: confirm `npm install -g open-ramble` works on a clean machine; confirm the `.dmg` opens on a clean Mac.
- [ ] 6.5 Write the public announcement: a short blog post, a tweet, a Hacker News submission. Link to the README, the AGENTS.md, and the first GitHub Release.
- [ ] 6.6 Archive this change via `/opsx-archive` once the first public release is shipped and CI is green on `main`.
